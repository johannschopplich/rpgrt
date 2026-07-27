import type { Database } from '../src/index.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { uint8ArrayToHex } from 'uint8array-extras'
import { describe, expect, it } from 'vitest'
import { convertFile } from '../src/commands/convert.ts'
import { decodeDatabase, decodeMapUnit, decodeSave, decodeTreeMap, encodeDatabase } from '../src/index.ts'
import { buildFixtures } from './fixtures/build.ts'
import { reencode, useTemporaryDirectories } from './helpers.ts'

const createDirectory = useTemporaryDirectories()

const fixturesDirectory = join(import.meta.dirname, 'fixtures')

function committedBytes(fileName: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDirectory, fileName)))
}

describe('fixture integrity', () => {
  it.each(buildFixtures())('$fileName matches its builder', (fixture) => {
    expect(committedBytes(fixture.fileName)).toEqual(fixture.bytes)
  })

  it.each(buildFixtures())('$fileName round-trips byte-identically', (fixture) => {
    expect(reencode(committedBytes(fixture.fileName), fixture.fileName, fixture.engine)).toEqual(fixture.bytes)
  })
})

describe('fixture behavior', () => {
  it('omits the party size chunk for a default-count party but keeps the data chunk', () => {
    const bytes = committedBytes('minimal-2k.ldb')
    const database = decodeDatabase(bytes, { engine: '2k' })
    expect(database.system.party).toEqual([1])
    const hex = uint8ArrayToHex(bytes)
    expect(hex).not.toContain('150101')
    expect(hex).toContain('16020100')
  })

  it('preserves a NaN bit pattern in the binary round trip', () => {
    const save = decodeSave(committedBytes('nan.lsd'), { engine: '2k3' })
    expect(save.pictures[0]!.currentX).toBeNaN()
  })

  it('reports the JSON conversion of a NaN save as not byte-identical', () => {
    const inputPath = join(createDirectory(), 'nan.lsd')
    writeFileSync(inputPath, committedBytes('nan.lsd'))
    const result = convertFile(inputPath, { output: `${inputPath}.json`, engine: '2k3', isForce: true })
    expect(result.isByteIdentical).toBe(false)
  })

  it('preserves a non-canonical header through decode, warning, and re-encode', () => {
    const bytes = committedBytes('edited-header.ldb')
    const warnings: string[] = []
    const database = decodeDatabase(bytes, { engine: '2k', onWarning: message => warnings.push(message) }) as Database
    expect(database._header).toBe('LcfDataBasE')
    expect(warnings).toEqual([expect.stringContaining('LcfDataBasE')])
    expect(encodeDatabase(database, { engine: '2k' })).toEqual(bytes)
  })

  it('decodes the village map events with control codes verbatim', () => {
    const mapUnit = decodeMapUnit(committedBytes('village.lmu'), { engine: '2k' })
    const commands = mapUnit.events[0]!.pages[0]!.eventCommands
    expect(commands[0]!.string).toBe(String.raw`Willkommen, \c[3]Alex\c[0]!`)
    expect(commands[1]!.string).toBe(String.raw`Der \n[1] kehrt zurück.`)
  })

  it('decodes the tree map hierarchy', () => {
    const treeMap = decodeTreeMap(committedBytes('world.lmt'), { engine: '2k' })
    expect(treeMap.maps.map(mapInfo => mapInfo.name)).toEqual(['Fixture', 'Dorf', 'Höhle'])
    expect(treeMap.start.partyMapId).toBe(1)
  })
})
