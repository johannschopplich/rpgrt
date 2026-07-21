export class ByteWriter {
  private buffer = new Uint8Array(1024)
  private byteLength = 0
  private readonly scratch = new DataView(new ArrayBuffer(8))

  private reserve(extraByteCount: number): void {
    const required = this.byteLength + extraByteCount
    if (required <= this.buffer.length)
      return
    let capacity = this.buffer.length * 2
    while (capacity < required)
      capacity *= 2
    const grown = new Uint8Array(capacity)
    grown.set(this.buffer.subarray(0, this.byteLength))
    this.buffer = grown
  }

  writeByte(value: number): void {
    this.reserve(1)
    this.buffer[this.byteLength++] = value
  }

  writeBytes(bytes: Uint8Array): void {
    this.reserve(bytes.length)
    this.buffer.set(bytes, this.byteLength)
    this.byteLength += bytes.length
  }

  writeInt16(value: number): void {
    this.reserve(2)
    this.buffer[this.byteLength++] = value & 0xFF
    this.buffer[this.byteLength++] = (value >> 8) & 0xFF
  }

  /** 4-byte little-endian word; two's complement covers Int32 and UInt32 alike. */
  writeUint32(value: number): void {
    this.reserve(4)
    this.buffer[this.byteLength++] = value & 0xFF
    this.buffer[this.byteLength++] = (value >> 8) & 0xFF
    this.buffer[this.byteLength++] = (value >> 16) & 0xFF
    this.buffer[this.byteLength++] = (value >> 24) & 0xFF
  }

  writeDouble(value: number): void {
    this.scratch.setFloat64(0, value, true)
    this.reserve(8)
    for (let index = 0; index < 8; index++)
      this.buffer[this.byteLength++] = this.scratch.getUint8(index)
  }

  /** BER varint; negative values are written as their unsigned 32-bit form. */
  writeBer(value: number): void {
    let unsigned = value >>> 0
    if (unsigned < 0x80) {
      this.writeByte(unsigned)
      return
    }
    const groups: number[] = []
    while (unsigned > 0) {
      groups.push(unsigned & 0x7F)
      unsigned = Math.floor(unsigned / 0x80)
    }
    for (let index = groups.length - 1; index >= 1; index--)
      this.writeByte(groups[index]! | 0x80)
    this.writeByte(groups[0]!)
  }

  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.byteLength)
  }
}
