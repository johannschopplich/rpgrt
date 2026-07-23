import type { CollectedUnit, TextUnit } from './units.ts'
import { LcfError } from '../codec/errors.ts'

/**
 * The `(context, source)` match key shared by catalog grouping and inject fallback.
 * `\x01` between the two fields keeps `(ctx, '')` and `('', ctx)` from colliding.
 */
export function fallbackMatchKey(context: string | undefined, source: string): string {
  return `${context ?? ''}\x01${source}`
}

/** The narrow `LoadedGame` slice `poCatalogs` reads, so no command type crosses into `translation/`. */
export interface CatalogContext {
  databaseFileName: string
  treeMapFileName?: string
  mapFileNames: string[]
}

/** PO catalogs follow lcftrans's naming so its tooling and EasyRPG Player match up. */
export function poCatalogs(units: CollectedUnit[], context: CatalogContext): Map<string, CollectedUnit[]> {
  const catalogs = new Map<string, CollectedUnit[]>([
    [`${context.databaseFileName}.po`, units.filter(unit => unit.catalog === 'terms')],
    [`${context.databaseFileName}.common.po`, units.filter(unit => unit.catalog === 'common')],
    [`${context.databaseFileName}.battle.po`, units.filter(unit => unit.catalog === 'battle')],
  ])
  const treeMapUnits = units.filter(unit => unit.catalog === 'lmt')
  if (context.treeMapFileName !== undefined && treeMapUnits.length > 0)
    catalogs.set(`${context.treeMapFileName}.po`, treeMapUnits)
  for (const fileName of context.mapFileNames) {
    const mapUnits = units.filter(unit => unit.fileName === fileName)
    if (mapUnits.length > 0)
      catalogs.set(`${fileName.replace(/\.lmu$/i, '')}.po`, mapUnits)
  }
  return catalogs
}

/** Only quote and backslash are escaped – newlines are structural in PO. */
function escapePoText(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

/** gettext multiline form: one quoted segment per line, `\n` between lines only. */
function formatPoString(keyword: string, lines: string[]): string {
  if (lines.length <= 1)
    return `${keyword} "${escapePoText(lines[0] ?? '')}"\n`
  let text = `${keyword} ""\n`
  lines.forEach((line, index) => {
    text += `"${escapePoText(line)}${index < lines.length - 1 ? '\\n' : ''}"\n`
  })
  return text
}

function formatPoHeader(projectName: string): string {
  return 'msgid ""\n'
    + 'msgstr ""\n'
    + `"Project-Id-Version: ${projectName} 1.0\\n"\n`
    + '"Language-Team: YOUR NAME <mail@your.address>\\n"\n'
    + '"Language: \\n"\n'
    + '"MIME-Version: 1.0\\n"\n'
    + '"Content-Type: text/plain; charset=UTF-8\\n"\n'
    + '"Content-Transfer-Encoding: 8bit\\n"\n'
    + '"X-CreatedBy: lcfkit"\n'
}

/**
 * Formats units as one lcftrans-compatible PO catalog. Units sharing context and
 * source merge into a single entry that accumulates every occurrence's info lines.
 */
export function formatPoCatalog(units: TextUnit[], projectName: string): string {
  const groups = new Map<string, TextUnit[]>()
  for (const unit of units) {
    const key = fallbackMatchKey(unit.context, unit.source)
    const group = groups.get(key)
    if (group === undefined)
      groups.set(key, [unit])
    else
      group.push(unit)
  }

  let text = formatPoHeader(projectName)
  for (const group of groups.values()) {
    text += '\n'
    for (const unit of group) {
      for (const infoLine of unit.info)
        text += `#. ${infoLine}\n`
      // A gettext reference comment per occurrence – the machine key inject
      // reads back to re-address the translation, surviving msgid edits.
      text += `#: ${unit.address}\n`
    }
    const first = group[0]!
    if (first.context !== undefined)
      text += `msgctxt "${escapePoText(first.context)}"\n`
    text += formatPoString('msgid', first.source.split('\n'))
    text += 'msgstr ""\n'
  }
  return text
}

export interface ParsedPoEntry {
  context?: string
  source: string
  translation: string
  /** `#:` reference addresses – empty for foreign PO, which falls back to matching. */
  addresses: string[]
  isFuzzy: boolean
}

/** Inverse of `escapePoText`; any escape beyond the exported three aborts. */
export function unescapePoText(text: string): string {
  let result = ''
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (char !== '\\') {
      result += char
      continue
    }
    const escaped = text[index + 1]
    if (escaped === 'n')
      result += '\n'
    else if (escaped === '"')
      result += '"'
    else if (escaped === '\\')
      result += '\\'
    else
      throw new LcfError(`unsupported escape "\\${escaped ?? ''}" – only \\\\, \\n and \\" are allowed`)
    index++
  }
  return result
}

/** Reads the quoted payload of a keyword or continuation line, escapes left intact. */
function extractQuotedSegment(line: string): string {
  const firstQuote = line.indexOf('"')
  const lastQuote = line.lastIndexOf('"')
  if (firstQuote === -1 || lastQuote === firstQuote)
    throw new LcfError(`malformed PO string line: ${line}`)
  return line.slice(firstQuote + 1, lastQuote)
}

/**
 * Parses a PO catalog into entries. Isomorphic by construction. Concatenates
 * continuation segments verbatim before unescaping, so structural `\n` escapes
 * remain the only source of newlines. The header block and obsolete/previous
 * comment lines are ignored; plural forms and unknown escapes abort with a reason.
 */
export function parsePoCatalog(text: string): ParsedPoEntry[] {
  const entries: ParsedPoEntry[] = []
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)

  let addresses: string[] = []
  let isFuzzy = false
  let contextSegments: string[] | undefined
  let sourceSegments: string[] | undefined
  let translationSegments: string[] | undefined
  let activeKeyword: 'msgctxt' | 'msgid' | 'msgstr' | undefined

  function resetEntry(): void {
    addresses = []
    isFuzzy = false
    contextSegments = undefined
    sourceSegments = undefined
    translationSegments = undefined
    activeKeyword = undefined
  }

  function commitEntry(): void {
    if (sourceSegments !== undefined) {
      const source = unescapePoText(sourceSegments.join(''))
      // An empty msgid is the header (or a stray blank entry) – never a text unit.
      if (source !== '') {
        if (translationSegments === undefined)
          throw new LcfError(`malformed PO entry: msgid without msgstr near ${source}`)
        const translation = unescapePoText(translationSegments.join(''))
        entries.push({
          context: contextSegments === undefined ? undefined : unescapePoText(contextSegments.join('')),
          source,
          translation,
          addresses,
          isFuzzy,
        })
      }
    }
    resetEntry()
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '') {
      commitEntry()
      continue
    }
    if (line.startsWith('#')) {
      // A comment after a finished value starts a new entry.
      if (translationSegments !== undefined)
        commitEntry()
      activeKeyword = undefined
      if (line.startsWith('#:')) {
        for (const token of line.slice(2).trim().split(/\s+/)) {
          if (token !== '')
            addresses.push(token)
        }
      }
      else if (line.startsWith('#,')) {
        if (line.slice(2).split(',').map(flag => flag.trim()).includes('fuzzy'))
          isFuzzy = true
      }
      continue
    }
    if (line.startsWith('"')) {
      if (activeKeyword === undefined)
        throw new LcfError(`unexpected PO continuation line without a keyword: ${line}`)
      const segment = extractQuotedSegment(line)
      if (activeKeyword === 'msgctxt')
        contextSegments!.push(segment)
      else if (activeKeyword === 'msgid')
        sourceSegments!.push(segment)
      else
        translationSegments!.push(segment)
      continue
    }
    if (line.startsWith('msgid_plural') || /^msgstr\s*\[/.test(line))
      throw new LcfError('plural forms are not supported')
    if (line.startsWith('msgctxt')) {
      if (contextSegments !== undefined || sourceSegments !== undefined)
        commitEntry()
      contextSegments = [extractQuotedSegment(line)]
      activeKeyword = 'msgctxt'
    }
    else if (line.startsWith('msgid')) {
      if (sourceSegments !== undefined)
        commitEntry()
      sourceSegments = [extractQuotedSegment(line)]
      activeKeyword = 'msgid'
    }
    else if (line.startsWith('msgstr')) {
      if (sourceSegments === undefined)
        throw new LcfError(`msgstr without a preceding msgid: ${line}`)
      translationSegments = [extractQuotedSegment(line)]
      activeKeyword = 'msgstr'
    }
    else {
      throw new LcfError(`unexpected line in PO catalog: ${line}`)
    }
  }
  commitEntry()
  return entries
}
