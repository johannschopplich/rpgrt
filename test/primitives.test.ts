import { describe, expect, it } from 'vitest'
import { ByteReader, readChunkStream } from '../src/codec/reader.ts'
import { ByteWriter } from '../src/codec/writer.ts'

describe('ber integer', () => {
  const cases: [value: number, bytes: number[]][] = [
    [0, [0x00]],
    [1, [0x01]],
    [0x7F, [0x7F]],
    [0x80, [0x81, 0x00]],
    [0x3FFF, [0xFF, 0x7F]],
    [0x4000, [0x81, 0x80, 0x00]],
    [-1, [0x8F, 0xFF, 0xFF, 0xFF, 0x7F]],
  ]

  it.each(cases)('encodes %d', (value, bytes) => {
    const writer = new ByteWriter()
    writer.writeBer(value)
    expect([...writer.toBytes()]).toEqual(bytes)
  })

  it.each(cases)('decodes %d', (value, bytes) => {
    const reader = new ByteReader(new Uint8Array(bytes))
    expect(reader.readBer()).toBe(value)
    expect(reader.isAtEnd).toBe(true)
  })
})

describe('read chunk stream', () => {
  it('yields each chunk id and its payload bytes', () => {
    const reader = new ByteReader(new Uint8Array([0x01, 0x02, 0xAA, 0xBB, 0x0A, 0x01, 0xCC, 0x00]))
    const chunks = [...readChunkStream(reader)]
    expect(chunks).toEqual([
      { id: 0x01, bytes: new Uint8Array([0xAA, 0xBB]) },
      { id: 0x0A, bytes: new Uint8Array([0xCC]) },
    ])
  })

  it('stops at the id-zero terminator without consuming further bytes', () => {
    const reader = new ByteReader(new Uint8Array([0x01, 0x01, 0xAA, 0x00, 0x09, 0x09]))
    const chunks = [...readChunkStream(reader, 'id-zero')]
    expect(chunks.map(chunk => chunk.id)).toEqual([0x01])
    expect(reader.offset).toBe(4)
  })

  it('throws on premature end of data in an id-zero stream', () => {
    const reader = new ByteReader(new Uint8Array([0x01, 0x02, 0xAA, 0xBB]))
    expect(() => [...readChunkStream(reader, 'id-zero')]).toThrow('Chunk stream ended without a terminator')
  })

  it('stops at end of data in an end-of-data stream', () => {
    const reader = new ByteReader(new Uint8Array([0x01, 0x02, 0xAA, 0xBB]))
    const chunks = [...readChunkStream(reader, 'end-of-data')]
    expect(chunks).toEqual([{ id: 0x01, bytes: new Uint8Array([0xAA, 0xBB]) }])
    expect(reader.isAtEnd).toBe(true)
  })

  it('throws on a stray id-zero terminator in an end-of-data stream', () => {
    const reader = new ByteReader(new Uint8Array([0x01, 0x01, 0xAA, 0x00]))
    expect(() => [...readChunkStream(reader, 'end-of-data')]).toThrow('Unexpected chunk terminator in an end-of-data stream')
  })
})

describe('fixed-width primitives', () => {
  it('round-trips int16 as little-endian', () => {
    const writer = new ByteWriter()
    writer.writeInt16(-1234)
    expect([...writer.toBytes()]).toEqual([0x2E, 0xFB])
    expect(new ByteReader(writer.toBytes()).readInt16()).toBe(-1234)
  })

  it('round-trips uint32 as little-endian', () => {
    const writer = new ByteWriter()
    writer.writeUint32(0xDEADBEEF)
    expect([...writer.toBytes()]).toEqual([0xEF, 0xBE, 0xAD, 0xDE])
    expect(new ByteReader(writer.toBytes()).readUint32()).toBe(0xDEADBEEF)
  })

  it('round-trips a double as little-endian IEEE 754', () => {
    const writer = new ByteWriter()
    writer.writeDouble(1.5)
    expect([...writer.toBytes()]).toEqual([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF8, 0x3F])
    expect(new ByteReader(writer.toBytes()).readDouble()).toBe(1.5)
  })
})
