import type { Transcoder } from './codec/transcoder.ts'
import type { Database, MapUnit, Save, TreeMap } from './generated/records.ts'
import { decodeLcfFile, encodeLcfFile, LCF_FORMATS } from './codec/formats.ts'

export { defaultRecord } from './codec/defaults.ts'
export type { UnknownChunk } from './codec/descriptors.ts'
export { LcfError } from './codec/errors.ts'
export { latin1Transcoder } from './codec/transcoder.ts'
export type { Transcoder } from './codec/transcoder.ts'
export * from './generated/enums.ts'
export type * from './generated/records.ts'

/** Some LCF fields exist only in 2k3. */
export type EngineVersion = '2k' | '2k3'

/** Receives recoverable anomalies. Silent when omitted. */
export type WarningSink = (message: string) => void

export interface CodecOptions {
  engine: EngineVersion
  /** Defaults to a lossless byte↔code point mapping; see {@link latin1Transcoder}. */
  transcoder?: Transcoder
  /** Receives recoverable anomalies, e.g. a non-canonical file header. Silent when omitted. */
  onWarning?: WarningSink
}

export function decodeMapUnit(bytes: Uint8Array, options: CodecOptions): MapUnit {
  return decodeLcfFile<MapUnit>(bytes, LCF_FORMATS.lmu, options)
}

export function encodeMapUnit(mapUnit: MapUnit, options: CodecOptions): Uint8Array {
  return encodeLcfFile(mapUnit, LCF_FORMATS.lmu, options)
}

export function decodeDatabase(bytes: Uint8Array, options: CodecOptions): Database {
  return decodeLcfFile<Database>(bytes, LCF_FORMATS.ldb, options)
}

export function encodeDatabase(database: Database, options: CodecOptions): Uint8Array {
  return encodeLcfFile(database, LCF_FORMATS.ldb, options)
}

export function decodeSave(bytes: Uint8Array, options: CodecOptions): Save {
  return decodeLcfFile<Save>(bytes, LCF_FORMATS.lsd, options)
}

export function encodeSave(save: Save, options: CodecOptions): Uint8Array {
  return encodeLcfFile(save, LCF_FORMATS.lsd, options)
}

export function decodeTreeMap(bytes: Uint8Array, options: CodecOptions): TreeMap {
  return decodeLcfFile<TreeMap>(bytes, LCF_FORMATS.lmt, options)
}

export function encodeTreeMap(treeMap: TreeMap, options: CodecOptions): Uint8Array {
  return encodeLcfFile(treeMap, LCF_FORMATS.lmt, options)
}
