import type { ArgsDef, CommandDef } from 'citty'
import type { LcfRecord } from '../codec/engine.ts'
import type { LcfFileKind } from '../codec/formats.ts'
import type { EngineVersion, WarningSink } from '../index.ts'
import type { EncodingSource, EngineSource } from './resolve.ts'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { defineCommand } from 'citty'
import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras'
import { bytesEqual } from '../codec/bytes.ts'
import { LcfError } from '../codec/errors.ts'
import { decodeLcfFile, encodeLcfFile, LCF_FORMATS, lcfFormatFor } from '../codec/formats.ts'
import { createTranscoder } from '../encoding.ts'
import { writeFilesAtomically } from './atomic-write.ts'
import { describeFileContext, flagHints, parseEngineFlag, resolveFileContext } from './resolve.ts'

/** The self-describing JSON document `convert` writes; converting back needs no flags. */
interface JsonEnvelope {
  format: LcfFileKind
  engine: EngineVersion
  encoding: string
  data: LcfRecord
}

export interface ConvertResult {
  outputPath: string
  /** Where a pre-existing LCF target was moved before overwriting (JSON→LCF only). */
  backupPath?: string
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
  /** Overwrite an existing JSON output (LCF targets are backed up instead). */
  isForce?: boolean
  onWarning?: WarningSink
}

function decodeLcf(bytes: Uint8Array, kind: LcfFileKind, engine: EngineVersion, encoding: string, onWarning?: WarningSink): LcfRecord {
  return decodeLcfFile<LcfRecord>(bytes, LCF_FORMATS[kind], { engine, transcoder: createTranscoder(encoding), onWarning })
}

function encodeLcf(record: LcfRecord, kind: LcfFileKind, engine: EngineVersion, encoding: string): Uint8Array {
  return encodeLcfFile(record, LCF_FORMATS[kind], { engine, transcoder: createTranscoder(encoding) })
}

function stringifyEnvelope(envelope: JsonEnvelope): string {
  const json = JSON.stringify(
    envelope,
    (_key, value: unknown) => value instanceof Uint8Array ? uint8ArrayToBase64(value) : value,
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
    throw new LcfError(`${filePath} is not an rpgrt JSON document (expected format, engine, encoding, and data keys)`)
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
      record._unknown = record._unknown.map((chunk: unknown) => {
        const { id, bytes, beforeId } = (chunk ?? {}) as { id?: unknown, bytes?: unknown, beforeId?: unknown }
        if (typeof id !== 'number' || typeof bytes !== 'string' || (beforeId !== undefined && typeof beforeId !== 'number'))
          throw new LcfError(`Malformed _unknown chunk – expected { id: number, bytes: base64 string, beforeId?: number }, got ${JSON.stringify(chunk)}`)
        return beforeId === undefined ? { id, bytes: base64ToUint8Array(bytes) } : { id, bytes: base64ToUint8Array(bytes), beforeId }
      })
    }
    for (const [key, element] of Object.entries(record)) {
      if (key !== '_unknown')
        reviveUnknownChunks(element)
    }
  }
}

function lcfOutputPath(inputPath: string, format: LcfFileKind): string {
  const strippedPath = inputPath.replace(/\.json$/i, '')
  return lcfFormatFor(strippedPath)?.kind === format ? strippedPath : `${strippedPath}.${format}`
}

export function convertFile(inputPath: string, options: ConvertOptions = {}): ConvertResult {
  const stats = statSync(inputPath, { throwIfNoEntry: false })
  if (stats === undefined)
    throw new LcfError(`No such file or directory: ${inputPath}`)
  if (stats.isDirectory())
    throw new LcfError(`${inputPath} is a directory – convert takes a single file`)

  if (/\.json$/i.test(inputPath)) {
    const envelope = parseEnvelope(readFileSync(inputPath, 'utf8'), inputPath)
    const engine = options.engine === undefined ? envelope.engine : parseEngineFlag(options.engine)
    const encoding = options.encoding ?? envelope.encoding
    const outputPath = options.output ?? lcfOutputPath(inputPath, envelope.format)
    const bytes = encodeLcf(envelope.data, envelope.format, engine, encoding)
    // Overwriting a game file is the whole point of converting back, but the
    // previous bytes must survive – the backup is kept, not cleaned up.
    const writeResult = writeFilesAtomically([{ filePath: outputPath, bytes }], { keepBackups: true })
    return {
      outputPath,
      backupPath: writeResult.backupPaths[0],
      format: envelope.format,
      engine,
      engineSource: options.engine === undefined ? 'envelope' : 'flag',
      encoding,
      encodingSource: options.encoding === undefined ? 'envelope' : 'flag',
    }
  }

  const kind = lcfFormatFor(inputPath)?.kind
  if (kind === undefined)
    throw new LcfError(`Unsupported file extension – expected .lmu, .ldb, .lmt, .lsd, or .json: ${inputPath}`)
  const bytes = new Uint8Array(readFileSync(inputPath))
  const { engine, engineSource, encoding, encodingSource } = resolveFileContext(inputPath, bytes, kind, { ...flagHints(options.engine, options.encoding), onWarning: options.onWarning })
  const envelope: JsonEnvelope = { format: kind, engine, encoding, data: decodeLcf(bytes, kind, engine, encoding, options.onWarning) }
  const outputPath = options.output ?? `${inputPath}.json`
  if (options.isForce !== true && existsSync(outputPath))
    throw new LcfError(`${outputPath} already exists – pass --force to overwrite`)
  const jsonText = stringifyEnvelope(envelope)
  writeFileSync(outputPath, jsonText)
  // Probe through the serialized text, not the in-memory record – JSON has no
  // NaN, so only re-parsing sees what a reader of the document will get.
  const reparsedEnvelope = parseEnvelope(jsonText, outputPath)
  const isByteIdentical = bytesEqual(encodeLcf(reparsedEnvelope.data, kind, engine, encoding), bytes)
  return { outputPath, format: kind, engine, engineSource, encoding, encodingSource, isByteIdentical }
}

export interface ConvertArgs extends ArgsDef {
  input: { type: 'positional', description: string, required: true }
  output: { type: 'string', alias: string, description: string }
  engine: { type: 'string', description: string }
  encoding: { type: 'string', description: string }
  force: { type: 'boolean', description: string }
}

const convertArgs: ConvertArgs = {
  input: { type: 'positional', description: 'Path to a .lmu/.ldb/.lmt/.lsd or .json file', required: true },
  output: { type: 'string', alias: 'o', description: 'Output path (defaults next to the input)' },
  engine: { type: 'string', description: 'Engine version: 2k or 2k3 (overrides detection)' },
  encoding: { type: 'string', description: 'Text encoding, e.g. Shift_JIS or 1252 (overrides detection)' },
  force: { type: 'boolean', description: 'Overwrite an existing JSON output (LCF targets are backed up instead)' },
}

export const convertCommand: CommandDef<ConvertArgs> = defineCommand({
  meta: {
    name: 'convert',
    description: 'Convert an LCF file (.lmu/.ldb/.lmt/.lsd) to JSON, or a JSON document back to LCF',
  },
  args: convertArgs,
  run({ args }) {
    const result = convertFile(args.input, {
      output: args.output,
      engine: args.engine,
      encoding: args.encoding,
      isForce: args.force,
      onWarning: message => console.error(`Warning: ${args.input}: ${message}`),
    })
    console.error(`${args.input} → ${result.outputPath}`)
    console.error(`  ${describeFileContext(result)}`)
    if (result.backupPath !== undefined)
      console.error(`  previous file moved to ${result.backupPath}`)
    if (result.isByteIdentical === false)
      console.error('  warning: converting back will not reproduce the source byte for byte – check --engine and --encoding')
  },
})
