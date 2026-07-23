import { LcfError } from './errors.ts'

export class ByteReader {
  private readonly bytes: Uint8Array
  private readonly view: DataView
  offset = 0

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get isAtEnd(): boolean {
    return this.offset >= this.bytes.length
  }

  private ensure(byteCount: number): void {
    if (this.offset + byteCount > this.bytes.length)
      throw new LcfError('Unexpected end of data', { offset: this.offset })
  }

  peekByte(): number {
    this.ensure(1)
    return this.bytes[this.offset]!
  }

  readByte(): number {
    this.ensure(1)
    return this.bytes[this.offset++]!
  }

  readInt8(): number {
    this.ensure(1)
    return this.view.getInt8(this.offset++)
  }

  readInt16(): number {
    this.ensure(2)
    const value = this.view.getInt16(this.offset, true)
    this.offset += 2
    return value
  }

  readInt32(): number {
    this.ensure(4)
    const value = this.view.getInt32(this.offset, true)
    this.offset += 4
    return value
  }

  readUint32(): number {
    this.ensure(4)
    const value = this.view.getUint32(this.offset, true)
    this.offset += 4
    return value
  }

  readDouble(): number {
    this.ensure(8)
    const value = this.view.getFloat64(this.offset, true)
    this.offset += 8
    return value
  }

  readBytes(byteCount: number): Uint8Array {
    this.ensure(byteCount)
    const bytes = this.bytes.slice(this.offset, this.offset + byteCount)
    this.offset += byteCount
    return bytes
  }

  skip(byteCount: number): void {
    this.ensure(byteCount)
    this.offset += byteCount
  }

  /** BER integer as an unsigned 32-bit value (chunk IDs, lengths, counts). */
  readBerUnsigned(): number {
    let value = 0
    for (let index = 0; index < 5; index++) {
      const byte = this.readByte()
      value = value * 0x80 + (byte & 0x7F)
      if ((byte & 0x80) === 0)
        return value >>> 0
    }
    throw new LcfError('BER integer exceeds 32 bits', { offset: this.offset })
  }

  /** BER integer reinterpreted as a signed 32-bit value (scalar Int32 fields). */
  readBer(): number {
    return this.readBerUnsigned() | 0
  }
}

export interface Chunk {
  id: number
  bytes: Uint8Array
}

export type ChunkStreamTerminator = 'id-zero' | 'end-of-data'

/**
 * The single seam that owns how a chunk stream ends: nested streams close on an
 * ID-0 terminator, top-level file streams run to the end of their data.
 */
export function* readChunkStream(reader: ByteReader, terminator: ChunkStreamTerminator = 'id-zero'): Generator<Chunk> {
  while (true) {
    if (reader.isAtEnd) {
      if (terminator === 'end-of-data')
        return
      throw new LcfError('Chunk stream ended without a terminator', { offset: reader.offset })
    }
    const id = reader.readBerUnsigned()
    if (id === 0) {
      if (terminator === 'id-zero')
        return
      throw new LcfError('Unexpected chunk terminator in an end-of-data stream', { offset: reader.offset })
    }
    const length = reader.readBerUnsigned()
    yield { id, bytes: reader.readBytes(length) }
  }
}
