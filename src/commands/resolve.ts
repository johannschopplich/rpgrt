import type { LcfRecord } from '../codec/engine.ts'
import type { CodecOptions, EngineVersion } from '../index.ts'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { bytesEqual } from '../codec/bytes.ts'
import { LcfError } from '../codec/errors.ts'
import { ByteReader, readChunkStream } from '../codec/reader.ts'
import { collectStringBytes, createTranscoder, detectEncoding, encodingFromIni } from '../encoding.ts'
import { RECORD_DESCRIPTORS } from '../generated/descriptors.ts'
import { decodeDatabase, decodeMapTree, decodeMapUnit, decodeSave, encodeDatabase, encodeMapTree, encodeMapUnit, encodeSave } from '../index.ts'

export type LcfFileKind = 'lmu' | 'ldb' | 'lmt' | 'lsd'

export interface KindCodec {
  decode: (bytes: Uint8Array, options: CodecOptions) => LcfRecord
  encode: (record: LcfRecord, options: CodecOptions) => Uint8Array
}

/**
 * The generated record interfaces carry no index signature, so their codec
 * pairs are not assignable to the uniform LcfRecord shape without this cast.
 */
export const LCF_CODECS: Record<LcfFileKind, KindCodec> = {
  lmu: { decode: decodeMapUnit, encode: encodeMapUnit },
  ldb: { decode: decodeDatabase, encode: encodeDatabase },
  lmt: { decode: decodeMapTree, encode: encodeMapTree },
  lsd: { decode: decodeSave, encode: encodeSave },
} as unknown as Record<LcfFileKind, KindCodec>

export interface ResolvedEngine {
  engine: EngineVersion
  engineSource: 'flag' | 'database' | 'roundTrip' | 'fallback'
}

export interface ResolvedEncoding {
  encoding: string
  encodingSource: 'flag' | 'ini' | 'detected' | 'fallback'
}

export const FALLBACK_ENCODING = 'windows-1252'

export function lcfFileKind(filePath: string): LcfFileKind | undefined {
  const match = filePath.toLowerCase().match(/\.(lmu|ldb|lmt|lsd)$/)
  return match ? match[1] as LcfFileKind : undefined
}

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
  const { decode, encode } = LCF_CODECS[kind]
  try {
    return bytesEqual(encode(decode(bytes, options), options), bytes)
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

export interface ResolveOptions {
  engine?: string
  encoding?: string
}

export type FileContext = ResolvedEngine & ResolvedEncoding

/**
 * Precedence ladder for the engine: an explicit flag, then the sibling
 * database's chunk profile, then a byte-identical re-encode probe, then 2k3 as
 * the safe guess. A file that re-encodes identically under both engines carries
 * no 2k3 data, so 2k describes it fully; 2k3 decoding never drops data from a
 * 2k file, so it is the fallback.
 */
export function decideEngine(inputs: { engineFlag?: string, kind: LcfFileKind, bytes: Uint8Array, databaseBytes?: Uint8Array }): ResolvedEngine {
  const { engineFlag, kind, bytes, databaseBytes } = inputs
  if (engineFlag !== undefined)
    return { engine: parseEngineFlag(engineFlag), engineSource: 'flag' }
  if (databaseBytes !== undefined)
    return { engine: scanDatabaseEngine(databaseBytes), engineSource: 'database' }
  if (reencodesIdentically(bytes, kind, '2k'))
    return { engine: '2k', engineSource: 'roundTrip' }
  if (reencodesIdentically(bytes, kind, '2k3'))
    return { engine: '2k3', engineSource: 'roundTrip' }
  return { engine: '2k3', engineSource: 'fallback' }
}

/**
 * Precedence ladder for the encoding: an explicit (validated) flag, then the
 * `Encoding` hint in RPG_RT.ini, then charset detection over a string sample,
 * then windows-1252.
 */
export function decideEncoding(inputs: { encodingFlag?: string, iniText?: string, getSampleBytes?: () => Uint8Array | undefined }): ResolvedEncoding {
  const { encodingFlag, iniText, getSampleBytes } = inputs
  if (encodingFlag !== undefined) {
    createTranscoder(encodingFlag)
    return { encoding: encodingFlag, encodingSource: 'flag' }
  }
  if (iniText !== undefined) {
    const iniEncoding = encodingFromIni(iniText)
    if (iniEncoding !== undefined)
      return { encoding: iniEncoding, encodingSource: 'ini' }
  }
  // Deferred so a flag or ini hint never pays for the sample's whole-database decode.
  const sampleBytes = getSampleBytes?.()
  const detectedEncoding = sampleBytes === undefined ? undefined : detectEncoding(sampleBytes)
  if (detectedEncoding !== undefined)
    return { encoding: detectedEncoding, encodingSource: 'detected' }
  return { encoding: FALLBACK_ENCODING, encodingSource: 'fallback' }
}

/**
 * Gathers the sibling database and ini once, then hands them to the pure
 * deciders. A .ldb resolves against its own bytes and needs no sibling read.
 */
export function resolveFileContext(filePath: string, bytes: Uint8Array, kind: LcfFileKind, options: ResolveOptions): FileContext {
  const databaseBytes = kind === 'ldb'
    ? bytes
    : (() => {
        const databasePath = findSibling(filePath, 'rpg_rt.ldb')
        return databasePath === undefined ? undefined : new Uint8Array(readFileSync(databasePath))
      })()
  const resolvedEngine = decideEngine({ engineFlag: options.engine, kind, bytes, databaseBytes })
  const iniPath = findSibling(filePath, 'rpg_rt.ini')
  const iniText = iniPath === undefined ? undefined : readFileSync(iniPath, 'latin1')
  const resolvedEncoding = decideEncoding({
    encodingFlag: options.encoding,
    iniText,
    getSampleBytes: () => collectDetectionSample(bytes, kind, resolvedEngine.engine, databaseBytes),
  })
  return { ...resolvedEngine, ...resolvedEncoding }
}

/** The database holds most of a game's text, so prefer it as the detection sample. */
function collectDetectionSample(bytes: Uint8Array, kind: LcfFileKind, engine: EngineVersion, databaseBytes?: Uint8Array): Uint8Array | undefined {
  try {
    if (kind === 'ldb')
      return collectStringBytes(decodeDatabase(bytes, { engine }))
    if (databaseBytes !== undefined)
      return collectStringBytes(decodeDatabase(databaseBytes, { engine: scanDatabaseEngine(databaseBytes) }))
    return collectStringBytes(LCF_CODECS[kind].decode(bytes, { engine }))
  }
  catch {
    return undefined
  }
}
