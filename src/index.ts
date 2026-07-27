import type { LcfRecord } from './codec/engine.ts'
import type { Transcoder } from './codec/transcoder.ts'
import type { Database, MapUnit, Save, TreeMap } from './generated/records.ts'
import { decodeChunkStream, decodeTreeMap as decodeTreeMapRecord, encodeChunkStream, encodeTreeMap as encodeTreeMapRecord } from './codec/engine.ts'
import { LcfError } from './codec/errors.ts'
import { ByteReader } from './codec/reader.ts'
import { latin1Transcoder } from './codec/transcoder.ts'
import { ByteWriter } from './codec/writer.ts'

export { defaultRecord } from './codec/defaults.ts'
export type { UnknownChunk } from './codec/descriptors.ts'
export { LcfError } from './codec/errors.ts'
export { latin1Transcoder } from './codec/transcoder.ts'
export type { Transcoder } from './codec/transcoder.ts'
export * from './generated/enums.ts'
export type * from './generated/records.ts'

/** Some LCF fields exist only in 2k3. */
export type EngineVersion = '2k' | '2k3'

export interface CodecOptions {
  engine: EngineVersion
  /** Defaults to a lossless byte↔code point mapping; see {@link latin1Transcoder}. */
  transcoder?: Transcoder
  /** Receives recoverable anomalies, e.g. a non-canonical file header. Silent when omitted. */
  onWarning?: (message: string) => void
}

const DATABASE_MAGIC = 'LcfDataBase'
const MAP_UNIT_MAGIC = 'LcfMapUnit'
const MAP_TREE_MAGIC = 'LcfMapTree'
const SAVE_DATA_MAGIC = 'LcfSaveData'

function createContext(options: CodecOptions): { engine: EngineVersion, transcoder: Transcoder } {
  return { engine: options.engine, transcoder: options.transcoder ?? latin1Transcoder }
}

/**
 * Only the header length is load-bearing; edited-header games circulate, so a
 * same-length mismatch warns and is preserved for write-back instead of
 * failing – mirroring liblcf's warn-and-preserve behavior.
 */
function readHeader(reader: ByteReader, magic: string, options: CodecOptions): string | undefined {
  const length = reader.readBerUnsigned()
  if (length !== magic.length)
    throw new LcfError(`Not a ${magic} file`, { offset: 0 })
  const text = String.fromCharCode(...reader.readBytes(length))
  if (text === magic)
    return undefined
  options.onWarning?.(`Header "${text}" does not match "${magic}" – the file may not be valid`)
  return text
}

function writeHeader(writer: ByteWriter, header: string): void {
  writer.writeBer(header.length)
  for (let index = 0; index < header.length; index++)
    writer.writeByte(header.charCodeAt(index) & 0xFF)
}

function expectEndOfData(reader: ByteReader, path: string): void {
  if (!reader.isAtEnd)
    throw new LcfError('Trailing data after the top-level record', { path, offset: reader.offset })
}

function attachHeader(record: LcfRecord, header: string | undefined): void {
  if (header !== undefined)
    record._header = header
}

export function decodeMapUnit(bytes: Uint8Array, options: CodecOptions): MapUnit {
  const reader = new ByteReader(bytes)
  const header = readHeader(reader, MAP_UNIT_MAGIC, options)
  const record = decodeChunkStream('MapUnit', reader, createContext(options), 'MapUnit')
  expectEndOfData(reader, 'MapUnit')
  attachHeader(record, header)
  return record as unknown as MapUnit
}

export function encodeMapUnit(mapUnit: MapUnit, options: CodecOptions): Uint8Array {
  const writer = new ByteWriter()
  writeHeader(writer, mapUnit._header ?? MAP_UNIT_MAGIC)
  encodeChunkStream('MapUnit', mapUnit as unknown as LcfRecord, writer, createContext(options), 'MapUnit', true)
  return writer.toBytes()
}

export function decodeDatabase(bytes: Uint8Array, options: CodecOptions): Database {
  const reader = new ByteReader(bytes)
  const header = readHeader(reader, DATABASE_MAGIC, options)
  // A database ends at end of file – RPG_RT writes no trailing terminator.
  const record = decodeChunkStream('Database', reader, createContext(options), 'Database', true)
  expectEndOfData(reader, 'Database')
  attachHeader(record, header)
  return record as unknown as Database
}

export function encodeDatabase(database: Database, options: CodecOptions): Uint8Array {
  const writer = new ByteWriter()
  writeHeader(writer, database._header ?? DATABASE_MAGIC)
  encodeChunkStream('Database', database as unknown as LcfRecord, writer, createContext(options), 'Database', false)
  return writer.toBytes()
}

export function decodeSave(bytes: Uint8Array, options: CodecOptions): Save {
  const reader = new ByteReader(bytes)
  readHeader(reader, SAVE_DATA_MAGIC, options)
  // Like a database, a save ends at end of file – RPG_RT writes no terminator.
  const record = decodeChunkStream('Save', reader, createContext(options), 'Save', true)
  expectEndOfData(reader, 'Save')
  return record as unknown as Save
}

export function encodeSave(save: Save, options: CodecOptions): Uint8Array {
  const writer = new ByteWriter()
  // Saves are always written with the canonical header – liblcf hardcodes it
  // and keeps no header field for .lsd.
  writeHeader(writer, SAVE_DATA_MAGIC)
  // A trailing 0x00 after a top-level Save breaks RPG_RT (liblcf @ 666e6c0).
  encodeChunkStream('Save', save as unknown as LcfRecord, writer, createContext(options), 'Save', false)
  return writer.toBytes()
}

export function decodeTreeMap(bytes: Uint8Array, options: CodecOptions): TreeMap {
  const reader = new ByteReader(bytes)
  const header = readHeader(reader, MAP_TREE_MAGIC, options)
  const record = decodeTreeMapRecord(reader, createContext(options), 'TreeMap')
  expectEndOfData(reader, 'TreeMap')
  attachHeader(record, header)
  return record as unknown as TreeMap
}

export function encodeTreeMap(treeMap: TreeMap, options: CodecOptions): Uint8Array {
  const writer = new ByteWriter()
  writeHeader(writer, treeMap._header ?? MAP_TREE_MAGIC)
  encodeTreeMapRecord(treeMap as unknown as LcfRecord, writer, createContext(options), 'TreeMap')
  return writer.toBytes()
}
