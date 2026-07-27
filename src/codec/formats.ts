import type { CodecOptions } from '../index.ts'
import type { CodecContext, LcfRecord } from './engine.ts'
import { decodeChunkStream, decodeTreeMap, encodeChunkStream, encodeTreeMap } from './engine.ts'
import { LcfError } from './errors.ts'
import { ByteReader } from './reader.ts'
import { latin1Transcoder } from './transcoder.ts'
import { ByteWriter } from './writer.ts'

export type LcfFileKind = 'lmu' | 'ldb' | 'lmt' | 'lsd'

export interface LcfFormat {
  kind: LcfFileKind
  /** Record name in the descriptors; doubles as the error path root. */
  recordName: string
  magic: string
  /** Whether a non-canonical header round-trips via `_header`. */
  isHeaderPreserving: boolean
  decodeBody: (reader: ByteReader, context: CodecContext) => LcfRecord
  encodeBody: (record: LcfRecord, writer: ByteWriter, context: CodecContext) => void
}

export const LCF_FORMATS: Record<LcfFileKind, LcfFormat> = {
  lmu: {
    kind: 'lmu',
    recordName: 'MapUnit',
    magic: 'LcfMapUnit',
    isHeaderPreserving: true,
    decodeBody: (reader, context) => decodeChunkStream('MapUnit', reader, context, 'MapUnit'),
    encodeBody: (record, writer, context) => encodeChunkStream('MapUnit', record, writer, context, 'MapUnit', true),
  },
  ldb: {
    kind: 'ldb',
    recordName: 'Database',
    magic: 'LcfDataBase',
    isHeaderPreserving: true,
    // A database ends at end of file – RPG_RT writes no trailing terminator.
    decodeBody: (reader, context) => decodeChunkStream('Database', reader, context, 'Database', true),
    encodeBody: (record, writer, context) => encodeChunkStream('Database', record, writer, context, 'Database', false),
  },
  lmt: {
    kind: 'lmt',
    recordName: 'TreeMap',
    magic: 'LcfMapTree',
    isHeaderPreserving: true,
    decodeBody: (reader, context) => decodeTreeMap(reader, context, 'TreeMap'),
    encodeBody: (record, writer, context) => encodeTreeMap(record, writer, context, 'TreeMap'),
  },
  lsd: {
    kind: 'lsd',
    recordName: 'Save',
    magic: 'LcfSaveData',
    // liblcf hardcodes the .lsd header on write, so a non-canonical one is not
    // preserved.
    isHeaderPreserving: false,
    // Like a database, a save ends at end of file – a trailing 0x00 after a
    // top-level Save breaks RPG_RT.
    decodeBody: (reader, context) => decodeChunkStream('Save', reader, context, 'Save', true),
    encodeBody: (record, writer, context) => encodeChunkStream('Save', record, writer, context, 'Save', false),
  },
}

export function lcfFormatFor(filePath: string): LcfFormat | undefined {
  const match = filePath.toLowerCase().match(/\.(lmu|ldb|lmt|lsd)$/)
  return match ? LCF_FORMATS[match[1] as LcfFileKind] : undefined
}

function createContext(options: CodecOptions): CodecContext {
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

export function decodeLcfFile<T>(bytes: Uint8Array, format: LcfFormat, options: CodecOptions): T {
  const reader = new ByteReader(bytes)
  const header = readHeader(reader, format.magic, options)
  const record = format.decodeBody(reader, createContext(options))
  if (!reader.isAtEnd)
    throw new LcfError('Trailing data after the top-level record', { path: format.recordName, offset: reader.offset })
  if (format.isHeaderPreserving && header !== undefined)
    record._header = header
  return record as unknown as T
}

/**
 * The generated record interfaces carry no index signature, so they are not
 * assignable to `LcfRecord` – this seam takes the one cast for all of them.
 */
export function encodeLcfFile(record: object, format: LcfFormat, options: CodecOptions): Uint8Array {
  const lcfRecord = record as LcfRecord
  const writer = new ByteWriter()
  writeHeader(writer, format.isHeaderPreserving ? (lcfRecord._header as string | undefined) ?? format.magic : format.magic)
  format.encodeBody(lcfRecord, writer, createContext(options))
  return writer.toBytes()
}
