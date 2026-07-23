import type { CollectedUnit } from '../src/translation/units.ts'
import { describe, expect, it } from 'vitest'
import { fallbackMatchKey, parsePoCatalog, poCatalogs, unescapePoText } from '../src/translation/po.ts'

function poText(...lines: string[]): string {
  return `${lines.join('\n')}\n`
}

const header = poText(
  'msgid ""',
  'msgstr ""',
  '"Project-Id-Version: Game 1.0\\n"',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '',
)

describe('fallbackMatchKey', () => {
  it('folds an undefined context into an empty context segment', () => {
    expect(fallbackMatchKey(undefined, 'src')).toBe('\x01src')
  })

  it('separates context from source so (ctx, "") and ("", ctx) never collide', () => {
    expect(fallbackMatchKey('ctx', '')).not.toBe(fallbackMatchKey('', 'ctx'))
  })
})

function collectedUnit(overrides: Partial<CollectedUnit> & Pick<CollectedUnit, 'catalog' | 'fileName'>): CollectedUnit {
  return {
    address: 'ldb/actors/1/name',
    source: 'Alex',
    info: [],
    expectedLineCount: 1,
    applyTranslation: () => {},
    ...overrides,
  }
}

describe('poCatalogs', () => {
  const context = { databaseFileName: 'RPG_RT.ldb', treeMapFileName: 'RPG_RT.lmt', mapFileNames: ['Map0001.lmu'] }

  it('names the fixed database catalogs after lcftrans', () => {
    const catalogs = poCatalogs([collectedUnit({ catalog: 'terms', fileName: 'RPG_RT.ldb' })], context)
    expect([...catalogs.keys()]).toEqual(['RPG_RT.ldb.po', 'RPG_RT.ldb.common.po', 'RPG_RT.ldb.battle.po'])
  })

  it('omits the tree-map catalog when no lmt units exist', () => {
    const catalogs = poCatalogs([collectedUnit({ catalog: 'terms', fileName: 'RPG_RT.ldb' })], context)
    expect(catalogs.has('RPG_RT.lmt.po')).toBe(false)
  })

  it('adds the tree-map catalog when lmt units exist', () => {
    const catalogs = poCatalogs([collectedUnit({ catalog: 'lmt', fileName: 'RPG_RT.lmt' })], context)
    expect(catalogs.get('RPG_RT.lmt.po')).toHaveLength(1)
  })

  it('adds a map catalog keyed by filename without the .lmu suffix, only when it has units', () => {
    const emptyCatalogs = poCatalogs([collectedUnit({ catalog: 'terms', fileName: 'RPG_RT.ldb' })], context)
    expect(emptyCatalogs.has('Map0001.po')).toBe(false)
    const catalogs = poCatalogs([collectedUnit({ catalog: 'map', fileName: 'Map0001.lmu' })], context)
    expect(catalogs.get('Map0001.po')).toHaveLength(1)
  })
})

describe('unescapePoText', () => {
  it('unescapes exactly backslash, newline and quote', () => {
    expect(unescapePoText('a\\nb')).toBe('a\nb')
    expect(unescapePoText('say \\"hi\\"')).toBe('say "hi"')
    expect(unescapePoText('one\\\\two')).toBe('one\\two')
  })

  it('aborts on any other escape', () => {
    expect(() => unescapePoText('tab\\there')).toThrow('escape')
    expect(() => unescapePoText('cr\\r')).toThrow('escape')
  })
})

describe('parsePoCatalog', () => {
  it('skips the header block', () => {
    expect(parsePoCatalog(header)).toEqual([])
  })

  it('reassembles continuation segments verbatim, then unescapes', () => {
    const entries = parsePoCatalog(header + poText(
      'msgid ""',
      '"Hello "',
      '"World"',
      'msgstr ""',
      '"Hallo "',
      '"Welt"',
    ))
    expect(entries).toEqual([
      { context: undefined, source: 'Hello World', translation: 'Hallo Welt', addresses: [], isFuzzy: false },
    ])
  })

  it('treats \\n segments as the only source of newlines (trailing-empty round trip)', () => {
    const entries = parsePoCatalog(header + poText(
      'msgid ""',
      '"a\\n"',
      '"b\\n"',
      '""',
      'msgstr "x"',
    ))
    expect(entries[0]!.source).toBe('a\nb\n')
    expect(entries[0]!.source.split('\n')).toEqual(['a', 'b', ''])
  })

  it('collects #: reference addresses, one per occurrence', () => {
    const entries = parsePoCatalog(header + poText(
      '#. ID 1',
      '#: ldb/actors/1/name',
      '#. ID 2',
      '#: ldb/actors/2/name',
      'msgid "Alex"',
      'msgstr "Kate"',
    ))
    expect(entries[0]!.addresses).toEqual(['ldb/actors/1/name', 'ldb/actors/2/name'])
  })

  it('carries msgctxt through and leaves foreign entries without #:', () => {
    const entries = parsePoCatalog(header + poText(
      'msgctxt "actors.name"',
      'msgid "Alex"',
      'msgstr "Kate"',
    ))
    expect(entries[0]).toMatchObject({ context: 'actors.name', addresses: [] })
  })

  it('tolerates CRLF, CR and a missing final newline', () => {
    const entries = parsePoCatalog(`${header}msgid "Hi"\r\nmsgstr "Moin"`)
    expect(entries).toEqual([
      { context: undefined, source: 'Hi', translation: 'Moin', addresses: [], isFuzzy: false },
    ])
  })

  it('flags fuzzy entries without aborting', () => {
    const entries = parsePoCatalog(header + poText(
      '#, fuzzy',
      'msgid "Alex"',
      'msgstr "Kate"',
    ))
    expect(entries[0]!.isFuzzy).toBe(true)
  })

  it('ignores #| previous-source and #~ obsolete comment lines', () => {
    const entries = parsePoCatalog(header + poText(
      '#| msgid "Alexx"',
      'msgid "Alex"',
      'msgstr "Kate"',
      '',
      '#~ msgid "gone"',
      '#~ msgstr "weg"',
    ))
    expect(entries).toEqual([
      { context: undefined, source: 'Alex', translation: 'Kate', addresses: [], isFuzzy: false },
    ])
  })

  it('aborts on plural forms', () => {
    expect(() => parsePoCatalog(header + poText(
      'msgid "one"',
      'msgid_plural "many"',
      'msgstr[0] "eins"',
      'msgstr[1] "viele"',
    ))).toThrow('plural')
  })

  it('aborts on an unknown escape', () => {
    expect(() => parsePoCatalog(header + poText(
      'msgid "Alex"',
      'msgstr "Ka\\te"',
    ))).toThrow('escape')
  })
})
