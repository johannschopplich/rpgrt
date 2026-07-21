import type { Database, EngineVersion, EventPage, MapUnit, TreeMap } from '../src/index.ts'
import { describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { decodeDatabase, decodeMapTree, decodeMapUnit, encodeDatabase, encodeMapTree, encodeMapUnit } from '../src/index.ts'

const engines: EngineVersion[] = ['2k', '2k3']

describe.each(engines)('semantic round trip (%s)', (engine) => {
  it('default map unit', () => {
    const mapUnit = defaultRecord('MapUnit', engine) as unknown as MapUnit
    expect(decodeMapUnit(encodeMapUnit(mapUnit, { engine }), { engine })).toStrictEqual(mapUnit)
  })

  it('default database', () => {
    const database = defaultRecord('Database', engine) as unknown as Database
    expect(decodeDatabase(encodeDatabase(database, { engine }), { engine })).toStrictEqual(database)
  })

  it('default map tree', () => {
    const treeMap = defaultRecord('TreeMap', engine) as unknown as TreeMap
    expect(decodeMapTree(encodeMapTree(treeMap, { engine }), { engine })).toStrictEqual(treeMap)
  })

  it('map unit with an event, commands, and a move route', () => {
    const page = {
      id: 1,
      ...defaultRecord('EventPage', engine),
    } as unknown as EventPage
    page.eventCommands = [
      { code: 10110, indent: 0, string: 'Hello \\c[3]world', parameters: [0, 1, -1] },
      { code: 12330, indent: 1, string: '', parameters: [] },
    ]
    page.moveRoute = {
      ...page.moveRoute,
      moveCommands: [
        { commandId: 1, parameterString: '', parameterA: 0, parameterB: 0, parameterC: 0 },
        { commandId: 34, parameterString: 'hero', parameterA: 2, parameterB: 0, parameterC: 0 },
        { commandId: 35, parameterString: 'jingle', parameterA: 100, parameterB: 100, parameterC: 50 },
      ],
    }
    const mapUnit = defaultRecord('MapUnit', engine) as unknown as MapUnit
    mapUnit.events = [{ id: 1, name: 'guard', x: 3, y: 4, pages: [page] }]
    expect(decodeMapUnit(encodeMapUnit(mapUnit, { engine }), { engine })).toStrictEqual(mapUnit)
  })
})
