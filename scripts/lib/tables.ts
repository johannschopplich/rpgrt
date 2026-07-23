import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv } from './csv.ts'

export type LcfFormat = 'ldb' | 'lmt' | 'lmu' | 'lsd'

/**
 * How a struct sits in the byte stream: `raw` structs are bare sequential
 * fields without chunk framing; `chunkedIdIndexed` structs additionally carry
 * a 1-based ID when stored in an `Array<>`.
 */
export type StructFraming = 'raw' | 'chunked' | 'chunkedIdIndexed'

export interface StructDef {
  format: LcfFormat
  name: string
  framing: StructFraming
  /** Struct whose fields this one inherits (lsd `SaveMapEventBase` only). */
  base: string | undefined
}

/** Syntactic parse of a fields.csv type string; serialization semantics are assigned at emit time. */
export type TypeExpression
  = | { kind: 'named', name: string }
    | { kind: 'enum', enumName: string }
    | { kind: 'ref', targetStruct: string, storage: string }
    | { kind: 'array', elementStruct: string, indexRef: TypeExpression | undefined }
    | { kind: 'vector', element: TypeExpression }
    | { kind: 'count', sized: TypeExpression }
    | { kind: 'dbArray', element: TypeExpression }
    | { kind: 'dbBitArray' }

export interface FieldDef {
  structName: string
  fieldName: string
  type: TypeExpression
  rawType: string
  /** Undefined for fields of raw structs, which are positional. */
  chunkId: number | undefined
  /** Chunk ID of the companion size chunk, folded in from the preceding `t` row. */
  sizeChunkId: number | undefined
  sizeFieldRawType: string | undefined
  /** The size row carries its own persist flag, which can differ from the data row's. */
  sizeIsPersistedIfDefault: boolean | undefined
  /** Unparsed default cell; may contain a `2k|2k3` split. Empty string = no default. */
  rawDefault: string
  isPersistedIfDefault: boolean
  is2k3Only: boolean
  comment: string
}

export interface EnumMember {
  label: string
  value: number
}

export interface EnumDef {
  structName: string
  enumName: string
  members: EnumMember[]
}

export interface FlagBit {
  fieldName: string
  is2k3Only: boolean
}

export interface FlagSetDef {
  structName: string
  bits: FlagBit[]
}

export interface ConstantDef {
  structName: string
  name: string
  rawType: string
  rawValue: string
  comment: string
}

export interface LcfTables {
  structs: StructDef[]
  structByName: Map<string, StructDef>
  fieldsByStruct: Map<string, FieldDef[]>
  enums: EnumDef[]
  flagSetByStruct: Map<string, FlagSetDef>
  constants: ConstantDef[]
}

const PRIMITIVE_TYPE_NAMES: ReadonlySet<string> = new Set([
  'Int32',
  'UInt32',
  'Int16',
  'Int8',
  'UInt8',
  'Boolean',
  'Double',
  'String',
  'DBString',
  'DatabaseVersion',
  'EmptyBlock',
])

export function parseTypeExpression(rawType: string): TypeExpression {
  if (rawType === 'DBBitArray')
    return { kind: 'dbBitArray' }

  const openIndex = rawType.indexOf('<')
  if (openIndex === -1) {
    if (rawType.includes('>'))
      throw new Error(`Malformed type string: ${rawType}`)
    return { kind: 'named', name: rawType }
  }

  if (!rawType.endsWith('>'))
    throw new Error(`Malformed type string: ${rawType}`)
  const head = rawType.slice(0, openIndex)
  const inner = rawType.slice(openIndex + 1, -1)
  const parts = splitTopLevel(inner, ':')

  switch (head) {
    case 'Enum': {
      expectParts(rawType, parts, 1)
      return { kind: 'enum', enumName: parts[0]! }
    }
    case 'Ref': {
      if (parts.length === 1)
        return { kind: 'ref', targetStruct: parts[0]!, storage: 'Int32' }
      expectParts(rawType, parts, 2)
      return { kind: 'ref', targetStruct: parts[0]!, storage: parts[1]! }
    }
    case 'Array': {
      if (parts.length === 1)
        return { kind: 'array', elementStruct: parts[0]!, indexRef: undefined }
      expectParts(rawType, parts, 2)
      return { kind: 'array', elementStruct: parts[0]!, indexRef: parseTypeExpression(parts[1]!) }
    }
    case 'Vector': {
      expectParts(rawType, parts, 1)
      return { kind: 'vector', element: parseTypeExpression(parts[0]!) }
    }
    case 'Count': {
      expectParts(rawType, parts, 1)
      return { kind: 'count', sized: parseTypeExpression(parts[0]!) }
    }
    case 'DBArray': {
      expectParts(rawType, parts, 1)
      return { kind: 'dbArray', element: parseTypeExpression(parts[0]!) }
    }
    default:
      throw new Error(`Unknown generic type head: ${rawType}`)
  }
}

function expectParts(rawType: string, parts: string[], count: number): void {
  if (parts.length !== count)
    throw new Error(`Expected ${count} type argument(s) in: ${rawType}`)
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '<')
      depth++
    else if (char === '>')
      depth--
    if (char === separator && depth === 0) {
      parts.push(current)
      current = ''
    }
    else {
      current += char
    }
  }
  parts.push(current)
  return parts
}

export function loadTables(csvDirectory: string): LcfTables {
  const structs = loadStructs(join(csvDirectory, 'structs.csv'))
  const structByName = new Map(structs.map(struct => [struct.name, struct]))
  const fieldsByStruct = loadFields(join(csvDirectory, 'fields.csv'), structByName)
  const enums = loadEnums(join(csvDirectory, 'enums.csv'))
  const flagSetByStruct = loadFlagSets(join(csvDirectory, 'flags.csv'))
  const constants = loadConstants(join(csvDirectory, 'constants.csv'))
  return { structs, structByName, fieldsByStruct, enums, flagSetByStruct, constants }
}

function loadRows(filePath: string, expectedHeader: string[]): string[][] {
  const rows = parseCsv(readFileSync(filePath, 'utf8'))
  const header = rows[0]
  if (!header || expectedHeader.some((column, index) => header[index] !== column))
    throw new Error(`Unexpected header in ${filePath}: ${header?.join(',')}`)
  return rows.slice(1).filter(row => row.some(cell => cell !== ''))
}

function loadStructs(filePath: string): StructDef[] {
  return loadRows(filePath, ['Type', 'Structure', 'Base', 'Index available?']).map((row) => {
    const [format, name, base, indexAvailable] = row as [string, string, string, string]
    if (base !== '' && format !== 'lsd')
      throw new Error(`Unexpected base struct outside lsd: ${name}`)
    const framing: StructFraming
      = indexAvailable === '' ? 'raw' : indexAvailable === '1' ? 'chunkedIdIndexed' : 'chunked'
    return { format: format as LcfFormat, name, framing, base: base === '' ? undefined : base }
  })
}

function loadFields(filePath: string, structByName: Map<string, StructDef>): Map<string, FieldDef[]> {
  const header = ['Structure', 'Field', 'Size Field?', 'Type', 'Index', 'Default Value', 'PersistIfDefault', 'Is2k3', 'Comment']
  const fieldsByStruct = new Map<string, FieldDef[]>()
  let pendingSizeRow: { structName: string, fieldName: string, chunkId: number, rawType: string, isPersistedIfDefault: boolean } | undefined

  for (const row of loadRows(filePath, header)) {
    const [structName, fieldName, sizeMarker, rawType, chunkIdRaw, rawDefault, persistRaw, is2k3Raw, comment]
      = row as [string, string, string, string, string, string, string, string, string]
    if (!structByName.has(structName))
      throw new Error(`fields.csv references unknown struct: ${structName}`)

    const chunkId = chunkIdRaw === '' ? undefined : Number.parseInt(chunkIdRaw, 16)
    if (chunkIdRaw !== '' && Number.isNaN(chunkId))
      throw new Error(`Bad chunk ID for ${structName}.${fieldName}: ${chunkIdRaw}`)

    if (sizeMarker === 't') {
      if (pendingSizeRow !== undefined || chunkId === undefined)
        throw new Error(`Orphaned size row: ${structName}.${fieldName}`)
      pendingSizeRow = { structName, fieldName, chunkId, rawType, isPersistedIfDefault: persistRaw === '1' }
      continue
    }

    let sizeChunkId: number | undefined
    let sizeFieldRawType: string | undefined
    let sizeIsPersistedIfDefault: boolean | undefined
    if (pendingSizeRow !== undefined) {
      if (pendingSizeRow.structName !== structName || pendingSizeRow.fieldName !== fieldName)
        throw new Error(`Size row ${pendingSizeRow.structName}.${pendingSizeRow.fieldName} not followed by its data row`)
      sizeChunkId = pendingSizeRow.chunkId
      sizeFieldRawType = pendingSizeRow.rawType
      sizeIsPersistedIfDefault = pendingSizeRow.isPersistedIfDefault
      pendingSizeRow = undefined
    }

    const field: FieldDef = {
      structName,
      fieldName,
      type: parseTypeExpression(rawType),
      rawType,
      chunkId,
      sizeChunkId,
      sizeFieldRawType,
      sizeIsPersistedIfDefault,
      rawDefault,
      isPersistedIfDefault: persistRaw === '1',
      is2k3Only: is2k3Raw === '1',
      comment,
    }
    const list = fieldsByStruct.get(structName)
    if (list)
      list.push(field)
    else
      fieldsByStruct.set(structName, [field])
  }

  if (pendingSizeRow !== undefined)
    throw new Error(`Dangling size row at end of file: ${pendingSizeRow.structName}.${pendingSizeRow.fieldName}`)
  return fieldsByStruct
}

function loadEnums(filePath: string): EnumDef[] {
  const enums: EnumDef[] = []
  const byKey = new Map<string, EnumDef>()
  for (const row of loadRows(filePath, ['Structure', 'Entry', 'Value', 'Index'])) {
    const [structName, enumName, label, valueRaw] = row as [string, string, string, string]
    const value = Number.parseInt(valueRaw, 10)
    if (Number.isNaN(value))
      throw new Error(`Bad enum value for ${structName}.${enumName}.${label}: ${valueRaw}`)
    const key = `${structName} ${enumName}`
    let enumDef = byKey.get(key)
    if (!enumDef) {
      enumDef = { structName, enumName, members: [] }
      byKey.set(key, enumDef)
      enums.push(enumDef)
    }
    enumDef.members.push({ label, value })
  }
  return enums
}

/**
 * liblcf misspells this one reference `SavePartyLoction_PanState` in
 * vendor/liblcf-csv/fields.csv line 841 (liblcf @ 666e6c0); the enum itself is
 * `SavePartyLocation,PanState`. Normalize the typo rather than editing the
 * vendored CSV.
 */
const ENUM_REFERENCE_ALIASES: Record<string, string> = {
  SavePartyLoction_PanState: 'SavePartyLocation_PanState',
}

/**
 * `Enum<X>` references are written either as `Struct_Name` or as the bare
 * entry name when it is globally unique (e.g. `MapLayer`).
 */
export function resolveEnum(tables: LcfTables, rawReference: string): EnumDef {
  const enumReference = ENUM_REFERENCE_ALIASES[rawReference] ?? rawReference
  const qualified = tables.enums.filter(def => `${def.structName}_${def.enumName}` === enumReference)
  if (qualified.length === 1)
    return qualified[0]!
  const bare = tables.enums.filter(def => def.enumName === enumReference)
  if (bare.length === 1)
    return bare[0]!
  throw new Error(`Cannot resolve enum reference: ${enumReference} (${qualified.length + bare.length} candidates)`)
}

function loadFlagSets(filePath: string): Map<string, FlagSetDef> {
  const flagSetByStruct = new Map<string, FlagSetDef>()
  for (const row of loadRows(filePath, ['Structure', 'Field', 'Is2k3'])) {
    const [structName, fieldName, is2k3Raw] = row as [string, string, string]
    let flagSet = flagSetByStruct.get(structName)
    if (!flagSet) {
      flagSet = { structName, bits: [] }
      flagSetByStruct.set(structName, flagSet)
    }
    flagSet.bits.push({ fieldName, is2k3Only: is2k3Raw === '1' })
  }
  return flagSetByStruct
}

function loadConstants(filePath: string): ConstantDef[] {
  return loadRows(filePath, ['Structure', 'name', 'type', 'value', 'comment']).map((row) => {
    const [structName, name, rawType, rawValue, comment] = row as [string, string, string, string, string]
    return { structName, name, rawType, rawValue, comment }
  })
}

/** Named types that are neither primitives nor structs must be flag sets. */
export type NamedTypeClass = 'primitive' | 'struct' | 'flags'

export function classifyNamedType(tables: LcfTables, name: string): NamedTypeClass {
  if (PRIMITIVE_TYPE_NAMES.has(name))
    return 'primitive'
  if (tables.structByName.has(name))
    return 'struct'
  const flagsMatch = /^(?<owner>.+)_Flags$/.exec(name)
  if (flagsMatch && tables.flagSetByStruct.has(flagsMatch.groups!.owner!))
    return 'flags'
  throw new Error(`Unknown named type: ${name}`)
}

/**
 * Structs of the requested formats plus every struct they transitively embed.
 * Throws if the closure escapes the requested formats – scope creep in the
 * vendored CSVs should be a loud failure, not silent extra output.
 */
export function selectStructs(tables: LcfTables, formats: LcfFormat[]): StructDef[] {
  const requested = new Set(formats)
  const selected = tables.structs.filter(struct => requested.has(struct.format))
  for (const struct of selected) {
    for (const field of tables.fieldsByStruct.get(struct.name) ?? []) {
      for (const structName of referencedStructs(tables, field.type)) {
        const target = tables.structByName.get(structName)
        if (!target)
          throw new Error(`${struct.name}.${field.fieldName} references unknown struct ${structName}`)
        if (!requested.has(target.format))
          throw new Error(`${struct.name}.${field.fieldName} references ${structName} outside formats ${formats.join(', ')}`)
      }
    }
  }
  return selected
}

/** Structs embedded as values; `Ref<>` targets are plain IDs, not embeddings. */
function referencedStructs(tables: LcfTables, type: TypeExpression): string[] {
  switch (type.kind) {
    case 'named':
      return classifyNamedType(tables, type.name) === 'struct' ? [type.name] : []
    case 'array':
      return [type.elementStruct]
    case 'vector':
      return referencedStructs(tables, type.element)
    case 'count':
      return referencedStructs(tables, type.sized)
    case 'dbArray':
      return referencedStructs(tables, type.element)
    case 'enum':
    case 'ref':
    case 'dbBitArray':
      return []
  }
}
