import { describe, expect, it } from 'vitest'
import { parsePoCatalog, unescapePoText } from '../src/translation/po.ts'

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
