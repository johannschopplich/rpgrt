import type { EngineVersion } from '../index.ts'
import type { FieldDescriptor, UnknownChunk } from './descriptors.ts'
import type { ByteReader } from './reader.ts'
import type { Transcoder } from './transcoder.ts'
import { FLAG_SETS, RECORD_DESCRIPTORS } from '../generated/descriptors.ts'
import { MoveCommandCode } from '../generated/enums.ts'
import { deepEquals, resolveDefault } from './defaults.ts'
import { inPath, LcfError } from './errors.ts'
import { ByteWriter } from './writer.ts'

export interface CodecContext {
  engine: EngineVersion
  transcoder: Transcoder
}

export type LcfRecord = Record<string, unknown>

// RPG_RT omits these Terms chunks when default in a 2k3 database even though
// they are persist-if-default (docs/serialization.md §8).
const TERMS_2K3_OMITTED_CHUNK_IDS = new Set([0x01, 0x03])

const VECTOR_ELEMENT_BYTE_WIDTH = { boolean: 1, uint8: 1, int16: 2, int32: 4, uint32: 4 } as const

const PARAMETERS_SERIES_KEYS = ['maxhp', 'maxsp', 'attack', 'defense', 'spirit', 'agility'] as const
const EQUIPMENT_SLOT_KEYS = ['weaponId', 'shieldId', 'armorId', 'helmetId', 'accessoryId'] as const
const RECT_EDGE_KEYS = ['l', 't', 'r', 'b'] as const

interface ChunkOwner {
  field: FieldDescriptor
  isSizeChunk: boolean
}

const chunkOwnersByRecord = new Map<string, Map<number, ChunkOwner>>()

function chunkOwners(recordName: string): Map<number, ChunkOwner> {
  let owners = chunkOwnersByRecord.get(recordName)
  if (owners === undefined) {
    owners = new Map()
    for (const field of RECORD_DESCRIPTORS[recordName]!.fields) {
      if (field.id !== undefined)
        owners.set(field.id, { field, isSizeChunk: false })
      if (field.sizeId !== undefined)
        owners.set(field.sizeId, { field, isSizeChunk: true })
    }
    chunkOwnersByRecord.set(recordName, owners)
  }
  return owners
}

// --- Decoding ---------------------------------------------------------------

export function decodeChunkStream(recordName: string, reader: ByteReader, context: CodecContext, path: string, isEndOfDataTerminated = false): LcfRecord {
  const descriptor = RECORD_DESCRIPTORS[recordName]!
  const owners = chunkOwners(recordName)
  const decodedFields: LcfRecord = {}
  const unknownChunks: UnknownChunk[] = []

  while (true) {
    if (reader.isAtEnd) {
      if (isEndOfDataTerminated)
        break
      throw new LcfError('Chunk stream ended without a terminator', { path, offset: reader.offset })
    }
    const chunkId = reader.readBerUnsigned()
    if (chunkId === 0)
      break
    const chunkLength = reader.readBerUnsigned()
    const owner = owners.get(chunkId)
    if (owner === undefined) {
      unknownChunks.push({ id: chunkId, bytes: reader.readBytes(chunkLength) })
      continue
    }
    // Size chunk values are recomputed on encode; the data chunk's own length
    // is authoritative (docs/serialization.md §4).
    if (owner.isSizeChunk || owner.field.codec.kind === 'emptyBlock') {
      reader.skip(chunkLength)
      continue
    }
    const field = owner.field
    const fieldPath = `${path}.${field.key}`
    const start = reader.offset
    decodedFields[field.key] = inPath(fieldPath, () => decodeFieldPayload(field, chunkLength, reader, context, fieldPath))
    if (reader.offset !== start + chunkLength)
      throw new LcfError(`Chunk declared ${chunkLength} bytes but ${reader.offset - start} were consumed`, { path: fieldPath, offset: reader.offset })
  }

  const record: LcfRecord = {}
  for (const field of descriptor.fields) {
    if (field.codec.kind === 'emptyBlock')
      continue
    record[field.key] = field.key in decodedFields
      ? decodedFields[field.key]
      : resolveDefault(field, context.engine)
  }
  if (unknownChunks.length > 0)
    record._unknown = unknownChunks
  return record
}

function decodeFieldPayload(field: FieldDescriptor, byteLength: number, reader: ByteReader, context: CodecContext, path: string): unknown {
  const codec = field.codec
  switch (codec.kind) {
    case 'scalar':
      switch (codec.scalar) {
        case 'berInt': return reader.readBer()
        case 'boolean': return reader.readBer() > 0
        case 'int8': return reader.readInt8()
        case 'uint8': return reader.readByte()
        case 'int16': return reader.readInt16()
        case 'uint32': return reader.readUint32()
        case 'double': return reader.readDouble()
      }
      break
    case 'string':
      return context.transcoder.decode(reader.readBytes(byteLength))
    case 'vector':
      return decodeVector(codec.element, byteLength, reader, path)
    case 'dbBitArray':
      return Array.from(reader.readBytes(byteLength), byte => byte > 0)
    case 'flags':
      return decodeFlags(codec.flagSet, reader.readBytes(byteLength))
    case 'record':
      return decodeChunkStream(codec.record, reader, context, path)
    case 'rawField':
      return decodeRawField(codec.record, byteLength, reader, path)
    case 'array':
      return decodeArray(codec.record, reader, context, path)
    case 'eventCommands':
      return decodeEventCommands(byteLength, reader, context, path)
    case 'moveCommands':
      return decodeMoveCommands(byteLength, reader, context)
    case 'databaseVersion':
      return byteLength === 0 ? 0 : reader.readBer()
    case 'berIntList':
    case 'emptyBlock':
      break
  }
  throw new LcfError(`Codec ${codec.kind} cannot appear as a chunk payload`, { path })
}

function decodeVector(element: keyof typeof VECTOR_ELEMENT_BYTE_WIDTH, byteLength: number, reader: ByteReader, path: string): unknown[] {
  const width = VECTOR_ELEMENT_BYTE_WIDTH[element]
  if (byteLength % width !== 0)
    throw new LcfError(`Vector payload of ${byteLength} bytes is not a multiple of the ${width}-byte element size`, { path, offset: reader.offset })
  const elements: unknown[] = []
  for (let index = 0; index < byteLength / width; index++) {
    switch (element) {
      case 'boolean':
        elements.push(reader.readByte() > 0)
        break
      case 'uint8':
        elements.push(reader.readByte())
        break
      case 'int16':
        elements.push(reader.readInt16())
        break
      case 'int32':
        elements.push(reader.readInt32())
        break
      case 'uint32':
        elements.push(reader.readUint32())
        break
    }
  }
  return elements
}

function decodeFlags(flagSetName: string, bytes: Uint8Array): Record<string, boolean> {
  const flags: Record<string, boolean> = {}
  FLAG_SETS[flagSetName]!.forEach((bit, index) => {
    const byte = bytes[index >> 3]
    flags[bit.key] = byte === undefined ? false : ((byte >> (index & 7)) & 1) === 1
  })
  return flags
}

export function decodeArray(recordName: string, reader: ByteReader, context: CodecContext, path: string): LcfRecord[] {
  const elementCount = reader.readBerUnsigned()
  const elements: LcfRecord[] = []
  for (let index = 0; index < elementCount; index++) {
    const id = reader.readBerUnsigned()
    elements.push({ id, ...decodeChunkStream(recordName, reader, context, `${path}[${index}]`) })
  }
  return elements
}

function decodeRawField(recordName: string, byteLength: number, reader: ByteReader, path: string): LcfRecord {
  switch (recordName) {
    case 'Parameters': {
      if (byteLength % 12 !== 0)
        throw new LcfError(`Parameters payload of ${byteLength} bytes is not a multiple of 12`, { path, offset: reader.offset })
      const elementCount = byteLength / 12
      const record: LcfRecord = {}
      for (const key of PARAMETERS_SERIES_KEYS) {
        const series: number[] = []
        for (let index = 0; index < elementCount; index++)
          series.push(reader.readInt16())
        record[key] = series
      }
      return record
    }
    case 'Equipment': {
      if (byteLength !== 10)
        throw new LcfError(`Equipment payload must be 10 bytes, got ${byteLength}`, { path, offset: reader.offset })
      const record: LcfRecord = {}
      for (const key of EQUIPMENT_SLOT_KEYS)
        record[key] = reader.readInt16()
      return record
    }
    case 'Rect': {
      if (byteLength !== 16)
        throw new LcfError(`Rect payload must be 16 bytes, got ${byteLength}`, { path, offset: reader.offset })
      const record: LcfRecord = {}
      for (const key of RECT_EDGE_KEYS)
        record[key] = reader.readUint32()
      return record
    }
  }
  throw new LcfError(`Raw record ${recordName} cannot appear as a chunk payload`, { path })
}

function decodeEventCommands(byteLength: number, reader: ByteReader, context: CodecContext, path: string): LcfRecord[] {
  const end = reader.offset + byteLength
  const commands: LcfRecord[] = []
  while (reader.offset < end && reader.peekByte() !== 0) {
    commands.push({
      code: reader.readBer(),
      indent: reader.readBer(),
      string: context.transcoder.decode(reader.readBytes(reader.readBerUnsigned())),
      parameters: Array.from({ length: reader.readBerUnsigned() }, () => reader.readBer()),
    })
  }
  for (let index = 0; index < 4; index++) {
    if (reader.readByte() !== 0)
      throw new LcfError('Event command list does not end in four zero bytes', { path, offset: reader.offset })
  }
  return commands
}

function decodeMoveCommands(byteLength: number, reader: ByteReader, context: CodecContext): LcfRecord[] {
  const end = reader.offset + byteLength
  const commands: LcfRecord[] = []
  while (reader.offset < end)
    commands.push(decodeMoveCommand(reader, context))
  return commands
}

function decodeMoveCommand(reader: ByteReader, context: CodecContext): LcfRecord {
  const commandId = reader.readBer()
  let parameterString = ''
  let parameterA = 0
  let parameterB = 0
  let parameterC = 0
  switch (commandId) {
    case MoveCommandCode.switchOn:
    case MoveCommandCode.switchOff:
      parameterA = reader.readBer()
      break
    case MoveCommandCode.changeGraphic:
      parameterString = context.transcoder.decode(reader.readBytes(reader.readBerUnsigned()))
      parameterA = reader.readBer()
      break
    case MoveCommandCode.playSoundEffect:
      parameterString = context.transcoder.decode(reader.readBytes(reader.readBerUnsigned()))
      parameterA = reader.readBer()
      parameterB = reader.readBer()
      parameterC = reader.readBer()
      break
  }
  return { commandId, parameterString, parameterA, parameterB, parameterC }
}

export function decodeTreeMap(reader: ByteReader, context: CodecContext, path: string): LcfRecord {
  const maps = decodeArray('MapInfo', reader, context, `${path}.maps`)
  const treeOrder: number[] = []
  const treeOrderCount = reader.readBerUnsigned()
  for (let index = 0; index < treeOrderCount; index++)
    treeOrder.push(reader.readBer())
  const activeNode = reader.readBer()
  const start = decodeChunkStream('Start', reader, context, `${path}.start`)
  return { maps, treeOrder, activeNode, start }
}

// --- Encoding ---------------------------------------------------------------

export function encodeChunkStream(recordName: string, record: LcfRecord, writer: ByteWriter, context: CodecContext, path: string, hasTerminator: boolean): void {
  const descriptor = RECORD_DESCRIPTORS[recordName]!
  const unknownChunks = (record._unknown as UnknownChunk[] | undefined) ?? []
  let unknownIndex = 0

  const flushUnknownBefore = (chunkId: number): void => {
    while (unknownIndex < unknownChunks.length && unknownChunks[unknownIndex]!.id < chunkId) {
      const chunk = unknownChunks[unknownIndex++]!
      writer.writeBer(chunk.id)
      writer.writeBer(chunk.bytes.length)
      writer.writeBytes(chunk.bytes)
    }
  }

  const writeChunk = (chunkId: number, payload: Uint8Array): void => {
    writer.writeBer(chunkId)
    writer.writeBer(payload.length)
    writer.writeBytes(payload)
  }

  for (const field of descriptor.fields) {
    if (field.is2k3Only && context.engine === '2k')
      continue
    flushUnknownBefore(field.sizeId ?? field.id!)
    const fieldPath = `${path}.${field.key}`

    if (field.codec.kind === 'emptyBlock') {
      writer.writeBer(field.id!)
      writer.writeBer(0)
      continue
    }
    if (field.codec.kind === 'databaseVersion') {
      const version = record[field.key] as number
      if (context.engine === '2k' && version === 0)
        continue
      writer.writeBer(field.id!)
      if (version === 0) {
        writer.writeBer(0)
      }
      else {
        const payload = new ByteWriter()
        payload.writeBer(version)
        const bytes = payload.toBytes()
        writer.writeBer(bytes.length)
        writer.writeBytes(bytes)
      }
      continue
    }

    const value = record[field.key] ?? resolveDefault(field, context.engine)
    const isDefaultValue = deepEquals(value, resolveDefault(field, context.engine))
    const isForcedOmitWhenDefault = recordName === 'Terms' && context.engine === '2k3' && TERMS_2K3_OMITTED_CHUNK_IDS.has(field.id!)
    const shouldWriteData = isForcedOmitWhenDefault
      ? !isDefaultValue
      : (field.isPersistedIfDefault === true || !isDefaultValue)
    const shouldWriteSize = field.sizeId !== undefined
      && (field.isSizePersistedIfDefault === true || !isDefaultValue)

    let payload: Uint8Array | undefined
    if (shouldWriteData || (shouldWriteSize && field.sizeKind === 'byteLength'))
      payload = inPath(fieldPath, () => encodeFieldPayload(field, value, context, fieldPath))
    if (shouldWriteSize) {
      const sizeValue = field.sizeKind === 'elementCount' ? (value as unknown[]).length : payload!.length
      const sizePayload = new ByteWriter()
      sizePayload.writeBer(sizeValue)
      writeChunk(field.sizeId!, sizePayload.toBytes())
    }
    if (shouldWriteData)
      writeChunk(field.id!, payload!)
  }
  flushUnknownBefore(Number.POSITIVE_INFINITY)
  if (hasTerminator)
    writer.writeByte(0)
}

function encodeFieldPayload(field: FieldDescriptor, value: unknown, context: CodecContext, path: string): Uint8Array {
  const writer = new ByteWriter()
  const codec = field.codec
  switch (codec.kind) {
    case 'scalar':
      switch (codec.scalar) {
        case 'berInt':
          writer.writeBer(value as number)
          break
        case 'boolean':
          writer.writeByte(value ? 1 : 0)
          break
        case 'int8':
        case 'uint8':
          writer.writeByte((value as number) & 0xFF)
          break
        case 'int16':
          writer.writeInt16(value as number)
          break
        case 'uint32':
          writer.writeUint32(value as number)
          break
        case 'double':
          writer.writeDouble(value as number)
          break
      }
      break
    case 'string':
      writer.writeBytes(context.transcoder.encode(value as string))
      break
    case 'vector':
      encodeVector(codec.element, value as (number | boolean)[], writer)
      break
    case 'dbBitArray':
      for (const flag of value as boolean[])
        writer.writeByte(flag ? 1 : 0)
      break
    case 'flags':
      encodeFlags(codec.flagSet, value as Record<string, boolean>, context.engine, writer)
      break
    case 'record':
      encodeChunkStream(codec.record, value as LcfRecord, writer, context, path, true)
      break
    case 'rawField':
      encodeRawField(codec.record, value as LcfRecord, writer, path)
      break
    case 'array':
      encodeArray(codec.record, value as LcfRecord[], writer, context, path)
      break
    case 'eventCommands':
      encodeEventCommands(value as LcfRecord[], writer, context, path)
      break
    case 'moveCommands':
      for (const command of value as LcfRecord[])
        encodeMoveCommand(command, writer, context)
      break
    case 'berIntList':
    case 'databaseVersion':
    case 'emptyBlock':
      throw new LcfError(`Codec ${codec.kind} cannot be encoded as a plain chunk payload`, { path })
  }
  return writer.toBytes()
}

function encodeVector(element: keyof typeof VECTOR_ELEMENT_BYTE_WIDTH, elements: (number | boolean)[], writer: ByteWriter): void {
  for (const value of elements) {
    switch (element) {
      case 'boolean':
        writer.writeByte(value ? 1 : 0)
        break
      case 'uint8':
        writer.writeByte((value as number) & 0xFF)
        break
      case 'int16':
        writer.writeInt16(value as number)
        break
      case 'int32':
      case 'uint32':
        writer.writeUint32(value as number)
        break
    }
  }
}

function encodeFlags(flagSetName: string, flags: Record<string, boolean>, engine: EngineVersion, writer: ByteWriter): void {
  // 2k3-only bits are dropped before packing, shifting later bit positions
  // (docs/serialization.md §5).
  const activeBits = FLAG_SETS[flagSetName]!.filter(bit => engine === '2k3' || bit.is2k3Only !== true)
  const bytes = new Uint8Array(Math.ceil(activeBits.length / 8))
  activeBits.forEach((bit, index) => {
    if (flags[bit.key] === true)
      bytes[index >> 3]! |= 1 << (index & 7)
  })
  writer.writeBytes(bytes)
}

export function encodeArray(recordName: string, elements: LcfRecord[], writer: ByteWriter, context: CodecContext, path: string): void {
  writer.writeBer(elements.length)
  elements.forEach((element, index) => {
    const elementPath = `${path}[${index}]`
    const id = element.id
    if (typeof id !== 'number')
      throw new LcfError('Array element is missing its numeric id', { path: elementPath })
    writer.writeBer(id)
    encodeChunkStream(recordName, element, writer, context, elementPath, true)
  })
}

function encodeRawField(recordName: string, record: LcfRecord, writer: ByteWriter, path: string): void {
  switch (recordName) {
    case 'Parameters': {
      const seriesLength = (record[PARAMETERS_SERIES_KEYS[0]] as number[]).length
      for (const key of PARAMETERS_SERIES_KEYS) {
        const series = record[key] as number[]
        if (series.length !== seriesLength)
          throw new LcfError(`Parameters series ${key} has ${series.length} entries, expected ${seriesLength}`, { path })
        for (const value of series)
          writer.writeInt16(value)
      }
      return
    }
    case 'Equipment': {
      for (const key of EQUIPMENT_SLOT_KEYS)
        writer.writeInt16(record[key] as number)
      return
    }
    case 'Rect': {
      for (const key of RECT_EDGE_KEYS)
        writer.writeUint32(record[key] as number)
      return
    }
  }
  throw new LcfError(`Raw record ${recordName} cannot be encoded as a chunk payload`, { path })
}

function encodeEventCommands(commands: LcfRecord[], writer: ByteWriter, context: CodecContext, path: string): void {
  commands.forEach((command, index) => {
    if (command.code === 0)
      throw new LcfError('Event command code 0 is reserved as the list terminator', { path: `${path}[${index}]` })
    writer.writeBer(command.code as number)
    writer.writeBer(command.indent as number)
    const stringBytes = context.transcoder.encode(command.string as string)
    writer.writeBer(stringBytes.length)
    writer.writeBytes(stringBytes)
    const parameters = command.parameters as number[]
    writer.writeBer(parameters.length)
    for (const parameter of parameters)
      writer.writeBer(parameter)
  })
  for (let index = 0; index < 4; index++)
    writer.writeByte(0)
}

function encodeMoveCommand(command: LcfRecord, writer: ByteWriter, context: CodecContext): void {
  const commandId = command.commandId as number
  writer.writeBer(commandId)
  switch (commandId) {
    case MoveCommandCode.switchOn:
    case MoveCommandCode.switchOff:
      writer.writeBer(command.parameterA as number)
      break
    case MoveCommandCode.changeGraphic: {
      const stringBytes = context.transcoder.encode(command.parameterString as string)
      writer.writeBer(stringBytes.length)
      writer.writeBytes(stringBytes)
      writer.writeBer(command.parameterA as number)
      break
    }
    case MoveCommandCode.playSoundEffect: {
      const stringBytes = context.transcoder.encode(command.parameterString as string)
      writer.writeBer(stringBytes.length)
      writer.writeBytes(stringBytes)
      writer.writeBer(command.parameterA as number)
      writer.writeBer(command.parameterB as number)
      writer.writeBer(command.parameterC as number)
      break
    }
  }
}

export function encodeTreeMap(record: LcfRecord, writer: ByteWriter, context: CodecContext, path: string): void {
  encodeArray('MapInfo', record.maps as LcfRecord[], writer, context, `${path}.maps`)
  const treeOrder = record.treeOrder as number[]
  writer.writeBer(treeOrder.length)
  for (const node of treeOrder)
    writer.writeBer(node)
  writer.writeBer(record.activeNode as number)
  encodeChunkStream('Start', record.start as LcfRecord, writer, context, `${path}.start`, true)
}
