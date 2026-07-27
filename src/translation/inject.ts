import type { Transcoder } from '../codec/transcoder.ts'
import type { CatalogContext, ParsedPoEntry } from './po.ts'
import type { CollectedUnit, DumpUnit } from './units.ts'
import { LcfError } from '../codec/errors.ts'
import { fallbackMatchKey, poCatalogs } from './po.ts'
import { collectControlCodes } from './units.ts'

/** One parsed PO catalog; its `fileName` doubles as the scope key for fallback matching. */
export interface ParsedCatalog {
  fileName: string
  entries: ParsedPoEntry[]
}

export interface PoResolution {
  units: DumpUnit[]
  fuzzySkippedCount: number
  untranslatedCount: number
  abortReasons: string[]
}

/**
 * Turns parsed PO catalogs into dump units keyed by game address. Each entry
 * resolves to addresses by its `#:` references, or – for foreign PO without
 * them – by exact `(msgctxt, source)` matching scoped to the catalog filename,
 * fanning the translation out to every matching address. Identical (address,
 * translation) pairs collapse; a conflicting one aborts, guarding the
 * non-idempotent splice.
 */
export function resolvePoDumps<T extends Pick<CollectedUnit, 'address' | 'source' | 'context' | 'catalog' | 'fileName'>>(catalogs: ParsedCatalog[], collectedUnits: T[], catalogContext: CatalogContext): PoResolution {
  const scopeUnitsByFileName = poCatalogs(collectedUnits, catalogContext)
  const abortReasons: string[] = []
  const emittedByAddress = new Map<string, DumpUnit>()
  let fuzzySkippedCount = 0
  let untranslatedCount = 0

  for (const { fileName, entries } of catalogs) {
    const scopeUnitsByKey = new Map<string, T[]>()
    for (const unit of scopeUnitsByFileName.get(fileName) ?? []) {
      const key = fallbackMatchKey(unit.context, unit.source)
      const bucket = scopeUnitsByKey.get(key)
      if (bucket === undefined)
        scopeUnitsByKey.set(key, [unit])
      else
        bucket.push(unit)
    }

    for (const entry of entries) {
      // A foreign catalog may write msgctxt "" where rpgrt units carry no context.
      const context = entry.context === '' ? undefined : entry.context
      if (entry.isFuzzy) {
        fuzzySkippedCount++
        continue
      }
      if (entry.translation === '') {
        // A merged entry stands for every occurrence – count remaining work in
        // game units, mirroring the JSON path's per-unit count.
        untranslatedCount += entry.addresses.length > 0
          ? entry.addresses.length
          : (scopeUnitsByKey.get(fallbackMatchKey(context, entry.source))?.length ?? 1)
        continue
      }
      let addresses: string[]
      if (entry.addresses.length > 0) {
        addresses = entry.addresses
      }
      else {
        const matches = scopeUnitsByKey.get(fallbackMatchKey(context, entry.source))
        if (matches === undefined) {
          abortReasons.push(`${fileName}: no game text matches msgctxt=${context ?? '(none)'} msgid=${JSON.stringify(entry.source)}`)
          continue
        }
        addresses = matches.map(unit => unit.address)
      }
      for (const address of addresses) {
        const existing = emittedByAddress.get(address)
        if (existing === undefined)
          emittedByAddress.set(address, { address, source: entry.source, translation: entry.translation, context, info: [] })
        else if (existing.translation !== entry.translation)
          abortReasons.push(`${fileName}: address ${address} received conflicting translations`)
      }
    }
  }
  return { units: [...emittedByAddress.values()], fuzzySkippedCount, untranslatedCount, abortReasons }
}

export interface InjectionContext {
  transcoder: Transcoder
  /** Only labels the not-representable abort reason. */
  encoding: string
}

export interface InjectionApplication {
  collected: CollectedUnit
  lines: string[]
}

/** Injection is all-or-nothing: apply nothing when `abortReasons` is non-empty. */
export interface InjectionPlan {
  applications: InjectionApplication[]
  abortReasons: string[]
  warnings: string[]
  untranslatedCount: number
}

/** Magic page tokens drive runtime page splits/merges – no static injection can honor them. */
const MAGIC_PAGE_TOKENS = ['<easyrpg:new_page>', '<easyrpg:delete_page>']

/** Multiset comparison – control codes may move with the translation's word order. */
function controlCodeDifference(gameSource: string, translation: string): string | undefined {
  const remainingCodes = new Map<string, number>()
  for (const code of collectControlCodes(gameSource))
    remainingCodes.set(code, (remainingCodes.get(code) ?? 0) + 1)
  const addedCodes: string[] = []
  for (const code of collectControlCodes(translation)) {
    const count = remainingCodes.get(code) ?? 0
    if (count > 1)
      remainingCodes.set(code, count - 1)
    else if (count === 1)
      remainingCodes.delete(code)
    else
      addedCodes.push(code)
  }
  if (remainingCodes.size === 0 && addedCodes.length === 0)
    return undefined
  const differenceDescriptions: string[] = []
  if (remainingCodes.size > 0)
    differenceDescriptions.push(`missing ${[...remainingCodes.keys()].join(' ')}`)
  if (addedCodes.length > 0)
    differenceDescriptions.push(`added ${addedCodes.join(' ')}`)
  return differenceDescriptions.join(', ')
}

interface TranslationValidation {
  abortReason?: string
  warning?: string
}

function validateTranslation(unit: DumpUnit, collected: CollectedUnit, context: InjectionContext): TranslationValidation {
  // Only entries that would be applied reach here – fuzzy (skipped in
  // `resolvePoDumps`) and untranslated (skipped in `planInjection`) units keep
  // their non-fatal skip, so the magic-token abort below never fires on them.
  const magicToken = MAGIC_PAGE_TOKENS.find(token => unit.translation.includes(token))
  if (magicToken !== undefined)
    return { abortReason: `${unit.address}: runtime page-manipulation token ${magicToken} is not supported by static injection` }
  const lines = unit.translation.split('\n')
  if (collected.expectedLineCount !== undefined && lines.length !== collected.expectedLineCount) {
    // e.g. "Choice (2 options)" – a merged PO entry can fan out to occurrences
    // with different line-count rules; name the one that failed.
    const unitKind = collected.info.length > 1 ? ` – ${collected.info[collected.info.length - 1]}` : ''
    return { abortReason: `${unit.address}: translation has ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} but exactly ${collected.expectedLineCount} required${unitKind}` }
  }
  const codeDifference = controlCodeDifference(collected.source, unit.translation)
  if (codeDifference !== undefined)
    return { abortReason: `${unit.address}: translation changes control codes (${codeDifference}) – mark the entry fuzzy to skip it` }
  for (const line of lines) {
    if (context.transcoder.decode(context.transcoder.encode(line)) !== line)
      return { abortReason: `${unit.address}: translation is not representable in ${context.encoding}` }
  }
  // The reference address is the primary key, so an edited msgid or a drifted
  // game must not abort – but silent divergence would hide a stale dump.
  if (unit.source !== collected.source)
    return { warning: `${unit.address}: source text differs from the game – applying anyway; re-extract and merge if this is unexpected` }
  return {}
}

export function planInjection(collectedUnits: CollectedUnit[], dumpUnits: DumpUnit[], context: InjectionContext): InjectionPlan {
  const unitsByAddress = new Map<string, CollectedUnit>()
  for (const collected of collectedUnits) {
    if (unitsByAddress.has(collected.address))
      throw new LcfError(`Duplicate unit address ${collected.address} – this is a bug in rpgrt`)
    unitsByAddress.set(collected.address, collected)
  }

  const abortReasons: string[] = []
  const warnings: string[] = []
  const applications: InjectionApplication[] = []
  let untranslatedCount = 0
  for (const unit of dumpUnits) {
    if (unit.translation === undefined || unit.translation === '') {
      untranslatedCount++
      continue
    }
    const collected = unitsByAddress.get(unit.address)
    if (collected === undefined) {
      abortReasons.push(`${unit.address}: no such unit in the game`)
      continue
    }
    const validation = validateTranslation(unit, collected, context)
    if (validation.warning !== undefined)
      warnings.push(validation.warning)
    if (validation.abortReason !== undefined)
      abortReasons.push(validation.abortReason)
    else
      applications.push({ collected, lines: unit.translation.split('\n') })
  }
  return { applications, abortReasons, warnings, untranslatedCount }
}
