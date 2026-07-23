import type { FieldCodec, FieldDefaultValue } from '../../src/codec/descriptors.ts'
import type { EnumDef, FlagSetDef, LcfTables, StructDef, TypeExpression } from './tables.ts'
import { parseDefaultCell } from './defaults.ts'
import { toCamelCase, toObjectKey } from './names.ts'
import { classifyNamedType, resolveEnum } from './tables.ts'

const GENERATED_HEADER = '// Generated from vendor/liblcf-csv by `pnpm run generate` – do not edit.\n'
  + '// Field tables derived from EasyRPG/liblcf (MIT, © 2014-2025 liblcf authors),\n'
  + '// https://github.com/EasyRPG/liblcf @ 666e6c0. See the root LICENSE.\n'

/** Raw structs that appear as chunk payloads (all other raw structs only occur inside vectors or at top level). */
const EMBEDDABLE_RAW_STRUCTS = new Set(['Parameters', 'Equipment', 'Rect'])

/** liblcf's `Map` would shadow the ES built-in in every consumer file. */
const RECORD_NAME_OVERRIDES: Record<string, string> = { Map: 'MapUnit' }

function toRecordName(structName: string): string {
  return RECORD_NAME_OVERRIDES[structName] ?? structName
}

const SCALAR_BY_PRIMITIVE: Record<string, FieldCodec> = {
  Int32: { kind: 'scalar', scalar: 'berInt' },
  UInt32: { kind: 'scalar', scalar: 'uint32' },
  Int16: { kind: 'scalar', scalar: 'int16' },
  Int8: { kind: 'scalar', scalar: 'int8' },
  UInt8: { kind: 'scalar', scalar: 'uint8' },
  Boolean: { kind: 'scalar', scalar: 'boolean' },
  Double: { kind: 'scalar', scalar: 'double' },
  String: { kind: 'string' },
  DBString: { kind: 'string' },
  DatabaseVersion: { kind: 'databaseVersion' },
  EmptyBlock: { kind: 'emptyBlock' },
}

const VECTOR_ELEMENT_BY_PRIMITIVE: Record<string, 'boolean' | 'uint8' | 'int16' | 'int32' | 'uint32'> = {
  Boolean: 'boolean',
  UInt8: 'uint8',
  Int16: 'int16',
  Int32: 'int32',
  UInt32: 'uint32',
}

interface GeneratedField {
  key: string
  id: number | undefined
  sizeId: number | undefined
  sizeKind: 'byteLength' | 'elementCount' | undefined
  isSizePersistedIfDefault: boolean | undefined
  codec: FieldCodec
  enumRef: string | undefined
  refRecord: string | undefined
  default: FieldDefaultValue | undefined
  isPersistedIfDefault: boolean
  is2k3Only: boolean
}

interface GeneratedStruct {
  name: string
  framing: StructDef['framing']
  fields: GeneratedField[]
}

export interface GeneratedModel {
  structs: GeneratedStruct[]
  flagSets: FlagSetDef[]
  enums: EnumDef[]
}

export function buildModel(tables: LcfTables, selected: StructDef[]): GeneratedModel {
  const usedFlagSets = new Map<string, FlagSetDef>()
  const usedEnums = new Map<string, EnumDef>()

  const structs = selected.map((struct): GeneratedStruct => {
    const fields = (tables.fieldsByStruct.get(struct.name) ?? []).map((field): GeneratedField => {
      const codec = resolveFieldCodec(tables, field.type)
      if (codec.kind === 'flags')
        usedFlagSets.set(codec.flagSet, tables.flagSetByStruct.get(codec.flagSet)!)
      let enumRef: string | undefined
      if (field.type.kind === 'enum') {
        const enumDef = resolveEnum(tables, field.type.enumName)
        enumRef = `${enumDef.structName}${enumDef.enumName}`
        usedEnums.set(enumRef, enumDef)
      }
      return {
        key: toCamelCase(field.fieldName),
        id: field.chunkId,
        sizeId: field.sizeChunkId,
        sizeKind: field.sizeChunkId === undefined
          ? undefined
          : field.sizeFieldRawType!.startsWith('Count<') ? 'elementCount' : 'byteLength',
        isSizePersistedIfDefault: field.sizeIsPersistedIfDefault,
        codec,
        enumRef,
        refRecord: field.type.kind === 'ref' ? toRecordName(field.type.targetStruct) : undefined,
        default: parseDefaultCell(field.rawDefault, codec),
        isPersistedIfDefault: field.isPersistedIfDefault,
        is2k3Only: field.is2k3Only,
      }
    })
    return { name: toRecordName(struct.name), framing: struct.framing, fields }
  })

  return {
    structs,
    flagSets: [...usedFlagSets.values()],
    enums: [...usedEnums.values()],
  }
}

function resolveFieldCodec(tables: LcfTables, type: TypeExpression): FieldCodec {
  switch (type.kind) {
    case 'named': {
      const named = classifyNamedType(tables, type.name)
      if (named === 'primitive')
        return SCALAR_BY_PRIMITIVE[type.name]!
      if (named === 'flags')
        return { kind: 'flags', flagSet: type.name.slice(0, -'_Flags'.length) }
      const struct = tables.structByName.get(type.name)!
      if (struct.framing === 'raw') {
        if (!EMBEDDABLE_RAW_STRUCTS.has(type.name))
          throw new Error(`Raw struct ${type.name} is not expected as a chunk payload`)
        return { kind: 'rawField', record: type.name }
      }
      return { kind: 'record', record: toRecordName(type.name) }
    }
    case 'enum':
      return { kind: 'scalar', scalar: 'berInt' }
    case 'ref':
      return { kind: 'scalar', scalar: type.storage === 'Int16' ? 'int16' : 'berInt' }
    case 'array':
      return { kind: 'array', record: toRecordName(type.elementStruct) }
    case 'vector':
      return resolveVectorCodec(tables, type.element)
    case 'dbArray':
      return { kind: 'berIntList' }
    case 'dbBitArray':
      return { kind: 'dbBitArray' }
    case 'count':
      throw new Error('Count<> should only occur in folded size rows')
  }
}

function resolveVectorCodec(tables: LcfTables, element: TypeExpression): FieldCodec {
  if (element.kind === 'named') {
    const elementKind = VECTOR_ELEMENT_BY_PRIMITIVE[element.name]
    if (elementKind !== undefined)
      return { kind: 'vector', element: elementKind }
    if (element.name === 'EventCommand')
      return { kind: 'eventCommands' }
    if (element.name === 'MoveCommand')
      return { kind: 'moveCommands' }
    throw new Error(`Unsupported vector element: ${element.name}`)
  }
  // Refs in vectors are stored fixed-width, matching their storage type.
  if (element.kind === 'ref')
    return { kind: 'vector', element: element.storage === 'Int16' ? 'int16' : 'int32' }
  throw new Error(`Unsupported vector element kind: ${element.kind}`)
}

export function emitStructs(model: GeneratedModel): string {
  const lines: string[] = [
    GENERATED_HEADER,
    'import type { UnknownChunk } from \'../codec/descriptors.ts\'',
    '',
  ]

  for (const flagSet of model.flagSets) {
    lines.push(`export interface ${flagSet.structName}Flags {`)
    for (const bit of flagSet.bits)
      lines.push(`  ${toObjectKey(toCamelCase(bit.fieldName))}: boolean`)
    lines.push('}', '')
  }

  for (const struct of model.structs) {
    lines.push(`export interface ${struct.name} {`)
    if (struct.framing === 'chunkedIdIndexed')
      lines.push('  id: number')
    for (const field of struct.fields) {
      if (field.codec.kind === 'emptyBlock')
        continue
      lines.push(`  ${toObjectKey(field.key)}: ${fieldTsType(field.codec)}`)
    }
    if (struct.framing !== 'raw')
      lines.push('  _unknown?: UnknownChunk[]')
    lines.push('}', '')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function fieldTsType(codec: FieldCodec): string {
  switch (codec.kind) {
    case 'scalar':
      return codec.scalar === 'boolean' ? 'boolean' : 'number'
    case 'string':
      return 'string'
    case 'vector':
      return codec.element === 'boolean' ? 'boolean[]' : 'number[]'
    case 'berIntList':
      return 'number[]'
    case 'dbBitArray':
      return 'boolean[]'
    case 'flags':
      return `${codec.flagSet}Flags`
    case 'record':
    case 'rawField':
      return codec.record
    case 'array':
      return `${codec.record}[]`
    case 'eventCommands':
      return 'EventCommand[]'
    case 'moveCommands':
      return 'MoveCommand[]'
    case 'databaseVersion':
      return 'number'
    case 'emptyBlock':
      throw new Error('EmptyBlock fields carry no data')
  }
}

export function emitDescriptors(model: GeneratedModel): string {
  const lines: string[] = [
    GENERATED_HEADER,
    'import type { FlagBitDescriptor, RecordDescriptor } from \'../codec/descriptors.ts\'',
    '',
    'export const RECORD_DESCRIPTORS: Record<string, RecordDescriptor> = {',
  ]

  for (const struct of model.structs) {
    lines.push(`  ${toObjectKey(struct.name)}: {`)
    lines.push('    fields: [')
    for (const field of struct.fields)
      lines.push(`      { ${printField(field)} },`)
    lines.push('    ],')
    lines.push('  },')
  }
  lines.push('}', '')

  lines.push('export const FLAG_SETS: Record<string, FlagBitDescriptor[]> = {')
  for (const flagSet of model.flagSets) {
    lines.push(`  ${toObjectKey(flagSet.structName)}: [`)
    for (const bit of flagSet.bits) {
      const properties = [`key: '${toCamelCase(bit.fieldName)}'`]
      if (bit.is2k3Only)
        properties.push('is2k3Only: true')
      lines.push(`    { ${properties.join(', ')} },`)
    }
    lines.push('  ],')
  }
  lines.push('}')

  return `${lines.join('\n')}\n`
}

function printField(field: GeneratedField): string {
  const properties = [`key: '${field.key}'`]
  if (field.id !== undefined)
    properties.push(`id: ${printChunkId(field.id)}`)
  if (field.sizeId !== undefined) {
    properties.push(`sizeId: ${printChunkId(field.sizeId)}`)
    properties.push(`sizeKind: '${field.sizeKind}'`)
    if (field.isSizePersistedIfDefault)
      properties.push('isSizePersistedIfDefault: true')
  }
  properties.push(`codec: ${printValue(field.codec)}`)
  if (field.enumRef !== undefined)
    properties.push(`enumRef: '${field.enumRef}'`)
  if (field.refRecord !== undefined)
    properties.push(`refRecord: '${field.refRecord}'`)
  if (field.default !== undefined)
    properties.push(`default: ${printValue(field.default)}`)
  if (field.isPersistedIfDefault)
    properties.push('isPersistedIfDefault: true')
  if (field.is2k3Only)
    properties.push('is2k3Only: true')
  return properties.join(', ')
}

function printChunkId(id: number): string {
  return `0x${id.toString(16).toUpperCase().padStart(2, '0')}`
}

/** Literal printer matching the lint style (single quotes, identifier keys). */
function printValue(value: unknown): string {
  if (typeof value === 'string')
    return `'${value.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}'`
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (Array.isArray(value))
    return `[${value.map(printValue).join(', ')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .map(([key, entryValue]) => `${toObjectKey(key)}: ${printValue(entryValue)}`)
    return `{ ${entries.join(', ')} }`
  }
  throw new Error(`Cannot print value: ${String(value)}`)
}

export function emitEnums(model: GeneratedModel): string {
  const lines: string[] = [GENERATED_HEADER]
  const sortedEnums = [...model.enums].sort((left, right) =>
    `${left.structName}${left.enumName}`.localeCompare(`${right.structName}${right.enumName}`))

  for (const enumDef of sortedEnums) {
    lines.push(`export const ${enumDef.structName}${enumDef.enumName} = {`)
    for (const member of enumDef.members)
      lines.push(`  ${toObjectKey(toCamelCase(member.label))}: ${member.value},`)
    lines.push('} as const', '')
  }

  return `${lines.join('\n').trimEnd()}\n`
}
