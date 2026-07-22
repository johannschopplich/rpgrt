import type { LcfRecord } from '../codec/engine.ts'
import type { CodecOptions, EngineVersion } from '../index.ts'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { bytesEqual } from '../codec/bytes.ts'
import { LcfError } from '../codec/errors.ts'
import { ByteReader } from '../codec/reader.ts'
import { collectStringBytes, createTranscoder, detectEncoding, encodingFromIni } from '../encoding.ts'
import { RECORD_DESCRIPTORS } from '../generated/descriptors.ts'
import { decodeDatabase, decodeMapTree, decodeMapUnit, encodeDatabase, encodeMapTree, encodeMapUnit } from '../index.ts'

export type LcfFileKind = 'lmu' | 'ldb' | 'lmt'

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
  const match = filePath.toLowerCase().match(/\.(lmu|ldb|lmt)$/)
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
  const magicLength = reader.readBerUnsigned()
  reader.skip(magicLength)
  while (!reader.isAtEnd) {
    const chunkId = reader.readBerUnsigned()
    if (chunkId === 0)
      break
    if (DATABASE_2K3_CHUNK_IDS.has(chunkId))
      return '2k3'
    reader.skip(reader.readBerUnsigned())
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

export function resolveEngine(filePath: string, bytes: Uint8Array, kind: LcfFileKind, engineFlag?: string): ResolvedEngine {
  if (engineFlag !== undefined)
    return { engine: parseEngineFlag(engineFlag), engineSource: 'flag' }
  const databaseBytes = kind === 'ldb'
    ? bytes
    : (() => {
        const databasePath = findSibling(filePath, 'rpg_rt.ldb')
        return databasePath === undefined ? undefined : new Uint8Array(readFileSync(databasePath))
      })()
  if (databaseBytes !== undefined)
    return { engine: scanDatabaseEngine(databaseBytes), engineSource: 'database' }
  // Without a database, a byte-identical re-encode identifies the engine; a
  // file identical under both carries no 2k3 data, so 2k describes it fully.
  if (reencodesIdentically(bytes, kind, '2k'))
    return { engine: '2k', engineSource: 'roundTrip' }
  if (reencodesIdentically(bytes, kind, '2k3'))
    return { engine: '2k3', engineSource: 'roundTrip' }
  // 2k3 decoding never drops data from a 2k file, so it is the safe guess.
  return { engine: '2k3', engineSource: 'fallback' }
}

export function resolveEncoding(filePath: string, bytes: Uint8Array, kind: LcfFileKind, engine: EngineVersion, encodingFlag?: string): ResolvedEncoding {
  if (encodingFlag !== undefined) {
    createTranscoder(encodingFlag)
    return { encoding: encodingFlag, encodingSource: 'flag' }
  }
  const iniPath = findSibling(filePath, 'rpg_rt.ini')
  if (iniPath !== undefined) {
    const iniEncoding = encodingFromIni(readFileSync(iniPath, 'latin1'))
    if (iniEncoding !== undefined)
      return { encoding: iniEncoding, encodingSource: 'ini' }
  }
  const sampleBytes = detectionSample(filePath, bytes, kind, engine)
  const detectedEncoding = sampleBytes === undefined ? undefined : detectEncoding(sampleBytes)
  if (detectedEncoding !== undefined)
    return { encoding: detectedEncoding, encodingSource: 'detected' }
  return { encoding: FALLBACK_ENCODING, encodingSource: 'fallback' }
}

/** The database holds most of a game's text, so prefer it as the detection sample. */
function detectionSample(filePath: string, bytes: Uint8Array, kind: LcfFileKind, engine: EngineVersion): Uint8Array | undefined {
  try {
    if (kind === 'ldb')
      return collectStringBytes(decodeDatabase(bytes, { engine }))
    const databasePath = findSibling(filePath, 'rpg_rt.ldb')
    if (databasePath !== undefined) {
      const databaseBytes = new Uint8Array(readFileSync(databasePath))
      return collectStringBytes(decodeDatabase(databaseBytes, { engine: scanDatabaseEngine(databaseBytes) }))
    }
    return collectStringBytes(LCF_CODECS[kind].decode(bytes, { engine }))
  }
  catch {
    return undefined
  }
}
