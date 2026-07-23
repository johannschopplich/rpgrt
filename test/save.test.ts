import type { EngineVersion, Save } from '../src/index.ts'
import { describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { ByteReader, readChunkStream } from '../src/codec/reader.ts'
import { decodeSave, encodeSave } from '../src/index.ts'

const engines: EngineVersion[] = ['2k', '2k3']

function makeSave(engine: EngineVersion): Save {
  return defaultRecord('Save', engine) as unknown as Save
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

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}
