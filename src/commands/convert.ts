import type { ArgsDef, CommandDef } from 'citty'
import type { LcfRecord } from '../codec/engine.ts'
import type { EngineVersion } from '../index.ts'
import type { EncodingSource, EngineSource, LcfFileKind } from './resolve.ts'
import { Buffer } from 'node:buffer'
import { readFileSync, writeFileSync } from 'node:fs'
import { defineCommand } from 'citty'
import { bytesEqual } from '../codec/bytes.ts'
import { LcfError } from '../codec/errors.ts'
import { createTranscoder } from '../encoding.ts'
import { describeFileContext, LCF_CODECS, lcfFileKind, parseEngineFlag, resolveFileContext } from './resolve.ts'

/** The self-describing JSON document `convert` writes; converting back needs no flags. */
interface JsonEnvelope {
  format: LcfFileKind
  engine: EngineVersion
  encoding: string
  data: LcfRecord
}

export interface ConvertResult {
  outputPath: string
  format: LcfFileKind
  engine: EngineVersion
  engineSource: EngineSource
  encoding: string
  encodingSource: EncodingSource
  /** Whether re-encoding the JSON document reproduces the source file byte for byte (LCF→JSON only). */
  isByteIdentical?: boolean
}

export interface ConvertOptions {
  output?: string
  engine?: string
  encoding?: string
}

function decodeLcf(bytes: Uint8Array, kind: LcfFileKind, engine: EngineVersion, encoding: string): LcfRecord {
  return LCF_CODECS[kind].decode(bytes, { engine, transcoder: createTranscoder(encoding) })
}

function encodeLcf(record: LcfRecord, kind: LcfFileKind, engine: EngineVersion, encoding: string): Uint8Array {
  return LCF_CODECS[kind].encode(record, { engine, transcoder: createTranscoder(encoding) })
}

function stringifyEnvelope(envelope: JsonEnvelope): string {
  const json = JSON.stringify(
    envelope,
    (_key, value: unknown) => value instanceof Uint8Array ? Buffer.from(value).toString('base64') : value,
    2,
  )
  return `${json}\n`
}

function parseEnvelope(jsonText: string, filePath: string): JsonEnvelope {
  let parsedValue: unknown
  try {
    parsedValue = JSON.parse(jsonText)
  }
  catch (error) {
    throw new LcfError(`${filePath} is not valid JSON: ${(error as Error).message}`)
  }
  const envelope = parsedValue as Partial<JsonEnvelope>
  const hasValidShape = envelope !== null && typeof envelope === 'object'
    && (envelope.format === 'lmu' || envelope.format === 'ldb' || envelope.format === 'lmt' || envelope.format === 'lsd')
    && (envelope.engine === '2k' || envelope.engine === '2k3')
    && typeof envelope.encoding === 'string'
    && envelope.data !== null && typeof envelope.data === 'object'
  if (!hasValidShape)
    throw new LcfError(`${filePath} is not an lcfkit JSON document (expected format, engine, encoding, and data keys)`)
  reviveUnknownChunks(envelope.data)
  return envelope as JsonEnvelope
}

/** JSON carries `_unknown` chunk bytes as base64 strings; restore them to Uint8Array. */
function reviveUnknownChunks(value: unknown): void {
  if (Array.isArray(value)) {
    for (const element of value)
      reviveUnknownChunks(element)
  }
  else if (value !== null && typeof value === 'object') {
    const record = value as LcfRecord
    if (Array.isArray(record._unknown)) {
      record._unknown = record._unknown.map((chunk: { id: number, bytes: string }) => ({
        id: chunk.id,
        bytes: new Uint8Array(Buffer.from(chunk.bytes, 'base64')),
      }))
    }
    for (const [key, element] of Object.entries(record)) {
      if (key !== '_unknown')
        reviveUnknownChunks(element)
    }
  }
}

function lcfOutputPath(inputPath: string, format: LcfFileKind): string {
  const strippedPath = inputPath.replace(/\.json$/i, '')
  return lcfFileKind(strippedPath) === format ? strippedPath : `${strippedPath}.${format}`
}

export function convertFile(inputPath: string, options: ConvertOptions = {}): ConvertResult {
  if (/\.json$/i.test(inputPath)) {
    const envelope = parseEnvelope(readFileSync(inputPath, 'utf8'), inputPath)
    const engine = options.engine === undefined ? envelope.engine : parseEngineFlag(options.engine)
    const encoding = options.encoding ?? envelope.encoding
    const outputPath = options.output ?? lcfOutputPath(inputPath, envelope.format)
    writeFileSync(outputPath, encodeLcf(envelope.data, envelope.format, engine, encoding))
    return {
      outputPath,
      format: envelope.format,
      engine,
      engineSource: options.engine === undefined ? 'envelope' : 'flag',
      encoding,
      encodingSource: options.encoding === undefined ? 'envelope' : 'flag',
    }
  }

  const kind = lcfFileKind(inputPath)
  if (kind === undefined)
    throw new LcfError(`Unsupported file extension – expected .lmu, .ldb, .lmt, .lsd, or .json: ${inputPath}`)
  const bytes = new Uint8Array(readFileSync(inputPath))
  const { engine, engineSource, encoding, encodingSource } = resolveFileContext(inputPath, bytes, kind, options)
  const envelope: JsonEnvelope = { format: kind, engine, encoding, data: decodeLcf(bytes, kind, engine, encoding) }
  const outputPath = options.output ?? `${inputPath}.json`
  writeFileSync(outputPath, stringifyEnvelope(envelope))
  const isByteIdentical = bytesEqual(encodeLcf(envelope.data, kind, engine, encoding), bytes)
  return { outputPath, format: kind, engine, engineSource, encoding, encodingSource, isByteIdentical }
}

export interface ConvertArgs extends ArgsDef {
  input: { type: 'positional', description: string, required: true }
  output: { type: 'string', alias: string, description: string }
  engine: { type: 'string', description: string }
  encoding: { type: 'string', description: string }
}

const convertArgs: ConvertArgs = {
  input: { type: 'positional', description: 'Path to a .lmu/.ldb/.lmt/.lsd or .json file', required: true },
  output: { type: 'string', alias: 'o', description: 'Output path (defaults next to the input)' },
  engine: { type: 'string', description: 'Engine version: 2k or 2k3 (overrides detection)' },
  encoding: { type: 'string', description: 'Text encoding, e.g. Shift_JIS or 1252 (overrides detection)' },
}

export const convertCommand: CommandDef<ConvertArgs> = defineCommand({
  meta: {
    name: 'convert',
    description: 'Convert an LCF file (.lmu/.ldb/.lmt/.lsd) to JSON, or a JSON document back to LCF',
  },
  args: convertArgs,
  run({ args }) {
    const result = convertFile(args.input, { output: args.output, engine: args.engine, encoding: args.encoding })
    console.error(`${args.input} → ${result.outputPath}`)
    console.error(`  ${describeFileContext(result)}`)
    if (result.isByteIdentical === false)
      console.error('  warning: converting back will not reproduce the source byte for byte – check --engine and --encoding')
  },
})
