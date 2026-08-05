import type { LcfRecord } from '../codec/engine.ts'
import type { LcfFileKind } from '../codec/formats.ts'
import type { EngineVersion, WarningSink } from '../index.ts'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { bytesEqual } from '../codec/bytes.ts'
import { collectDatabaseSampleBytes, collectStringBytes } from '../codec/detection-sample.ts'
import { LcfError } from '../codec/errors.ts'
import { decodeLcfFile, encodeLcfFile, LCF_FORMATS } from '../codec/formats.ts'
import { ByteReader, readChunkStream } from '../codec/reader.ts'
import { createTranscoder, detectEncoding, encodingFromIni, isKnownEncoding } from '../encoding.ts'
import { RECORD_DESCRIPTORS } from '../generated/descriptors.ts'
import { decodeDatabase, decodeSave } from '../index.ts'

/** `envelope` and `dump` are hint provenances – metadata a JSON document or extract dump carries with itself. */
export type EngineSource = 'flag' | 'envelope' | 'dump' | 'database' | 'roundTrip' | 'fallback'
export type EncodingSource = 'flag' | 'envelope' | 'dump' | 'save' | 'ini' | 'detected' | 'fallback'

export interface FileContext {
  engine: EngineVersion
  engineSource: EngineSource
  encoding: string
  encodingSource: EncodingSource
}

type ResolvedEngine = Pick<FileContext, 'engine' | 'engineSource'>
type ResolvedEncoding = Pick<FileContext, 'encoding' | 'encodingSource'>

const ENGINE_SOURCE_LABELS: Record<EngineSource, string> = {
  flag: 'from --engine',
  database: 'detected from RPG_RT.ldb',
  roundTrip: 'detected by re-encoding',
  fallback: 'fallback – pass --engine if wrong',
  envelope: 'from the JSON document',
  dump: 'from the dump metadata',
}

const ENCODING_SOURCE_LABELS: Record<EncodingSource, string> = {
  flag: 'from --encoding',
  save: 'from the save\'s own codepage',
  ini: 'from RPG_RT.ini',
  detected: 'detected',
  fallback: 'fallback – pass --encoding if wrong',
  envelope: 'from the JSON document',
  dump: 'from the dump metadata',
}

export function describeFileContext(context: { engine: EngineVersion, engineSource: EngineSource, encoding: string, encodingSource: EncodingSource }): string {
  return `engine ${context.engine} (${ENGINE_SOURCE_LABELS[context.engineSource]}), encoding ${context.encoding} (${ENCODING_SOURCE_LABELS[context.encodingSource]})`
}

export const FALLBACK_ENCODING = 'windows-1252'

/** Case-insensitive sibling lookup – game folders mix RPG_RT.ldb and rpg_rt.ldb in the wild. */
function findSibling(filePath: string, siblingName: string): string | undefined {
  const directory = dirname(filePath)
  try {
    const entryName = readdirSync(directory).find(name => name.toLowerCase() === siblingName)
    return entryName === undefined ? undefined : join(directory, entryName)
  }
  catch {
    return undefined
  }
}

const DATABASE_2K3_CHUNK_IDS = new Set(
  RECORD_DESCRIPTORS.Database!.fields
    .filter(field => field.is2k3Only === true || field.codec.kind === 'databaseVersion')
    .map(field => field.id!),
)

/**
 * RPG Maker 2000 never writes the version chunk or any of the 2k3-only
 * database chunks, so their presence in the top-level stream is decisive.
 */
export function scanDatabaseEngine(databaseBytes: Uint8Array): EngineVersion {
  const reader = new ByteReader(databaseBytes)
  reader.skip(reader.readBerUnsigned())
  for (const chunk of readChunkStream(reader, 'end-of-data')) {
    if (DATABASE_2K3_CHUNK_IDS.has(chunk.id))
      return '2k3'
  }
  return '2k'
}

function reencodesIdentically(bytes: Uint8Array, kind: LcfFileKind, engine: EngineVersion): boolean {
  const options = { engine }
  const format = LCF_FORMATS[kind]
  try {
    return bytesEqual(encodeLcfFile(decodeLcfFile<LcfRecord>(bytes, format, options), format, options), bytes)
  }
  catch {
    return false
  }
}

export function parseEngineFlag(engineFlag: string): EngineVersion {
  if (engineFlag !== '2k' && engineFlag !== '2k3')
    throw new LcfError(`Unknown engine ${JSON.stringify(engineFlag)} – expected 2k or 2k3`)
  return engineFlag
}

export type HintSource = 'flag' | 'dump'

/** An engine or encoding the caller already knows, with its provenance for reporting. */
export interface EngineHint {
  engine: string
  source: HintSource
}

export interface EncodingHint {
  encoding: string
  source: HintSource
}

export interface ResolveInputs {
  engineHint?: EngineHint
  encodingHint?: EncodingHint
  /** Receives recoverable resolution anomalies, e.g. an unusable ini hint. Silent when omitted. */
  onWarning?: WarningSink
}

/** The common case: hints from optional --engine/--encoding flag values. */
export function flagHints(engineFlag?: string, encodingFlag?: string): Pick<ResolveInputs, 'engineHint' | 'encodingHint'> {
  return {
    engineHint: engineFlag === undefined ? undefined : { engine: engineFlag, source: 'flag' },
    encodingHint: encodingFlag === undefined ? undefined : { encoding: encodingFlag, source: 'flag' },
  }
}

/**
 * Precedence ladder for the engine: an explicit hint, then the sibling
 * database's chunk profile, then a byte-identical re-encode probe, then 2k3 as
 * the safe guess. A file that re-encodes identically under both engines carries
 * no 2k3 data, so 2k describes it fully; 2k3 decoding never drops data from a
 * 2k file, so it is the fallback.
 */
function decideEngine(inputs: { engineHint?: EngineHint, kind: LcfFileKind, bytes: Uint8Array, databaseBytes?: Uint8Array, onWarning?: WarningSink }): ResolvedEngine {
  const { engineHint, kind, bytes, databaseBytes, onWarning } = inputs
  if (engineHint !== undefined)
    return { engine: parseEngineFlag(engineHint.engine), engineSource: engineHint.source }
  if (databaseBytes !== undefined) {
    // A corrupt sibling database must not take down the file it sits next to.
    try {
      return { engine: scanDatabaseEngine(databaseBytes), engineSource: 'database' }
    }
    catch (error) {
      onWarning?.(`Ignoring the unreadable sibling RPG_RT.ldb for engine detection (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  if (reencodesIdentically(bytes, kind, '2k'))
    return { engine: '2k', engineSource: 'roundTrip' }
  if (reencodesIdentically(bytes, kind, '2k3'))
    return { engine: '2k3', engineSource: 'roundTrip' }
  return { engine: '2k3', engineSource: 'fallback' }
}

/**
 * Precedence ladder for the encoding: an explicit (validated) hint, then the
 * codepage an EasyRPG save carries for its own text, then the `Encoding` hint
 * in RPG_RT.ini, then charset detection over a string sample, then
 * windows-1252. An unusable save or ini hint warns and falls through instead
 * of failing – detection is still available.
 */
function decideEncoding(inputs: { encodingHint?: EncodingHint, getSaveCodepage?: () => number | undefined, iniText?: string, getSampleBytes?: () => Uint8Array | undefined, onWarning?: WarningSink }): ResolvedEncoding {
  const { encodingHint, getSaveCodepage, iniText, getSampleBytes, onWarning } = inputs
  if (encodingHint !== undefined) {
    createTranscoder(encodingHint.encoding)
    return { encoding: encodingHint.encoding, encodingSource: encodingHint.source }
  }
  const saveCodepage = getSaveCodepage?.()
  if (saveCodepage !== undefined) {
    const saveEncoding = `cp${saveCodepage}`
    if (isKnownEncoding(saveEncoding))
      return { encoding: saveEncoding, encodingSource: 'save' }
    onWarning?.(`The save names unknown codepage ${saveCodepage} – falling back to detection`)
  }
  if (iniText !== undefined) {
    const iniEncoding = encodingFromIni(iniText)
    if (iniEncoding !== undefined) {
      if (isKnownEncoding(iniEncoding))
        return { encoding: iniEncoding, encodingSource: 'ini' }
      onWarning?.(`RPG_RT.ini names unknown encoding ${JSON.stringify(iniEncoding)} – falling back to detection`)
    }
  }
  // Deferred so a flag or ini hint never pays for the sample's whole-database decode.
  const sampleBytes = getSampleBytes?.()
  const detectedEncoding = sampleBytes === undefined ? undefined : detectEncoding(sampleBytes)
  if (detectedEncoding !== undefined)
    return { encoding: detectedEncoding, encodingSource: 'detected' }
  onWarning?.(`No encoding could be determined – assuming ${FALLBACK_ENCODING}`)
  return { encoding: FALLBACK_ENCODING, encodingSource: 'fallback' }
}

/**
 * Gathers the sibling database and ini once, then hands them to the pure
 * deciders. A .ldb resolves against its own bytes and needs no sibling read.
 */
export function resolveFileContext(filePath: string, bytes: Uint8Array, kind: LcfFileKind, inputs: ResolveInputs = {}): FileContext {
  const databaseBytes = kind === 'ldb'
    ? bytes
    : (() => {
        const databasePath = findSibling(filePath, 'rpg_rt.ldb')
        return databasePath === undefined ? undefined : new Uint8Array(readFileSync(databasePath))
      })()
  const resolvedEngine = decideEngine({ engineHint: inputs.engineHint, kind, bytes, databaseBytes, onWarning: inputs.onWarning })
  const iniPath = findSibling(filePath, 'rpg_rt.ini')
  const iniText = iniPath === undefined ? undefined : readFileSync(iniPath, 'latin1')
  const resolvedEncoding = decideEncoding({
    encodingHint: inputs.encodingHint,
    getSaveCodepage: kind === 'lsd' ? () => saveCodepage(bytes, resolvedEngine.engine) : undefined,
    iniText,
    getSampleBytes: () => collectDetectionSample(bytes, kind, resolvedEngine.engine, databaseBytes),
    onWarning: inputs.onWarning,
  })
  return { ...resolvedEngine, ...resolvedEncoding }
}

/** EasyRPG Player records the codepage its save text was written with. */
function saveCodepage(bytes: Uint8Array, engine: EngineVersion): number | undefined {
  try {
    const save = decodeSave(bytes, { engine })
    const codepage = save.easyrpgData.codepage
    return codepage > 0 ? codepage : undefined
  }
  catch {
    return undefined
  }
}

/** Prefers the database as the detection sample – it holds most of a game's text. */
function collectDetectionSample(bytes: Uint8Array, kind: LcfFileKind, engine: EngineVersion, databaseBytes?: Uint8Array): Uint8Array | undefined {
  try {
    if (kind === 'ldb')
      return collectDatabaseSampleBytes(decodeDatabase(bytes, { engine }))
    if (databaseBytes !== undefined)
      return collectDatabaseSampleBytes(decodeDatabase(databaseBytes, { engine: scanDatabaseEngine(databaseBytes) }))
    return collectStringBytes(decodeLcfFile<LcfRecord>(bytes, LCF_FORMATS[kind], { engine }))
  }
  catch {
    return undefined
  }
}
