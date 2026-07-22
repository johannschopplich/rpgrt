import type { Dump } from '../src/commands/extract.ts'
import type { Database, EventCommand, MapUnit, TreeMap } from '../src/index.ts'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { extractGame } from '../src/commands/extract.ts'
import { injectDump } from '../src/commands/inject.ts'
import { createTranscoder } from '../src/encoding.ts'
import { decodeMapUnit, encodeDatabase, encodeMapTree, encodeMapUnit } from '../src/index.ts'

const temporaryDirectories: string[] = []

function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lcfkit-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  while (temporaryDirectories.length > 0)
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

function command(code: number, string = '', indent = 0, parameters: number[] = []): EventCommand {
  return { code, indent, string, parameters }
}

function createGameDirectory(): string {
  const directory = createDirectory()
  const transcoder = createTranscoder('cp1252')
  const options = { engine: '2k', transcoder } as const

  const database = defaultRecord('Database', '2k') as unknown as Database
  database.actors = [{ ...defaultRecord('Actor', '2k'), id: 1, name: 'Käthe', title: 'Heldin' } as never]
  database.terms = { ...database.terms, victory: 'Sieg!' }
  writeFileSync(join(directory, 'RPG_RT.ldb'), encodeDatabase(database, options))

  const treeMap = defaultRecord('TreeMap', '2k') as unknown as TreeMap
  treeMap.maps = [
    { ...defaultRecord('MapInfo', '2k'), id: 0, name: 'Spiel', type: 0 } as never,
    { ...defaultRecord('MapInfo', '2k'), id: 1, name: 'Dorf', type: 1 } as never,
  ]
  treeMap.treeOrder = [0, 1]
  writeFileSync(join(directory, 'RPG_RT.lmt'), encodeMapTree(treeMap, options))

  const page = { id: 1, ...defaultRecord('EventPage', '2k') } as never as { eventCommands: EventCommand[] }
  page.eventCommands = [
    command(10110, 'Willkommen'),
    command(20110, 'im Dorf'),
    command(10140, 'Ja/Nein'),
    command(20140, 'Ja', 0, [0]),
    command(10110, 'Gut!', 1),
    command(20140, 'Nein', 0, [1]),
    command(20141, '', 0, [4]),
    command(10610, 'Käthe', 0, [1]),
  ]
  const mapUnit = defaultRecord('MapUnit', '2k') as unknown as MapUnit
  mapUnit.events = [{ id: 1, name: 'npc', x: 2, y: 3, pages: [page as never] }]
  writeFileSync(join(directory, 'Map0001.lmu'), encodeMapUnit(mapUnit, options))

  writeFileSync(join(directory, 'RPG_RT.ini'), '[EasyRPG]\nEncoding=1252\n')
  return directory
}

function readDump(filePath: string): Dump {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Dump
}

function setTranslation(dump: Dump, address: string, translation: string): void {
  const unit = dump.units.find(entry => entry.address === address)
  expect(unit, address).toBeDefined()
  unit!.translation = translation
}

describe('extract', () => {
  it('dumps every unit with metadata and empty translations', () => {
    const gameDirectory = createGameDirectory()
    const outputPath = join(createDirectory(), 'strings.json')
    const result = extractGame(gameDirectory, { output: outputPath })

    expect(result).toMatchObject({ engine: '2k', encoding: 'cp1252', outputPaths: [outputPath] })
    const dump = readDump(outputPath)
    expect(dump.engine).toBe('2k')
    expect(dump.units.every(unit => unit.translation === '')).toBe(true)
    const sources = new Map(dump.units.map(unit => [unit.address, unit.source]))
    expect(sources.get('ldb/actors/1/name')).toBe('Käthe')
    expect(sources.get('ldb/terms/victory')).toBe('Sieg!')
    expect(sources.get('lmt/maps/1/name')).toBe('Dorf')
    expect(sources.get('lmu/1/events/1/pages/1/commands/0')).toBe('Willkommen\nim Dorf')
    expect(sources.get('lmu/1/events/1/pages/1/commands/2')).toBe('Ja\nNein')
    expect(sources.get('lmu/1/events/1/pages/1/commands/7')).toBe('Käthe')
  })

  it('writes split dumps and po catalogs', () => {
    const gameDirectory = createGameDirectory()
    const splitDirectory = join(createDirectory(), 'strings')
    const splitResult = extractGame(gameDirectory, { output: splitDirectory, isSplit: true })
    expect(splitResult.outputPaths.map(path => path.split('/').pop()).sort()).toEqual(
      ['Map0001.lmu.json', 'RPG_RT.ldb.json', 'RPG_RT.lmt.json'],
    )

    const poDirectory = join(createDirectory(), 'po')
    const poResult = extractGame(gameDirectory, { output: poDirectory, isPo: true })
    expect(poResult.outputPaths.map(path => path.split('/').pop()).sort()).toEqual(
      ['Map0001.po', 'RPG_RT.ldb.battle.po', 'RPG_RT.ldb.common.po', 'RPG_RT.ldb.po', 'RPG_RT.lmt.po'],
    )
    const termsCatalog = readFileSync(join(poDirectory, 'RPG_RT.ldb.po'), 'utf8')
    expect(termsCatalog).toContain('msgctxt "actors.name"\nmsgid "Käthe"')
    const mapCatalog = readFileSync(join(poDirectory, 'Map0001.po'), 'utf8')
    expect(mapCatalog).toContain('msgid ""\n"Willkommen\\n"\n"im Dorf"')
  })
})

describe('inject', () => {
  it('applies translations and rewrites only touched files', () => {
    const gameDirectory = createGameDirectory()
    const dumpPath = join(createDirectory(), 'strings.json')
    extractGame(gameDirectory, { output: dumpPath })
    const databaseBytesBefore = readFileSync(join(gameDirectory, 'RPG_RT.ldb'))

    const dump = readDump(dumpPath)
    setTranslation(dump, 'lmu/1/events/1/pages/1/commands/0', 'Welcome')
    setTranslation(dump, 'lmu/1/events/1/pages/1/commands/2', 'Yes\nNo')
    setTranslation(dump, 'lmu/1/events/1/pages/1/commands/4', 'Good!\nIndeed')
    setTranslation(dump, 'lmt/maps/1/name', 'Village')
    writeFileSync(dumpPath, JSON.stringify(dump))

    const result = injectDump(gameDirectory, dumpPath)
    expect(result.appliedCount).toBe(4)
    expect(result.writtenFileNames).toEqual(['Map0001.lmu', 'RPG_RT.lmt'])
    expect(readFileSync(join(gameDirectory, 'RPG_RT.ldb'))).toEqual(databaseBytesBefore)

    const transcoder = createTranscoder('cp1252')
    const mapUnit = decodeMapUnit(new Uint8Array(readFileSync(join(gameDirectory, 'Map0001.lmu'))), { engine: '2k', transcoder })
    expect(mapUnit.events[0]!.pages[0]!.eventCommands.map(entry => [entry.code, entry.string])).toEqual([
      [10110, 'Welcome'],
      [10140, 'Yes/No'],
      [20140, 'Yes'],
      [10110, 'Good!'],
      [20110, 'Indeed'],
      [20140, 'No'],
      [20141, ''],
      [10610, 'Käthe'],
    ])
  })

  it('round-trips through split dumps', () => {
    const gameDirectory = createGameDirectory()
    const splitDirectory = join(createDirectory(), 'strings')
    extractGame(gameDirectory, { output: splitDirectory, isSplit: true })
    const dumpPath = join(splitDirectory, 'RPG_RT.ldb.json')
    const dump = readDump(dumpPath)
    setTranslation(dump, 'ldb/actors/1/name', 'Kate')
    writeFileSync(dumpPath, JSON.stringify(dump))

    const result = injectDump(gameDirectory, splitDirectory)
    expect(result.writtenFileNames).toEqual(['RPG_RT.ldb'])
    const followUp = extractGame(gameDirectory, { output: join(splitDirectory, 'after'), isSplit: true })
    expect(followUp.unitCount).toBeGreaterThan(0)
    const afterDump = readDump(join(splitDirectory, 'after', 'RPG_RT.ldb.json'))
    expect(afterDump.units.find(unit => unit.address === 'ldb/actors/1/name')?.source).toBe('Kate')
  })

  it.each([
    ['unknown address', 'ldb/actors/99/name', 'Ghost', 'no such unit'],
    ['unencodable text', 'ldb/actors/1/name', 'こんにちは', 'not representable'],
    ['wrong choice line count', 'lmu/1/events/1/pages/1/commands/2', 'OnlyOne', 'exactly 2 required'],
  ])('aborts without writing on %s', (_label, address, translation, expectedMessage) => {
    const gameDirectory = createGameDirectory()
    const dumpPath = join(createDirectory(), 'strings.json')
    extractGame(gameDirectory, { output: dumpPath })
    const mapBytesBefore = readFileSync(join(gameDirectory, 'Map0001.lmu'))

    const dump = readDump(dumpPath)
    if (dump.units.every(unit => unit.address !== address))
      dump.units.push({ address, source: 'x', translation: '', info: [] })
    setTranslation(dump, address, translation)
    setTranslation(dump, 'lmu/1/events/1/pages/1/commands/0', 'Welcome')
    writeFileSync(dumpPath, JSON.stringify(dump))

    expect(() => injectDump(gameDirectory, dumpPath)).toThrow(expectedMessage)
    expect(readFileSync(join(gameDirectory, 'Map0001.lmu'))).toEqual(mapBytesBefore)
  })

  it('rejects stale dumps whose source text drifted', () => {
    const gameDirectory = createGameDirectory()
    const dumpPath = join(createDirectory(), 'strings.json')
    extractGame(gameDirectory, { output: dumpPath })
    const dump = readDump(dumpPath)
    const unit = dump.units.find(entry => entry.address === 'ldb/actors/1/name')!
    unit.source = 'Somebody Else'
    unit.translation = 'Kate'
    writeFileSync(dumpPath, JSON.stringify(dump))
    expect(() => injectDump(gameDirectory, dumpPath)).toThrow('stale')
  })
})
