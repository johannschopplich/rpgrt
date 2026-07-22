import type { Database, EventCommand, TreeMap } from '../src/index.ts'
import type { CollectedUnit } from '../src/translation/units.ts'
import { describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { createTranscoder } from '../src/encoding.ts'
import { planInjection } from '../src/translation/inject.ts'
import { formatPoCatalog } from '../src/translation/po.ts'
import { collectDatabaseUnits, collectMapUnits, collectTreeMapUnits } from '../src/translation/units.ts'

function command(code: number, string = '', indent = 0, parameters: number[] = []): EventCommand {
  return { code, indent, string, parameters }
}

function mapUnitWithCommands(commands: EventCommand[]): Parameters<typeof collectMapUnits>[0] {
  const page = { id: 1, ...defaultRecord('EventPage', '2k') } as never as { eventCommands: EventCommand[] }
  page.eventCommands = commands
  return {
    ...defaultRecord('MapUnit', '2k'),
    events: [{ id: 7, name: 'npc', x: 3, y: 4, pages: [page] }],
  } as never
}

describe('map command units', () => {
  it('merges a message with its continuation lines', () => {
    const commands = [
      command(10110, 'Hello'),
      command(20110, 'World'),
      command(11410, '', 0, [5]),
      command(10110, 'Next'),
    ]
    const units = collectMapUnits(mapUnitWithCommands(commands), 42, 'Map0042.lmu')
    expect(units.map(unit => [unit.address, unit.source])).toEqual([
      ['lmu/42/events/7/pages/1/commands/0', 'Hello\nWorld'],
      ['lmu/42/events/7/pages/1/commands/3', 'Next'],
    ])
    expect(units[0]!.info[0]).toBe('ID 7, Page 1, Line 1, Pos (3,4)')
  })

  it('strips raw control characters but keeps escape sequences verbatim', () => {
    const commands = [command(10110, 'Say \\c[3]hi\x02 there')]
    const units = collectMapUnits(mapUnitWithCommands(commands), 1, 'Map0001.lmu')
    expect(units[0]!.source).toBe('Say \\c[3]hi there')
  })

  it('collects choices with an embedded-in-message note', () => {
    const commands = [
      command(10110, 'Pick one'),
      command(10140, 'Yes/No'),
      command(20140, 'Yes', 0, [0]),
      command(10110, 'Great', 1),
      command(20140, 'No', 0, [1]),
      command(20141, '', 0, [4]),
    ]
    const units = collectMapUnits(mapUnitWithCommands(commands), 1, 'Map0001.lmu')
    expect(units.map(unit => unit.source)).toEqual(['Pick one', 'Yes\nNo', 'Great'])
    expect(units[0]!.info).toContain('Contains choice at line 2 (2 options)')
    expect(units[1]!.info).toContain('Choice (2 options, embedded in a message)')
    expect(units[1]!.expectedLineCount).toBe(2)
  })

  it('extracts hero name changes and actor-name conditions with contexts', () => {
    const commands = [
      command(10610, 'Alex', 0, [1]),
      command(10620, 'Hero', 0, [1]),
      command(12010, 'Alex', 0, [5, 0, 1]),
      command(12010, 'ignored', 0, [1, 0, 1]),
    ]
    const units = collectMapUnits(mapUnitWithCommands(commands), 1, 'Map0001.lmu')
    expect(units.map(unit => [unit.source, unit.context])).toEqual([
      ['Alex', 'actors.name'],
      ['Hero', 'actors.title'],
      ['Alex', 'actors.name'],
    ])
  })

  it('applies translations in any order', () => {
    const commands = [
      command(10110, 'Msg'),
      command(10140, 'A/B'),
      command(20140, 'A', 0, [0]),
      command(10110, 'Inner', 1),
      command(20140, 'B', 0, [1]),
      command(20141, '', 0, [4]),
    ]
    const units = collectMapUnits(mapUnitWithCommands(commands), 1, 'Map0001.lmu')
    expect(units.map(unit => unit.source)).toEqual(['Msg', 'A\nB', 'Inner'])
    units[0]!.applyTranslation(['M1', 'M2'])
    units[1]!.applyTranslation(['X', 'Y'])
    units[2]!.applyTranslation(['Deep', 'Deeper'])
    expect(commands.map(entry => [entry.code, entry.string])).toEqual([
      [10110, 'M1'],
      [20110, 'M2'],
      [10140, 'X/Y'],
      [20140, 'X'],
      [10110, 'Deep'],
      [20110, 'Deeper'],
      [20140, 'Y'],
      [20141, ''],
    ])
  })

  it('grows and shrinks message command lists on apply', () => {
    const commands = [
      command(10110, 'One'),
      command(20110, 'Two'),
      command(10110, 'Standalone'),
    ]
    const units = collectMapUnits(mapUnitWithCommands(commands), 1, 'Map0001.lmu')
    units[1]!.applyTranslation(['A', 'B', 'C'])
    units[0]!.applyTranslation(['Single'])
    expect(commands.map(entry => [entry.code, entry.string])).toEqual([
      [10110, 'Single'],
      [10110, 'A'],
      [20110, 'B'],
      [20110, 'C'],
    ])
  })
})

describe('database units', () => {
  function databaseWithText(): Database {
    const database = defaultRecord('Database', '2k') as unknown as Database
    database.actors = [{ ...defaultRecord('Actor', '2k'), id: 1, name: 'Alex', title: 'Held', skillName: 'Magie' } as never]
    database.skills = [{ ...defaultRecord('Skill', '2k'), id: 3, name: 'Feuer', usingMessage1: 'wirkt Feuer' } as never]
    database.terms = { ...database.terms, victory: 'Sieg!' }
    database.commonevents = [{ ...defaultRecord('CommonEvent', '2k'), id: 2, eventCommands: [command(10110, 'Gemeinsam')] } as never]
    database.troops = [{ ...defaultRecord('Troop', '2k'), id: 4, pages: [{ id: 1, ...defaultRecord('TroopPage', '2k'), eventCommands: [command(10110, 'Kampf!')] }] } as never]
    return database
  }

  it('collects whitelisted fields with liblcf contexts', () => {
    const units = collectDatabaseUnits(databaseWithText(), 'RPG_RT.ldb')
    const byAddress = new Map(units.map(unit => [unit.address, unit]))
    expect(byAddress.get('ldb/actors/1/skillName')?.context).toBe('actors.skill_name')
    expect(byAddress.get('ldb/skills/3/usingMessage1')?.context).toBe('skills.using_message1')
    expect(byAddress.get('ldb/terms/victory')?.context).toBe('terms.victory')
    expect(byAddress.get('ldb/commonevents/2/commands/0')?.catalog).toBe('common')
    expect(byAddress.get('ldb/troops/4/pages/1/commands/0')?.catalog).toBe('battle')
    expect(units.every(unit => unit.fileName === 'RPG_RT.ldb')).toBe(true)
  })
})

describe('map tree units', () => {
  it('collects only named actual maps', () => {
    const treeMap = defaultRecord('TreeMap', '2k') as unknown as TreeMap
    const mapInfo = (id: number, name: string, type: number): TreeMap['maps'][0] =>
      ({ ...defaultRecord('MapInfo', '2k'), id, name, type } as never)
    treeMap.maps = [mapInfo(0, 'Game', 0), mapInfo(1, 'Stadt', 1), mapInfo(2, 'Zone', 2)]
    const units = collectTreeMapUnits(treeMap, 'RPG_RT.lmt')
    expect(units.map(unit => [unit.address, unit.source])).toEqual([['lmt/maps/1/name', 'Stadt']])
  })
})

describe('injection planning', () => {
  const context = { transcoder: createTranscoder('cp1252'), encoding: 'cp1252' }

  function collected(address: string, source: string): CollectedUnit {
    return { address, source, info: [], fileName: 'RPG_RT.ldb', catalog: 'terms', expectedLineCount: 1, applyTranslation: () => {} }
  }

  it('pairs dump units to collected units and validates them purely', () => {
    const plan = planInjection([collected('ldb/actors/1/name', 'Käthe'), collected('ldb/terms/victory', 'Sieg!')], [
      { address: 'ldb/actors/1/name', source: 'Käthe', translation: 'Kate', info: [] },
      { address: 'ldb/terms/victory', source: 'Sieg!', translation: '', info: [] },
      { address: 'ldb/ghost/9/name', source: 'x', translation: 'y', info: [] },
    ], context)
    expect(plan.untranslatedCount).toBe(1)
    expect(plan.applications.map(application => application.collected.address)).toEqual(['ldb/actors/1/name'])
    expect(plan.abortReasons).toEqual(['ldb/ghost/9/name: no such unit in the game'])
  })

  it('collects every abort reason instead of stopping at the first', () => {
    const plan = planInjection([collected('ldb/actors/1/name', 'Käthe')], [
      { address: 'ldb/actors/1/name', source: 'Somebody', translation: 'Kate', info: [] },
      { address: 'ldb/missing', source: 'x', translation: 'y', info: [] },
    ], context)
    expect(plan.applications).toEqual([])
    expect(plan.abortReasons).toHaveLength(2)
  })
})

describe('po catalog', () => {
  it('formats multiline entries and merges duplicates', () => {
    const units = [
      { address: 'a', source: 'Say "hi"\\c[3]\nLine two', info: ['ID 1, Line 1'] },
      { address: 'b', source: 'Say "hi"\\c[3]\nLine two', info: ['ID 2, Line 5'] },
      { address: 'c', source: 'Alex', context: 'actors.name', info: ['ID 1'] },
    ]
    const catalog = formatPoCatalog(units, 'TestGame')
    expect(catalog).toContain('"Project-Id-Version: TestGame 1.0\\n"')
    expect(catalog).toContain('"Content-Type: text/plain; charset=UTF-8\\n"')
    expect(catalog).toContain('#. ID 1, Line 1\n#. ID 2, Line 5\nmsgid ""\n"Say \\"hi\\"\\\\c[3]\\n"\n"Line two"\nmsgstr ""\n')
    expect(catalog).toContain('msgctxt "actors.name"\nmsgid "Alex"\nmsgstr ""\n')
    expect(catalog.match(/msgid ""\n"Say/g)).toHaveLength(1)
  })
})
