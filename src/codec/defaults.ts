import type { EngineVersion } from '../index.ts'
import type { EngineSplitDefault, FieldDescriptor } from './descriptors.ts'
import { FLAG_SETS, RECORD_DESCRIPTORS } from '../generated/descriptors.ts'

/**
 * The value a field takes when its chunk is absent – and the value the writer
 * compares against to decide whether a chunk can be omitted.
 */
export function resolveDefault(field: FieldDescriptor, engine: EngineVersion): unknown {
  const declared = field.default
  if (declared !== undefined) {
    const value = typeof declared === 'object' && !Array.isArray(declared)
      ? (declared as EngineSplitDefault)[engine]
      : declared
    return Array.isArray(value) ? [...value] : value
  }
  switch (field.codec.kind) {
    case 'scalar':
      return field.codec.scalar === 'boolean' ? false : 0
    case 'string':
      return ''
    case 'vector':
    case 'berIntList':
    case 'dbBitArray':
    case 'array':
    case 'eventCommands':
    case 'moveCommands':
      return []
    case 'flags':
      return defaultFlags(field.codec.flagSet)
    case 'record':
    case 'rawField':
      return defaultRecord(field.codec.record, engine)
    case 'databaseVersion':
      return 0
    case 'emptyBlock':
      return undefined
  }
}

export function defaultFlags(flagSetName: string): Record<string, boolean> {
  const flags: Record<string, boolean> = {}
  for (const bit of FLAG_SETS[flagSetName]!)
    flags[bit.key] = false
  return flags
}

export function defaultRecord(recordName: string, engine: EngineVersion): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const field of RECORD_DESCRIPTORS[recordName]!.fields) {
    if (field.codec.kind === 'emptyBlock')
      continue
    record[field.key] = resolveDefault(field, engine)
  }
  return record
}

export function deepEquals(left: unknown, right: unknown): boolean {
  if (left === right)
    return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((element, index) => deepEquals(element, right[index]))
  }
  if (typeof left === 'object' && typeof right === 'object' && left !== null && right !== null) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of keys) {
      if (!deepEquals((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
        return false
    }
    return true
  }
  return false
}
