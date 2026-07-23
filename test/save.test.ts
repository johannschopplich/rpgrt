import type { Chunk } from '../src/codec/reader.ts'
import type { EngineVersion, Save } from '../src/index.ts'
import { describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { ByteReader, readChunkStream } from '../src/codec/reader.ts'
import { RECORD_DESCRIPTORS } from '../src/generated/descriptors.ts'
import { decodeSave, encodeSave } from '../src/index.ts'

const engines: EngineVersion[] = ['2k', '2k3']

function makeSave(engine: EngineVersion): Save {
  return defaultRecord('Save', engine) as unknown as Save
}

function topLevelChunk(bytes: Uint8Array, id: number): Chunk {
  const reader = new ByteReader(bytes)
  reader.skip(reader.readBerUnsigned())
  const chunk = [...readChunkStream(reader, 'end-of-data')].find(chunk => chunk.id === id)
  if (chunk === undefined)
    throw new Error(`No top-level chunk ${id} in the encoded save`)
  return chunk
}

// A trailing ID-0 terminator would break RPG_RT after a top-level Save;
// readChunkStream's end-of-data mode throws on one, enforcing that invariant.
function topLevelChunkIds(bytes: Uint8Array): number[] {
  const reader = new ByteReader(bytes)
  reader.skip(reader.readBerUnsigned())
  return [...readChunkStream(reader, 'end-of-data')].map(chunk => chunk.id)
}

describe.each(engines)('save round trip (%s)', (engine) => {
  it('round trips a default save behind the LcfSaveData magic', () => {
    const save = makeSave(engine)
    const bytes = encodeSave(save, { engine })
    // Independent wire anchor: BER length 11, then the magic – not derived from
    // the codec under test.
    expect([...bytes.slice(0, 12)]).toEqual([0x0B, ...'LcfSaveData'.split('').map(character => character.charCodeAt(0))])
    expect(decodeSave(bytes, { engine })).toStrictEqual(save)
  })

  it('writes no trailing chunk terminator after the top-level Save', () => {
    const save = makeSave(engine)
    const bytes = encodeSave(save, { engine })
    expect(() => topLevelChunkIds(bytes)).not.toThrow()
    expect(topLevelChunkIds(bytes).length).toBeGreaterThan(0)
  })

  it('preserves double bit patterns: subnormal, -0.0, and a large TDateTime value', () => {
    const subnormal = 5e-324
    const large = 45000.123456789
    const save = makeSave(engine)
    save.pictures = [{
      ...defaultRecord('SavePicture', engine),
      id: 1,
      startX: subnormal,
      currentX: -0,
      currentY: large,
    }] as unknown as Save['pictures']

    const decoded = decodeSave(encodeSave(save, { engine }), { engine })
    const picture = decoded.pictures[0]!
    expect(picture.startX).toBe(subnormal)
    expect(Object.is(picture.currentX, -0)).toBe(true)
    expect(picture.currentY).toBe(large)
  })

  it('preserves a sparse id-indexed actor array', () => {
    const save = makeSave(engine)
    save.actors = [
      { ...defaultRecord('SaveActor', engine), id: 2 },
      { ...defaultRecord('SaveActor', engine), id: 7 },
    ] as unknown as Save['actors']

    const decoded = decodeSave(encodeSave(save, { engine }), { engine })
    expect(decoded.actors.map(actor => actor.id)).toStrictEqual([2, 7])
    expect(decoded).toStrictEqual(save)
  })

  it('preserves inherited SaveMapEventBase fields on the party location', () => {
    const save = makeSave(engine)
    save.partyLocation = {
      ...defaultRecord('SavePartyLocation', engine),
      active: false,
      mapId: 3,
      positionX: 10,
      panCurrentX: 999,
    } as unknown as Save['partyLocation']

    const decoded = decodeSave(encodeSave(save, { engine }), { engine })
    expect(decoded.partyLocation.mapId).toBe(3)
    expect(decoded.partyLocation.positionX).toBe(10)
    expect(decoded.partyLocation.panCurrentX).toBe(999)
    expect(decoded).toStrictEqual(save)
  })

  it('round-trips signed int32 and boolean vectors and pins their wire bytes', () => {
    const save = makeSave(engine)
    save.system = {
      ...defaultRecord('SaveSystem', engine),
      switches: [true, false, true],
      variables: [-2, 100000],
    } as unknown as Save['system']

    const bytes = encodeSave(save, { engine })
    const decoded = decodeSave(bytes, { engine })
    expect(decoded.system.switches).toStrictEqual([true, false, true])
    expect(decoded.system.variables).toStrictEqual([-2, 100000])

    const reader = new ByteReader(bytes)
    reader.skip(reader.readBerUnsigned())
    const systemChunk = [...readChunkStream(reader, 'end-of-data')].find(chunk => chunk.id === 0x65)!
    const systemChunks = [...readChunkStream(new ByteReader(systemChunk.bytes), 'id-zero')]
    const switchesChunk = systemChunks.find(chunk => chunk.id === 0x20)!
    const variablesChunk = systemChunks.find(chunk => chunk.id === 0x22)!
    expect([...switchesChunk.bytes]).toEqual([0x01, 0x00, 0x01])
    // int32 -2 and 100000, little-endian – signed in, unsigned out.
    expect([...variablesChunk.bytes]).toEqual([0xFE, 0xFF, 0xFF, 0xFF, 0xA0, 0x86, 0x01, 0x00])
  })

  it('preserves an unknown top-level chunk through re-encode', () => {
    const save = makeSave(engine)
    ;(save as unknown as { _unknown: { id: number, bytes: Uint8Array }[] })._unknown = [
      { id: 0xF0, bytes: new Uint8Array([1, 2, 3, 4]) },
    ]

    const bytes = encodeSave(save, { engine })
    const decoded = decodeSave(bytes, { engine })
    expect(bytesEqual(encodeSave(decoded, { engine }), bytes)).toBe(true)
    expect(decoded).toStrictEqual(save)
  })
})

describe('save wire bytes (docs/serialization.md)', () => {
  it('frames a sparse id-indexed actor array as a count then per-entry id and chunk stream', () => {
    // Array framing (§2): [BER element count] then, per element, [BER id] and the
    // element's chunk stream ending in 0x00. A default 2k SaveActor persists only
    // its persist-if-default chunks (§8), each [id][BER length][payload]:
    //   name 0x01 = "", title 0x02 = "",
    //   skills element-count size 0x33 = 0 and empty data 0x34,
    //   equipped 0x3D = five int16 zeros (10 bytes),
    //   status data 0x52 empty (its count size 0x51 is omitted when default),
    //   then the terminating 0x00. 2k3-only chunks are absent in a 2k save (§8).
    const name = [0x01, 0x01, 0x01]
    const title = [0x02, 0x01, 0x01]
    const skillsSize = [0x33, 0x01, 0x00]
    const skillsData = [0x34, 0x00]
    const equipped = [0x3D, 0x0A, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const statusData = [0x52, 0x00]
    const terminator = [0x00]
    const actorChunkStream = [...name, ...title, ...skillsSize, ...skillsData, ...equipped, ...statusData, ...terminator]
    const count = [0x02]
    const expected = [...count, 0x02, ...actorChunkStream, 0x07, ...actorChunkStream]

    const save = makeSave('2k')
    save.actors = [
      { ...defaultRecord('SaveActor', '2k'), id: 2 },
      { ...defaultRecord('SaveActor', '2k'), id: 7 },
    ] as unknown as Save['actors']
    // actors is top-level chunk id 0x6C (src/generated/descriptors.ts).
    expect([...topLevelChunk(encodeSave(save, { engine: '2k' }), 0x6C).bytes]).toEqual(expected)
  })

  it('merges the SaveMapEventBase chunk ids into the party location, sorted', () => {
    // SaveMapEventBase is flattened into SavePartyLocation, its chunks merged
    // ahead of the derived struct's own and sorted by id (CONTEXT.md base struct).
    // A default party location writes exactly the base struct's persist-if-default
    // chunks, in ascending id order.
    const expectedBaseIds = [0x0B, 0x0C, 0x0D, 0x15, 0x16, 0x21, 0x23, 0x25, 0x29]
    const descriptorBaseIds = RECORD_DESCRIPTORS.SaveMapEventBase!.fields
      .filter(field => field.isPersistedIfDefault === true)
      .map(field => field.id!)
      .sort((left, right) => left - right)
    expect(descriptorBaseIds).toEqual(expectedBaseIds)

    for (const engine of engines) {
      const save = makeSave(engine)
      // partyLocation is top-level chunk id 0x68 (src/generated/descriptors.ts).
      const partyChunk = topLevelChunk(encodeSave(save, { engine }), 0x68)
      const ids = [...readChunkStream(new ByteReader(partyChunk.bytes), 'id-zero')].map(chunk => chunk.id)
      expect(ids).toEqual(expectedBaseIds)
    }
  })

  it('writes a double field as eight little-endian IEEE-754 bytes', () => {
    // flashCurrentLevel is chunk id 0x54, a Double (§0). -2.5 = -(1.25 * 2^1):
    // sign 1, exponent 0x400, mantissa 0x4000000000000 → 0xC004000000000000,
    // little-endian on the wire.
    for (const engine of engines) {
      const save = makeSave(engine)
      save.partyLocation = {
        ...defaultRecord('SavePartyLocation', engine),
        flashCurrentLevel: -2.5,
      } as unknown as Save['partyLocation']

      const partyChunk = topLevelChunk(encodeSave(save, { engine }), 0x68)
      const doubleChunk = [...readChunkStream(new ByteReader(partyChunk.bytes), 'id-zero')].find(chunk => chunk.id === 0x54)!
      expect([...doubleChunk.bytes]).toEqual([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0xC0])
    }
  })
})

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}
