import type { Dump } from '../src/commands/extract.ts'
import type { Database, EventCommand, MapUnit, TreeMap } from '../src/index.ts'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { extractGame } from '../src/commands/extract.ts'
import { injectDump } from '../src/commands/inject.ts'
import { createTranscoder } from '../src/encoding.ts'
import { decodeMapUnit, encodeDatabase, encodeMapUnit, encodeTreeMap } from '../src/index.ts'

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

function createGameDirectory(options: { hasDuplicateActorName?: boolean } = {}): string {
  const directory = createDirectory()
  const transcoder = createTranscoder('cp1252')
  const codecOptions = { engine: '2k', transcoder } as const

  const database = defaultRecord('Database', '2k') as unknown as Database
  database.actors = [
    { ...defaultRecord('Actor', '2k'), id: 1, name: 'Käthe', title: 'Heldin' } as never,
    ...(options.hasDuplicateActorName === true
      ? [{ ...defaultRecord('Actor', '2k'), id: 2, name: 'Käthe', title: 'Zweite' } as never]
      : []),
  ]
  database.terms = { ...database.terms, victory: 'Sieg!' }
  writeFileSync(join(directory, 'RPG_RT.ldb'), encodeDatabase(database, codecOptions))

  const treeMap = defaultRecord('TreeMap', '2k') as unknown as TreeMap
  treeMap.maps = [
    { ...defaultRecord('MapInfo', '2k'), id: 0, name: 'Spiel', type: 0 } as never,
    { ...defaultRecord('MapInfo', '2k'), id: 1, name: 'Dorf', type: 1 } as never,
  ]
  treeMap.treeOrder = [0, 1]
  writeFileSync(join(directory, 'RPG_RT.lmt'), encodeTreeMap(treeMap, codecOptions))

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
  writeFileSync(join(directory, 'Map0001.lmu'), encodeMapUnit(mapUnit, codecOptions))

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

  it('writes split dumps, one per game file', () => {
    const gameDirectory = createGameDirectory()
    const splitDirectory = join(createDirectory(), 'strings')
    const splitResult = extractGame(gameDirectory, { output: splitDirectory, isSplit: true })
    expect(splitResult.outputPaths.map(path => path.split('/').pop()).sort()).toEqual(
      ['Map0001.lmu.json', 'RPG_RT.ldb.json', 'RPG_RT.lmt.json'],
    )
  })

  it('writes po catalogs following the lcftrans file split', () => {
    const gameDirectory = createGameDirectory()
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
    const fileNamesBefore = readdirSync(gameDirectory).sort()

    const dump = readDump(dumpPath)
    setTranslation(dump, 'lmu/1/events/1/pages/1/commands/0', 'Welcome')
    setTranslation(dump, 'lmu/1/events/1/pages/1/commands/2', 'Yes\nNo')
    setTranslation(dump, 'lmu/1/events/1/pages/1/commands/4', 'Good!\nIndeed')
    setTranslation(dump, 'lmt/maps/1/name', 'Village')
    writeFileSync(dumpPath, JSON.stringify(dump))

    const result = injectDump(gameDirectory, dumpPath)
    expect(result.appliedCount).toBe(4)
    expect(result.writtenFileNames).toEqual(['Map0001.lmu', 'RPG_RT.lmt'])
    expect(result.engineSource).toBe('dump')
    expect(result.encodingSource).toBe('dump')
    expect(readFileSync(join(gameDirectory, 'RPG_RT.ldb'))).toEqual(databaseBytesBefore)
    expect(readdirSync(gameDirectory).sort()).toEqual(fileNamesBefore)

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

  it('restores every file when a swap fails mid-batch', () => {
    const gameDirectory = createGameDirectory()
    const dumpPath = join(createDirectory(), 'strings.json')
    extractGame(gameDirectory, { output: dumpPath })
    const mapBytesBefore = readFileSync(join(gameDirectory, 'Map0001.lmu'))
    const treeMapBytesBefore = readFileSync(join(gameDirectory, 'RPG_RT.lmt'))

    const dump = readDump(dumpPath)
    setTranslation(dump, 'lmu/1/events/1/pages/1/commands/0', 'Welcome')
    setTranslation(dump, 'lmt/maps/1/name', 'Village')
    writeFileSync(dumpPath, JSON.stringify(dump))

    // A directory squatting on the backup path makes the second swap's rename
    // throw after Map0001.lmu has already been replaced.
    const blockingPath = join(gameDirectory, 'RPG_RT.lmt.lcfkit-bak')
    mkdirSync(blockingPath)

    expect(() => injectDump(gameDirectory, dumpPath)).toThrow('Nothing was written')
    expect(readFileSync(join(gameDirectory, 'Map0001.lmu'))).toEqual(mapBytesBefore)
    expect(readFileSync(join(gameDirectory, 'RPG_RT.lmt'))).toEqual(treeMapBytesBefore)
    const leftoverNames = readdirSync(gameDirectory).filter(name => name.includes('.lcfkit-'))
    expect(leftoverNames).toEqual(['RPG_RT.lmt.lcfkit-bak'])
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

  it('aborts on a magic page token in a JSON dump without writing', () => {
    const gameDirectory = createGameDirectory()
    const dumpPath = join(createDirectory(), 'strings.json')
    extractGame(gameDirectory, { output: dumpPath })
    const databaseBytesBefore = readFileSync(join(gameDirectory, 'RPG_RT.ldb'))

    const dump = readDump(dumpPath)
    setTranslation(dump, 'ldb/actors/1/name', 'Kate<easyrpg:new_page>')
    writeFileSync(dumpPath, JSON.stringify(dump))

    expect(() => injectDump(gameDirectory, dumpPath)).toThrow('page-manipulation')
    expect(readFileSync(join(gameDirectory, 'RPG_RT.ldb'))).toEqual(databaseBytesBefore)
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

const PO_HEADER = 'msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\n'

function setPoMsgstr(poFilePath: string, address: string, escapedMsgstr: string): void {
  const lines = readFileSync(poFilePath, 'utf8').split('\n')
  const referenceIndex = lines.findIndex(line => line === `#: ${address}`)
  expect(referenceIndex, `#: ${address}`).toBeGreaterThan(-1)
  const msgstrIndex = lines.findIndex((line, index) => index > referenceIndex && line.startsWith('msgstr'))
  lines[msgstrIndex] = `msgstr "${escapedMsgstr}"`
  writeFileSync(poFilePath, lines.join('\n'))
}

describe('inject from PO', () => {
  it('round-trips a full extract --po → filled msgstr → inject cycle', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = join(createDirectory(), 'po')
    extractGame(gameDirectory, { output: poDirectory, isPo: true })

    setPoMsgstr(join(poDirectory, 'RPG_RT.ldb.po'), 'ldb/actors/1/name', 'Kate')
    setPoMsgstr(join(poDirectory, 'RPG_RT.lmt.po'), 'lmt/maps/1/name', 'Village')
    setPoMsgstr(join(poDirectory, 'Map0001.po'), 'lmu/1/events/1/pages/1/commands/0', 'Welcome\\nto the village')

    const result = injectDump(gameDirectory, poDirectory)
    expect(result.appliedCount).toBe(3)
    expect(result.engine).toBe('2k')
    expect(result.encoding).toBe('cp1252')
    expect(result.engineSource).toBe('database')
    expect(result.encodingSource).toBe('ini')

    const afterPath = join(createDirectory(), 'after.json')
    extractGame(gameDirectory, { output: afterPath })
    const afterDump = readDump(afterPath)
    const sources = new Map(afterDump.units.map(unit => [unit.address, unit.source]))
    expect(sources.get('ldb/actors/1/name')).toBe('Kate')
    expect(sources.get('lmt/maps/1/name')).toBe('Village')
    expect(sources.get('lmu/1/events/1/pages/1/commands/0')).toBe('Welcome\nto the village')
    expect(sources.get('ldb/terms/victory')).toBe('Sieg!')
  })

  it('fans one merged entry out to every #: address it carries', () => {
    const gameDirectory = createGameDirectory({ hasDuplicateActorName: true })
    const poDirectory = join(createDirectory(), 'po')
    extractGame(gameDirectory, { output: poDirectory, isPo: true })

    const catalog = readFileSync(join(poDirectory, 'RPG_RT.ldb.po'), 'utf8')
    expect(catalog).toContain('#: ldb/actors/1/name\n')
    expect(catalog).toContain('#: ldb/actors/2/name\n')
    setPoMsgstr(join(poDirectory, 'RPG_RT.ldb.po'), 'ldb/actors/1/name', 'Kate')

    const result = injectDump(gameDirectory, poDirectory)
    expect(result.appliedCount).toBe(2)

    const afterPath = join(createDirectory(), 'after.json')
    extractGame(gameDirectory, { output: afterPath })
    const sources = new Map(readDump(afterPath).units.map(unit => [unit.address, unit.source]))
    expect(sources.get('ldb/actors/1/name')).toBe('Kate')
    expect(sources.get('ldb/actors/2/name')).toBe('Kate')
  })

  it('matches a foreign catalog with no #: by (msgctxt, msgid) scoped to the filename', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}msgctxt "actors.name"\nmsgid "Käthe"\nmsgstr "Kate"\n`,
    )

    const result = injectDump(gameDirectory, poDirectory)
    expect(result.appliedCount).toBe(1)

    const afterPath = join(createDirectory(), 'after.json')
    extractGame(gameDirectory, { output: afterPath })
    const sources = new Map(readDump(afterPath).units.map(unit => [unit.address, unit.source]))
    expect(sources.get('ldb/actors/1/name')).toBe('Kate')
  })

  it('normalizes a foreign msgctxt "" to no-context so it still matches', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'Map0001.po'),
      `${PO_HEADER}msgctxt ""\nmsgid "Willkommen\\nim Dorf"\nmsgstr "Welcome"\n`,
    )
    const result = injectDump(gameDirectory, poDirectory)
    expect(result.appliedCount).toBe(1)

    const afterPath = join(createDirectory(), 'after.json')
    extractGame(gameDirectory, { output: afterPath })
    const sources = new Map(readDump(afterPath).units.map(unit => [unit.address, unit.source]))
    expect(sources.get('lmu/1/events/1/pages/1/commands/0')).toBe('Welcome')
  })

  it('scopes fallback matching to the catalog filename', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    // The msgid exists in the game, but only as a Map0001 unit – an ldb catalog
    // must not reach across files to it.
    writeFileSync(
      join(poDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}msgid "Willkommen\\nim Dorf"\nmsgstr "Welcome"\n`,
    )
    expect(() => injectDump(gameDirectory, poDirectory)).toThrow('no game text matches')
  })

  it('aborts when a foreign entry matches no game text', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}msgctxt "actors.name"\nmsgid "Ghost"\nmsgstr "Geist"\n`,
    )
    expect(() => injectDump(gameDirectory, poDirectory)).toThrow('no game text matches')
  })

  it('aborts when a #: address is absent from the game', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}#: ldb/actors/99/name\nmsgid "Käthe"\nmsgstr "Kate"\n`,
    )
    expect(() => injectDump(gameDirectory, poDirectory)).toThrow('no such unit')
  })

  it('collapses identical (address, translation) duplicates into one applied unit', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}#: ldb/actors/1/name\nmsgid "Käthe"\nmsgstr "Kate"\n\n`
      + `#: ldb/actors/1/name\nmsgid "Käthe"\nmsgstr "Kate"\n`,
    )
    const result = injectDump(gameDirectory, poDirectory)
    expect(result.appliedCount).toBe(1)

    const afterPath = join(createDirectory(), 'after.json')
    extractGame(gameDirectory, { output: afterPath })
    const sources = new Map(readDump(afterPath).units.map(unit => [unit.address, unit.source]))
    expect(sources.get('ldb/actors/1/name')).toBe('Kate')
  })

  it('aborts when one address receives conflicting translations', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}#: ldb/actors/1/name\nmsgid "Käthe"\nmsgstr "Kate"\n\n`
      + `#: ldb/actors/1/name\nmsgid "Käthe"\nmsgstr "Kathy"\n`,
    )
    expect(() => injectDump(gameDirectory, poDirectory)).toThrow('conflicting')
  })

  it('skips fuzzy entries, counts them, and does not apply them', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}#: ldb/actors/1/name\n#, fuzzy\nmsgid "Käthe"\nmsgstr "Kate"\n`,
    )
    const result = injectDump(gameDirectory, poDirectory)
    expect(result.appliedCount).toBe(0)
    expect(result.fuzzySkippedCount).toBe(1)

    const afterPath = join(createDirectory(), 'after.json')
    extractGame(gameDirectory, { output: afterPath })
    const sources = new Map(readDump(afterPath).units.map(unit => [unit.address, unit.source]))
    expect(sources.get('ldb/actors/1/name')).toBe('Käthe')
  })

  it('aborts a directory mixing .po and .json dumps', () => {
    const gameDirectory = createGameDirectory()
    const mixedDirectory = createDirectory()
    writeFileSync(join(mixedDirectory, 'RPG_RT.ldb.po'), PO_HEADER)
    writeFileSync(join(mixedDirectory, 'RPG_RT.ldb.json'), '{}')
    expect(() => injectDump(gameDirectory, mixedDirectory)).toThrow(/mix/i)
  })

  it('imports a Poedit-style catalog with wrapped continuations and header churn', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'Map0001.po'),
      'msgid ""\nmsgstr ""\n'
      + '"Project-Id-Version: Game 1.0\\n"\n'
      + '"Content-Type: text/plain; charset=UTF-8\\n"\n'
      + '"X-Generator: Poedit 3.4\\n"\n\n'
      + '#: lmu/1/events/1/pages/1/commands/0\n'
      + 'msgid ""\n"Willkommen\\n"\n"im Dorf"\n'
      + 'msgstr ""\n"Welcome\\n"\n"to the village"\n',
    )
    const result = injectDump(gameDirectory, poDirectory)
    expect(result.appliedCount).toBe(1)

    const afterPath = join(createDirectory(), 'after.json')
    extractGame(gameDirectory, { output: afterPath })
    const sources = new Map(readDump(afterPath).units.map(unit => [unit.address, unit.source]))
    expect(sources.get('lmu/1/events/1/pages/1/commands/0')).toBe('Welcome\nto the village')
  })

  it('imports a Weblate-style catalog with #| previous source and #~ obsolete lines', () => {
    const gameDirectory = createGameDirectory()
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}#| msgid "Kaethe"\n#: ldb/actors/1/name\nmsgid "Käthe"\nmsgstr "Kate"\n\n`
      + '#~ msgid "Alt"\n#~ msgstr "veraltet"\n',
    )
    const result = injectDump(gameDirectory, poDirectory)
    expect(result.appliedCount).toBe(1)

    const afterPath = join(createDirectory(), 'after.json')
    extractGame(gameDirectory, { output: afterPath })
    const sources = new Map(readDump(afterPath).units.map(unit => [unit.address, unit.source]))
    expect(sources.get('ldb/actors/1/name')).toBe('Kate')
  })

  it('aborts on a magic page token only when the entry would be applied', () => {
    const gameDirectory = createGameDirectory()
    const abortDirectory = createDirectory()
    writeFileSync(
      join(abortDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}#: ldb/actors/1/name\nmsgid "Käthe"\nmsgstr "Kate<easyrpg:new_page>"\n`,
    )
    expect(() => injectDump(gameDirectory, abortDirectory)).toThrow('page-manipulation')

    const fuzzyDirectory = createDirectory()
    writeFileSync(
      join(fuzzyDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}#: ldb/actors/1/name\n#, fuzzy\nmsgid "Käthe"\nmsgstr "Kate<easyrpg:new_page>"\n`,
    )
    const result = injectDump(gameDirectory, fuzzyDirectory)
    expect(result.appliedCount).toBe(0)
    expect(result.fuzzySkippedCount).toBe(1)
  })

  it('counts untranslated work in game units, not merged entries', () => {
    const gameDirectory = createGameDirectory({ hasDuplicateActorName: true })
    const poDirectory = createDirectory()
    writeFileSync(
      join(poDirectory, 'RPG_RT.ldb.po'),
      `${PO_HEADER}#: ldb/actors/1/name\n#: ldb/actors/2/name\nmsgid "Käthe"\nmsgstr ""\n\n`
      + `#: ldb/terms/victory\nmsgid "Sieg!"\nmsgstr "Victory!"\n`,
    )
    const result = injectDump(gameDirectory, poDirectory)
    expect(result.appliedCount).toBe(1)
    expect(result.untranslatedCount).toBe(2)
  })
})
