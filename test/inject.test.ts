import type { ParsedCatalog } from '../src/translation/inject.ts'
import type { CatalogContext, ParsedPoEntry } from '../src/translation/po.ts'
import type { CollectedUnit } from '../src/translation/units.ts'
import { describe, expect, it } from 'vitest'
import { resolvePoDumps } from '../src/translation/inject.ts'

const catalogContext: CatalogContext = {
  databaseFileName: 'RPG_RT.ldb',
  treeMapFileName: 'RPG_RT.lmt',
  mapFileNames: ['Map0001.lmu'],
}

function entry(overrides: Partial<ParsedPoEntry> & Pick<ParsedPoEntry, 'source'>): ParsedPoEntry {
  return { translation: '', addresses: [], isFuzzy: false, ...overrides }
}

function catalog(fileName: string, ...entries: ParsedPoEntry[]): ParsedCatalog {
  return { fileName, entries }
}

function unit(overrides: Partial<CollectedUnit> & Pick<CollectedUnit, 'address' | 'source'>): Omit<CollectedUnit, 'applyTranslation'> {
  return {
    info: [],
    fileName: 'RPG_RT.ldb',
    catalog: 'terms',
    expectedLineCount: 1,
    ...overrides,
  }
}

describe('resolvePoDumps', () => {
  it('fans a merged entry out to every #: address it carries', () => {
    const resolution = resolvePoDumps(
      [catalog('RPG_RT.ldb.po', entry({ source: 'Alex', translation: 'Kate', addresses: ['ldb/actors/1/name', 'ldb/actors/2/name'] }))],
      [],
      catalogContext,
    )
    expect(resolution.units.map(dumpUnit => dumpUnit.address)).toEqual(['ldb/actors/1/name', 'ldb/actors/2/name'])
    expect(resolution.units.every(dumpUnit => dumpUnit.translation === 'Kate')).toBe(true)
  })

  it('collapses identical (address, translation) duplicates into one unit', () => {
    const resolution = resolvePoDumps(
      [catalog(
        'RPG_RT.ldb.po',
        entry({ source: 'Alex', translation: 'Kate', addresses: ['ldb/actors/1/name'] }),
        entry({ source: 'Alex', translation: 'Kate', addresses: ['ldb/actors/1/name'] }),
      )],
      [],
      catalogContext,
    )
    expect(resolution.units).toHaveLength(1)
    expect(resolution.abortReasons).toEqual([])
  })

  it('aborts when one address receives conflicting translations', () => {
    const resolution = resolvePoDumps(
      [catalog(
        'RPG_RT.ldb.po',
        entry({ source: 'Alex', translation: 'Kate', addresses: ['ldb/actors/1/name'] }),
        entry({ source: 'Alex', translation: 'Kathy', addresses: ['ldb/actors/1/name'] }),
      )],
      [],
      catalogContext,
    )
    expect(resolution.abortReasons.some(reason => reason.includes('conflicting'))).toBe(true)
  })

  it('skips fuzzy entries without applying them', () => {
    const resolution = resolvePoDumps(
      [catalog('RPG_RT.ldb.po', entry({ source: 'Alex', translation: 'Kate', addresses: ['ldb/actors/1/name'], isFuzzy: true }))],
      [],
      catalogContext,
    )
    expect(resolution.units).toEqual([])
    expect(resolution.fuzzySkippedCount).toBe(1)
  })

  it('counts a fuzzy entry with an empty msgstr as skipped, not untranslated', () => {
    const resolution = resolvePoDumps(
      [catalog('RPG_RT.ldb.po', entry({ source: 'Alex', addresses: ['ldb/actors/1/name'], isFuzzy: true }))],
      [],
      catalogContext,
    )
    expect(resolution.units).toEqual([])
    expect(resolution.fuzzySkippedCount).toBe(1)
    expect(resolution.untranslatedCount).toBe(0)
  })

  it('counts untranslated work in game units, not merged entries', () => {
    const collectedUnits = [
      unit({ address: 'ldb/actors/1/name', source: 'Alex', context: 'actors.name' }),
      unit({ address: 'ldb/actors/2/name', source: 'Alex', context: 'actors.name' }),
    ]
    const resolution = resolvePoDumps(
      [catalog('RPG_RT.ldb.po', entry({ context: 'actors.name', source: 'Alex', translation: '' }))],
      collectedUnits,
      catalogContext,
    )
    expect(resolution.units).toEqual([])
    expect(resolution.untranslatedCount).toBe(2)
  })

  it('defers a magic-token translation to planInjection', () => {
    const resolution = resolvePoDumps(
      [catalog('RPG_RT.ldb.po', entry({ source: 'Alex', translation: 'Kate<easyrpg:new_page>', addresses: ['ldb/actors/1/name'] }))],
      [],
      catalogContext,
    )
    expect(resolution.units).toHaveLength(1)
    expect(resolution.units[0]!.translation).toBe('Kate<easyrpg:new_page>')
    expect(resolution.abortReasons).toEqual([])
  })

  it('skips a fuzzy magic-token translation like any other fuzzy entry', () => {
    const resolution = resolvePoDumps(
      [catalog('RPG_RT.ldb.po', entry({ source: 'Alex', translation: 'Kate<easyrpg:new_page>', addresses: ['ldb/actors/1/name'], isFuzzy: true }))],
      [],
      catalogContext,
    )
    expect(resolution.units).toEqual([])
    expect(resolution.fuzzySkippedCount).toBe(1)
  })

  it('matches a foreign entry with no #: by (msgctxt, source) scoped to the filename', () => {
    const collectedUnits = [unit({ address: 'ldb/actors/1/name', source: 'Alex', context: 'actors.name' })]
    const resolution = resolvePoDumps(
      [catalog('RPG_RT.ldb.po', entry({ context: 'actors.name', source: 'Alex', translation: 'Kate' }))],
      collectedUnits,
      catalogContext,
    )
    expect(resolution.units.map(dumpUnit => dumpUnit.address)).toEqual(['ldb/actors/1/name'])
  })

  it('does not reach across catalog files for a fallback match', () => {
    const collectedUnits = [unit({ address: 'ldb/actors/1/name', source: 'Alex', context: 'actors.name' })]
    const resolution = resolvePoDumps(
      [catalog('Map0001.po', entry({ context: 'actors.name', source: 'Alex', translation: 'Kate' }))],
      collectedUnits,
      catalogContext,
    )
    expect(resolution.units).toEqual([])
    expect(resolution.abortReasons.some(reason => reason.includes('no game text matches'))).toBe(true)
  })

  it('normalizes a foreign msgctxt "" to no-context so it still matches', () => {
    const collectedUnits = [unit({
      address: 'lmu/1/events/1/pages/1/commands/0',
      source: 'Willkommen',
      fileName: 'Map0001.lmu',
      catalog: 'map',
    })]
    const resolution = resolvePoDumps(
      [catalog('Map0001.po', entry({ context: '', source: 'Willkommen', translation: 'Welcome' }))],
      collectedUnits,
      catalogContext,
    )
    expect(resolution.units.map(dumpUnit => dumpUnit.address)).toEqual(['lmu/1/events/1/pages/1/commands/0'])
    expect(resolution.units[0]!.context).toBeUndefined()
  })
})
