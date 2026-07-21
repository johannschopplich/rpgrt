import { describe, expect, it } from 'vitest'
import { ByteReader } from '../src/codec/reader.ts'
import { ByteWriter } from '../src/codec/writer.ts'

describe('ber varint', () => {
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

describe('fixed-width primitives', () => {
  it('round-trips int16, uint32, and double', () => {
    const writer = new ByteWriter()
    writer.writeInt16(-1234)
    writer.writeUint32(0xDEADBEEF)
    writer.writeDouble(1.5)
    const reader = new ByteReader(writer.toBytes())
    expect(reader.readInt16()).toBe(-1234)
    expect(reader.readUint32()).toBe(0xDEADBEEF)
    expect(reader.readDouble()).toBe(1.5)
    expect(reader.isAtEnd).toBe(true)
  })
})
