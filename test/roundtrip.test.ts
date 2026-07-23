import type { Actor, Database, EngineVersion, EventPage, MapInfo, MapUnit, TreeMap } from '../src/index.ts'
import { describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { ByteReader, readChunkStream } from '../src/codec/reader.ts'
import { decodeDatabase, decodeMapUnit, decodeTreeMap, encodeDatabase, encodeMapUnit, encodeTreeMap } from '../src/index.ts'

const engines: EngineVersion[] = ['2k', '2k3']

function chunkIds(payload: Uint8Array): number[] {
  return [...readChunkStream(new ByteReader(payload), 'id-zero')].map(chunk => chunk.id)
}

function topLevelChunkLength(databaseBytes: Uint8Array, chunkId: number): number | undefined {
  const reader = new ByteReader(databaseBytes)
  reader.skip(reader.readBerUnsigned())
  for (const chunk of readChunkStream(reader, 'end-of-data')) {
    if (chunk.id === chunkId)
      return chunk.bytes.length
  }
  return undefined
}

function termsChunkIds(databaseBytes: Uint8Array): number[] {
  const reader = new ByteReader(databaseBytes)
  reader.skip(reader.readBerUnsigned())
  for (const chunk of readChunkStream(reader, 'end-of-data')) {
    if (chunk.id === 0x15)
      return chunkIds(chunk.bytes)
  }
  throw new Error('No Terms chunk in the encoded database')
}

describe('terms omission quirk', () => {
  it('omits default encounter and escape_success chunks in 2k3 only', () => {
    const database = defaultRecord('Database', '2k3') as unknown as Database
    const ids = termsChunkIds(encodeDatabase(database, { engine: '2k3' }))
    expect(ids).not.toContain(0x01)
    expect(ids).not.toContain(0x03)
    expect(ids).toContain(0x04)
  })

  it('persists all default terms chunks in 2k', () => {
    const database = defaultRecord('Database', '2k') as unknown as Database
    const ids = termsChunkIds(encodeDatabase(database, { engine: '2k' }))
    expect(ids).toEqual(expect.arrayContaining([0x01, 0x03, 0x04]))
  })

  it('keeps non-default 2k3 terms values through a round trip', () => {
    const database = defaultRecord('Database', '2k3') as unknown as Database
    database.terms = { ...database.terms, encounter: 'Kampf!', escapeSuccess: 'Entkommen!' }
    const decoded = decodeDatabase(encodeDatabase(database, { engine: '2k3' }), { engine: '2k3' })
    expect(decoded.terms.encounter).toBe('Kampf!')
    expect(decoded.terms.escapeSuccess).toBe('Entkommen!')
  })
})

describe('database version framing', () => {
  const DATABASE_VERSION_CHUNK_ID = 0x1A

  it('writes version 0 as an empty chunk in a 2k3 database', () => {
    const database = defaultRecord('Database', '2k3') as unknown as Database
    const bytes = encodeDatabase(database, { engine: '2k3' })
    expect(topLevelChunkLength(bytes, DATABASE_VERSION_CHUNK_ID)).toBe(0)
  })

  it('omits the version chunk entirely in a 2k database', () => {
    const database = defaultRecord('Database', '2k') as unknown as Database
    const bytes = encodeDatabase(database, { engine: '2k' })
    expect(topLevelChunkLength(bytes, DATABASE_VERSION_CHUNK_ID)).toBeUndefined()
  })

  it('writes and round-trips a non-zero version in a 2k database', () => {
    const database = defaultRecord('Database', '2k') as unknown as Database
    database.version = 0x1234
    const bytes = encodeDatabase(database, { engine: '2k' })
    expect(topLevelChunkLength(bytes, DATABASE_VERSION_CHUNK_ID)).toBeGreaterThan(0)
    expect(decodeDatabase(bytes, { engine: '2k' }).version).toBe(0x1234)
  })

  it('round-trips a non-zero version in a 2k3 database', () => {
    const database = defaultRecord('Database', '2k3') as unknown as Database
    database.version = 0x1234
    const bytes = encodeDatabase(database, { engine: '2k3' })
    expect(topLevelChunkLength(bytes, DATABASE_VERSION_CHUNK_ID)).toBeGreaterThan(0)
    expect(decodeDatabase(bytes, { engine: '2k3' }).version).toBe(0x1234)
  })
})

const MAP_UNIT_HEADER_LENGTH = 'LcfMapUnit'.length + 1

describe('map unit wire bytes', () => {
  it('encodes a default map unit as the header magic and its persist-if-default chunks', () => {
    // A default record persists only its persist-if-default chunks, ascending by
    // id, each framed as [BER id][BER length][payload], then the stream's 0x00
    // terminator.
    const header = [0x0A, 0x4C, 0x63, 0x66, 0x4D, 0x61, 0x70, 0x55, 0x6E, 0x69, 0x74]
    const scrollType = [0x0B, 0x01, 0x00]
    const lowerLayer = [0x47, 0x00]
    const upperLayer = [0x48, 0x00]
    const events = [0x51, 0x01, 0x00]
    const terminator = [0x00]
    const expected = [...header, ...scrollType, ...lowerLayer, ...upperLayer, ...events, ...terminator]
    for (const engine of engines) {
      const mapUnit = defaultRecord('MapUnit', engine) as unknown as MapUnit
      expect([...encodeMapUnit(mapUnit, { engine })]).toEqual(expected)
    }
  })

  it('frames a non-default scalar chunk as id, BER length, then payload', () => {
    // chipsetId is chunk id 0x01 (src/generated/descriptors.ts); 7 fits one BER
    // byte. Being the lowest id, its chunk leads the body.
    const mapUnit = defaultRecord('MapUnit', '2k') as unknown as MapUnit
    mapUnit.chipsetId = 7
    const bytes = encodeMapUnit(mapUnit, { engine: '2k' })
    expect([...bytes.slice(MAP_UNIT_HEADER_LENGTH, MAP_UNIT_HEADER_LENGTH + 3)]).toEqual([0x01, 0x01, 0x07])
  })

  it('encodes a BER integer of 300 with a continuation byte', () => {
    // height is chunk id 0x03 (src/generated/descriptors.ts). 300 = 2 * 128 + 44,
    // so the BER int is two bytes: 0x82 (high group 2, continuation bit set)
    // then 0x2C (low group 44).
    const mapUnit = defaultRecord('MapUnit', '2k') as unknown as MapUnit
    mapUnit.height = 300
    const bytes = encodeMapUnit(mapUnit, { engine: '2k' })
    expect([...bytes.slice(MAP_UNIT_HEADER_LENGTH, MAP_UNIT_HEADER_LENGTH + 4)]).toEqual([0x03, 0x02, 0x82, 0x2C])
  })
})

describe.each(engines)('semantic round trip (%s)', (engine) => {
  it('default map unit', () => {
    const mapUnit = defaultRecord('MapUnit', engine) as unknown as MapUnit
    expect(decodeMapUnit(encodeMapUnit(mapUnit, { engine }), { engine })).toStrictEqual(mapUnit)
  })

  it('default database', () => {
    const database = defaultRecord('Database', engine) as unknown as Database
    expect(decodeDatabase(encodeDatabase(database, { engine }), { engine })).toStrictEqual(database)
  })

  it('default tree map', () => {
    const treeMap = defaultRecord('TreeMap', engine) as unknown as TreeMap
    expect(decodeTreeMap(encodeTreeMap(treeMap, { engine }), { engine })).toStrictEqual(treeMap)
  })

  it('keeps non-default raw records through a round trip: parameters, equipment, area rect', () => {
    const actor = { ...defaultRecord('Actor', engine), id: 1 } as unknown as Actor
    actor.parameters = {
      maxhp: [10, 20, 30],
      maxsp: [5, 6, 7],
      attack: [1, 2, 3],
      defense: [4, 5, 6],
      spirit: [7, 8, 9],
      agility: [2, 4, 6],
    }
    actor.initialEquipment = { weaponId: 1, shieldId: 2, armorId: 3, helmetId: 4, accessoryId: 5 }
    const database = defaultRecord('Database', engine) as unknown as Database
    database.actors = [actor]
    expect(decodeDatabase(encodeDatabase(database, { engine }), { engine })).toStrictEqual(database)

    const mapInfo = { ...defaultRecord('MapInfo', engine), id: 1 } as unknown as MapInfo
    mapInfo.areaRect = { l: 16, t: 32, r: 48, b: 64 }
    const treeMap = defaultRecord('TreeMap', engine) as unknown as TreeMap
    treeMap.maps = [mapInfo]
    treeMap.treeOrder = [1]
    expect(decodeTreeMap(encodeTreeMap(treeMap, { engine }), { engine })).toStrictEqual(treeMap)
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
