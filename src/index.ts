import type { LcfRecord } from './codec/engine.ts'
import type { Transcoder } from './codec/transcoder.ts'
import type { Database, MapUnit, Save, TreeMap } from './generated/records.ts'
import { decodeChunkStream, decodeTreeMap as decodeTreeMapRecord, encodeChunkStream, encodeTreeMap as encodeTreeMapRecord } from './codec/engine.ts'
import { LcfError } from './codec/errors.ts'
import { ByteReader } from './codec/reader.ts'
import { latin1Transcoder } from './codec/transcoder.ts'
import { ByteWriter } from './codec/writer.ts'

// The descriptor metadata types stay internal – their backing tables are not
// exported, and an unusable type would still freeze at first publish.
export type { UnknownChunk } from './codec/descriptors.ts'
export { LcfError } from './codec/errors.ts'
export { latin1Transcoder } from './codec/transcoder.ts'
export type { Transcoder } from './codec/transcoder.ts'
export * from './generated/enums.ts'
export type * from './generated/records.ts'

/** RPG Maker engine the file targets. Some LCF fields exist only in 2k3. */
export type EngineVersion = '2k' | '2k3'

export interface CodecOptions {
  engine: EngineVersion
  /** Defaults to a lossless byte↔code point mapping; see {@link latin1Transcoder}. */
  transcoder?: Transcoder
}

const DATABASE_MAGIC = 'LcfDataBase'
const MAP_UNIT_MAGIC = 'LcfMapUnit'
const MAP_TREE_MAGIC = 'LcfMapTree'
const SAVE_DATA_MAGIC = 'LcfSaveData'

function createContext(options: CodecOptions): { engine: EngineVersion, transcoder: Transcoder } {
  return { engine: options.engine, transcoder: options.transcoder ?? latin1Transcoder }
}

function readHeader(reader: ByteReader, magic: string): void {
  const length = reader.readBerUnsigned()
  const text = length === magic.length ? String.fromCharCode(...reader.readBytes(length)) : ''
  if (text !== magic)
    throw new LcfError(`Not a ${magic} file`, { offset: 0 })
}

function writeHeader(writer: ByteWriter, magic: string): void {
  writer.writeBer(magic.length)
  for (let index = 0; index < magic.length; index++)
    writer.writeByte(magic.charCodeAt(index))
}

function expectEndOfData(reader: ByteReader, path: string): void {
  if (!reader.isAtEnd)
    throw new LcfError('Trailing data after the top-level record', { path, offset: reader.offset })
}

export function decodeMapUnit(bytes: Uint8Array, options: CodecOptions): MapUnit {
  const reader = new ByteReader(bytes)
  readHeader(reader, MAP_UNIT_MAGIC)
  const record = decodeChunkStream('MapUnit', reader, createContext(options), 'MapUnit')
  expectEndOfData(reader, 'MapUnit')
  return record as unknown as MapUnit
}

export function encodeMapUnit(mapUnit: MapUnit, options: CodecOptions): Uint8Array {
  const writer = new ByteWriter()
  writeHeader(writer, MAP_UNIT_MAGIC)
  encodeChunkStream('MapUnit', mapUnit as unknown as LcfRecord, writer, createContext(options), 'MapUnit', true)
  return writer.toBytes()
}

export function decodeDatabase(bytes: Uint8Array, options: CodecOptions): Database {
  const reader = new ByteReader(bytes)
  readHeader(reader, DATABASE_MAGIC)
  // A database ends at end of file – RPG_RT writes no trailing terminator.
  const record = decodeChunkStream('Database', reader, createContext(options), 'Database', true)
  expectEndOfData(reader, 'Database')
  return record as unknown as Database
}

export function encodeDatabase(database: Database, options: CodecOptions): Uint8Array {
  const writer = new ByteWriter()
  writeHeader(writer, DATABASE_MAGIC)
  encodeChunkStream('Database', database as unknown as LcfRecord, writer, createContext(options), 'Database', false)
  return writer.toBytes()
}

export function decodeSave(bytes: Uint8Array, options: CodecOptions): Save {
  const reader = new ByteReader(bytes)
  readHeader(reader, SAVE_DATA_MAGIC)
  // Like a database, a save ends at end of file – RPG_RT writes no terminator.
  const record = decodeChunkStream('Save', reader, createContext(options), 'Save', true)
  expectEndOfData(reader, 'Save')
  return record as unknown as Save
}

export function encodeSave(save: Save, options: CodecOptions): Uint8Array {
  const writer = new ByteWriter()
  writeHeader(writer, SAVE_DATA_MAGIC)
  // A trailing 0x00 after a top-level Save breaks RPG_RT (liblcf @ 666e6c0).
  encodeChunkStream('Save', save as unknown as LcfRecord, writer, createContext(options), 'Save', false)
  return writer.toBytes()
}

export function decodeTreeMap(bytes: Uint8Array, options: CodecOptions): TreeMap {
  const reader = new ByteReader(bytes)
  readHeader(reader, MAP_TREE_MAGIC)
  const record = decodeTreeMapRecord(reader, createContext(options), 'TreeMap')
  expectEndOfData(reader, 'TreeMap')
  return record as unknown as TreeMap
}

export function encodeTreeMap(treeMap: TreeMap, options: CodecOptions): Uint8Array {
  const writer = new ByteWriter()
  writeHeader(writer, MAP_TREE_MAGIC)
  encodeTreeMapRecord(treeMap as unknown as LcfRecord, writer, createContext(options), 'TreeMap')
  return writer.toBytes()
}
