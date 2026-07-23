import type { GeneratedModel } from '../scripts/lib/emit.ts'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildModel } from '../scripts/lib/emit.ts'
import { toCamelCase } from '../scripts/lib/names.ts'
import { loadTables, resolveEnum, selectStructs } from '../scripts/lib/tables.ts'
import { approximateLiblcfName } from '../src/translation/units.ts'

const csvDirectory = fileURLToPath(new URL('../vendor/liblcf-csv', import.meta.url))

function fieldOf(model: GeneratedModel, structName: string, key: string) {
  const struct = model.structs.find(candidate => candidate.name === structName)
  if (struct === undefined)
    throw new Error(`No generated struct ${structName}`)
  const field = struct.fields.find(candidate => candidate.key === key)
  if (field === undefined)
    throw new Error(`No field ${structName}.${key}`)
  return field
}

describe('lsd generator seams', () => {
  const tables = loadTables(csvDirectory)
  let model: GeneratedModel

  beforeAll(() => {
    model = buildModel(tables, selectStructs(tables, ['ldb', 'lmt', 'lmu', 'lsd']))
  })

  it('recovers every liblcf field name from the key and its override', () => {
    for (const struct of model.structs) {
      for (const field of struct.fields) {
        const liblcfName = field.liblcfName ?? approximateLiblcfName(field.key)
        expect(toCamelCase(liblcfName), `${struct.name}.${field.key}`).toBe(field.key)
      }
    }
    expect(fieldOf(model, 'Terms', 'innAGreeting1').liblcfName).toBe('inn_a_greeting_1')
    expect(fieldOf(model, 'Terms', 'shopGreeting1').liblcfName).toBeUndefined()
  })

  it('gap A flattens SaveMapEventBase fields into inheritors, sorted by ascending chunk ID', () => {
    const struct = model.structs.find(candidate => candidate.name === 'SavePartyLocation')!
    const ids = struct.fields.map(field => field.id!)
    // Base chunk IDs 0x01–0x55 and the derived struct's own 0x65+ both present.
    expect(ids).toContain(0x01)
    expect(ids).toContain(0x54)
    expect(ids).toContain(0x70)
    expect(ids).toStrictEqual([...ids].sort((left, right) => left - right))
  })

  it('gap A applies to SaveVehicleLocation and SaveMapEvent too', () => {
    for (const structName of ['SaveVehicleLocation', 'SaveMapEvent']) {
      const struct = model.structs.find(candidate => candidate.name === structName)!
      const ids = struct.fields.map(field => field.id!)
      expect(ids).toContain(0x01)
      expect(ids).toContain(0x55)
    }
  })

  it('gap B resolves symbolic constant and C-expression int defaults', () => {
    expect(fieldOf(model, 'SavePartyLocation', 'panCurrentX').default).toBe(2304)
    expect(fieldOf(model, 'SavePartyLocation', 'panCurrentY').default).toBe(1792)
    expect(fieldOf(model, 'SavePartyLocation', 'panSpeed').default).toBe(16)
  })

  it('gap B unescapes the kEmptyName C string sentinel to U+0001', () => {
    expect(fieldOf(model, 'SaveActor', 'name').default).toBe('\u0001')
    expect(fieldOf(model, 'SaveActor', 'title').default).toBe('\u0001')
  })

  it('gaps D/E leave record-literal and comprehension defaults unset', () => {
    expect(fieldOf(model, 'SaveSystem', 'titleMusic').default).toBeUndefined()
    expect(fieldOf(model, 'SaveSystem', 'cursorSe').default).toBeUndefined()
    expect(fieldOf(model, 'SaveMapInfo', 'lowerTiles').default).toBeUndefined()
    expect(fieldOf(model, 'SaveMapInfo', 'upperTiles').default).toBeUndefined()
  })

  it('gap C aliases the SavePartyLoction_PanState CSV typo to the real enum', () => {
    expect(resolveEnum(tables, 'SavePartyLoction_PanState').enumName).toBe('PanState')
    expect(fieldOf(model, 'SavePartyLocation', 'panState').enumRef).toBe('SavePartyLocationPanState')
  })
})
