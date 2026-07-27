import type { Database, MapUnit, Save, TreeMap } from '../../src/index.ts'
import { defaultRecord, encodeDatabase, encodeMapUnit, encodeSave, encodeTreeMap } from '../../src/index.ts'

// Self-authored fixture builders – the committed binaries in this directory
// are their output. Regenerate with `pnpm run make-fixtures` after a change.

export interface Fixture {
  fileName: string
  engine: '2k' | '2k3'
  bytes: Uint8Array
}

function minimalDatabase2k(): Uint8Array {
  const database = defaultRecord('Database', '2k') as unknown as Database
  database.actors = [{ ...defaultRecord('Actor', '2k'), id: 1, name: 'Alex', title: 'Held' } as never]
  // The `party` value `[1]` is the field default: the data chunk persists, the 0x15
  // size chunk is omitted – as liblcf writes it and TestGame-2000 pins it.
  database.system = { ...database.system, party: [1], titleName: 'Titel' }
  database.terms = { ...database.terms, victory: 'Sieg!', yes: 'Ja', no: 'Nein' }
  return encodeDatabase(database, { engine: '2k' })
}

function minimalDatabase2k3(): Uint8Array {
  const database = defaultRecord('Database', '2k3') as unknown as Database
  database.actors = [{ ...defaultRecord('Actor', '2k3'), id: 2, name: 'Zack', class: 1 } as never]
  database.system = { ...database.system, party: [2], menuCommands: [1, 2] }
  database.version = 1
  return encodeDatabase(database, { engine: '2k3' })
}

function villageMap(): Uint8Array {
  const mapUnit = defaultRecord('MapUnit', '2k') as unknown as MapUnit
  const command = (code: number, indent: number, string: string, parameters: number[] = []): MapUnit['events'][0]['pages'][0]['eventCommands'][0] =>
    ({ code, indent, string, parameters })
  const page = {
    ...defaultRecord('EventPage', '2k'),
    id: 1,
    eventCommands: [
      command(10110, 0, String.raw`Willkommen, \c[3]Alex\c[0]!`),
      command(20110, 0, String.raw`Der \n[1] kehrt zurück.`),
      command(10140, 0, 'Ja/Nein', [0]),
      command(20140, 0, 'Ja', [0]),
      command(20140, 0, 'Nein', [1]),
      command(20141, 0, '', [4]),
    ],
  }
  mapUnit.events = [{ ...defaultRecord('Event', '2k'), id: 1, name: 'EV0001', x: 3, y: 4, pages: [page] } as never]
  return encodeMapUnit(mapUnit, { engine: '2k' })
}

function worldTreeMap(): Uint8Array {
  const treeMap = defaultRecord('TreeMap', '2k') as unknown as TreeMap
  const mapInfo = (id: number, name: string, type: number, parent: number): TreeMap['maps'][0] =>
    ({ ...defaultRecord('MapInfo', '2k'), id, name, type, parentMap: parent } as never)
  treeMap.maps = [mapInfo(0, 'Fixture', 0, 0), mapInfo(1, 'Dorf', 1, 0), mapInfo(2, 'Höhle', 1, 1)]
  treeMap.treeOrder = [0, 1, 2]
  treeMap.start = { ...treeMap.start, partyMapId: 1, partyX: 5, partyY: 6 }
  return encodeTreeMap(treeMap, { engine: '2k' })
}

function pictureSave(currentX: number): Uint8Array {
  const save = defaultRecord('Save', '2k3') as unknown as Save
  save.title = { ...save.title, heroName: 'Zack', heroLevel: 7 }
  save.pictures = [{ ...defaultRecord('SavePicture', '2k3'), id: 1, name: 'Fog', currentX } as never]
  return encodeSave(save, { engine: '2k3' })
}

/** JS canonicalizes every NaN on write; LE bytes of the canonical quiet NaN. */
const CANONICAL_NAN_BYTES = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF8, 0x7F]

function findNanOffset(bytes: Uint8Array): number {
  let foundOffset = -1
  for (let offset = 0; offset + CANONICAL_NAN_BYTES.length <= bytes.length; offset++) {
    if (CANONICAL_NAN_BYTES.every((byte, index) => bytes[offset + index] === byte)) {
      if (foundOffset !== -1)
        throw new Error('NaN fixture surgery needs exactly one canonical NaN in the save')
      foundOffset = offset
    }
  }
  if (foundOffset === -1)
    throw new Error('NaN fixture surgery found no canonical NaN in the save')
  return foundOffset
}

/** The same save with a non-canonical NaN bit pattern, as another engine might write it. */
function nonCanonicalNanSave(): Uint8Array {
  const bytes = pictureSave(Number.NaN)
  bytes[findNanOffset(bytes)] = 0x01
  return bytes
}

function editedHeaderDatabase(): Uint8Array {
  const bytes = minimalDatabase2k()
  // "LcfDataBase" → "LcfDataBasE": same length, different content.
  bytes[11] = 'E'.charCodeAt(0)
  return bytes
}

export function buildFixtures(): Fixture[] {
  return [
    { fileName: 'minimal-2k.ldb', engine: '2k', bytes: minimalDatabase2k() },
    { fileName: 'minimal-2k3.ldb', engine: '2k3', bytes: minimalDatabase2k3() },
    { fileName: 'village.lmu', engine: '2k', bytes: villageMap() },
    { fileName: 'world.lmt', engine: '2k', bytes: worldTreeMap() },
    { fileName: 'slot1.lsd', engine: '2k3', bytes: pictureSave(160) },
    { fileName: 'nan.lsd', engine: '2k3', bytes: nonCanonicalNanSave() },
    { fileName: 'edited-header.ldb', engine: '2k', bytes: editedHeaderDatabase() },
  ]
}
