import type { Database, MapUnit } from '../src/index.ts'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { convertFile } from '../src/commands/convert.ts'
import { scanDatabaseEngine } from '../src/commands/resolve.ts'
import { createTranscoder } from '../src/encoding.ts'
import { encodeDatabase, encodeMapUnit } from '../src/index.ts'

const temporaryDirectories: string[] = []

function createGameDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lcfkit-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  while (temporaryDirectories.length > 0)
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

function mapUnitWithEventName(name: string): MapUnit {
  const mapUnit = defaultRecord('MapUnit', '2k3') as unknown as MapUnit
  mapUnit.events = [{ id: 1, name, x: 0, y: 0, pages: [] }]
  return mapUnit
}

describe('convert lcf → json → lcf', () => {
  it('round-trips a map byte-exactly using the ini encoding hint and the database engine', () => {
    const directory = createGameDirectory()
    const transcoder = createTranscoder('cp1252')
    const options = { engine: '2k3', transcoder } as const
    const mapPath = join(directory, 'Map0001.lmu')
    const sourceBytes = encodeMapUnit(mapUnitWithEventName('Käse'), options)
    writeFileSync(mapPath, sourceBytes)
    writeFileSync(join(directory, 'RPG_RT.ldb'), encodeDatabase(defaultRecord('Database', '2k3') as unknown as Database, options))
    writeFileSync(join(directory, 'RPG_RT.ini'), '[EasyRPG]\nEncoding=1252\n')

    const toJson = convertFile(mapPath)
    expect(toJson).toMatchObject({ format: 'lmu', engine: '2k3', engineSource: 'database', encoding: 'cp1252', encodingSource: 'ini', isByteIdentical: true })
    expect(toJson.outputPath).toBe(`${mapPath}.json`)
    const envelope = JSON.parse(readFileSync(toJson.outputPath, 'utf8'))
    expect(envelope.data.events[0].name).toBe('Käse')

    rmSync(mapPath)
    const toLcf = convertFile(toJson.outputPath)
    expect(toLcf).toMatchObject({ outputPath: mapPath, engineSource: 'envelope', encodingSource: 'envelope' })
    expect(new Uint8Array(readFileSync(mapPath))).toEqual(sourceBytes)
  })

  it('identifies a lone 2k map by re-encoding', () => {
    const directory = createGameDirectory()
    const mapPath = join(directory, 'Map0001.lmu')
    const sourceBytes = encodeMapUnit(defaultRecord('MapUnit', '2k') as unknown as MapUnit, { engine: '2k' })
    writeFileSync(mapPath, sourceBytes)

    const toJson = convertFile(mapPath)
    expect(toJson).toMatchObject({ engine: '2k', engineSource: 'roundTrip' })
    const toLcf = convertFile(toJson.outputPath, { output: join(directory, 'rebuilt.lmu') })
    expect(new Uint8Array(readFileSync(toLcf.outputPath))).toEqual(sourceBytes)
  })

  it('carries unknown chunks through json as base64', () => {
    const directory = createGameDirectory()
    const mapPath = join(directory, 'Map0001.lmu')
    const mapUnit = defaultRecord('MapUnit', '2k') as unknown as MapUnit
    mapUnit._unknown = [{ id: 0x63, bytes: new Uint8Array([1, 2, 3]) }]
    const sourceBytes = encodeMapUnit(mapUnit, { engine: '2k' })
    writeFileSync(mapPath, sourceBytes)

    const toJson = convertFile(mapPath, { engine: '2k' })
    expect(readFileSync(toJson.outputPath, 'utf8')).toContain('"AQID"')
    const toLcf = convertFile(toJson.outputPath, { output: join(directory, 'rebuilt.lmu') })
    expect(new Uint8Array(readFileSync(toLcf.outputPath))).toEqual(sourceBytes)
  })

  it('honors --engine and --encoding overrides over the envelope', () => {
    const directory = createGameDirectory()
    const mapPath = join(directory, 'Map0001.lmu')
    writeFileSync(mapPath, encodeMapUnit(defaultRecord('MapUnit', '2k') as unknown as MapUnit, { engine: '2k' }))
    const toJson = convertFile(mapPath, { engine: '2k', encoding: 'cp932' })
    expect(toJson).toMatchObject({ engineSource: 'flag', encoding: 'cp932', encodingSource: 'flag' })
    const toLcf = convertFile(toJson.outputPath, { engine: '2k', encoding: 'cp1252', output: join(directory, 'rebuilt.lmu') })
    expect(toLcf).toMatchObject({ engineSource: 'flag', encoding: 'cp1252', encodingSource: 'flag' })
  })
})

describe('engine detection from the database', () => {
  it.each(['2k', '2k3'] as const)('scans a %s database', (engine) => {
    const bytes = encodeDatabase(defaultRecord('Database', engine) as unknown as Database, { engine })
    expect(scanDatabaseEngine(bytes)).toBe(engine)
  })
})

describe('convert errors', () => {
  it('rejects unsupported extensions', () => {
    const directory = createGameDirectory()
    const filePath = join(directory, 'notes.txt')
    writeFileSync(filePath, 'hello')
    expect(() => convertFile(filePath)).toThrow('Unsupported file extension')
  })

  it('rejects json without an envelope', () => {
    const directory = createGameDirectory()
    const filePath = join(directory, 'plain.json')
    writeFileSync(filePath, '{"events": []}')
    expect(() => convertFile(filePath)).toThrow('not an lcfkit JSON document')
  })
})
