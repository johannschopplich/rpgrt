import type { Transcoder } from '../codec/transcoder.ts'
import type { CatalogContext, ParsedPoEntry } from './po.ts'
import type { CollectedUnit, DumpUnit } from './units.ts'
import { LcfError } from '../codec/errors.ts'
import { fallbackMatchKey, poCatalogs } from './po.ts'

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
 * resolves to addresses by its `#:` references, or – for foreign PO without them
 * – by exact `(msgctxt, source)` matching scoped to the catalog filename, fanning
 * the translation out to every matching address. Identical (address, translation)
 * pairs collapse; a conflicting one aborts, guarding the non-idempotent splice.
 */
export function resolvePoDumps(catalogs: ParsedCatalog[], collectedUnits: CollectedUnit[], catalogContext: CatalogContext): PoResolution {
  const scopeUnitsByFileName = poCatalogs(collectedUnits, catalogContext)
  const abortReasons: string[] = []
  const emittedByAddress = new Map<string, DumpUnit>()
  let fuzzySkippedCount = 0
  let untranslatedCount = 0

  for (const { fileName, entries } of catalogs) {
    const scopeUnitsByKey = new Map<string, CollectedUnit[]>()
    for (const unit of scopeUnitsByFileName.get(fileName) ?? []) {
      const key = fallbackMatchKey(unit.context, unit.source)
      const bucket = scopeUnitsByKey.get(key)
      if (bucket === undefined)
        scopeUnitsByKey.set(key, [unit])
      else
        bucket.push(unit)
    }

    for (const entry of entries) {
      // A foreign catalog may write msgctxt "" where lcfkit units carry no context.
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

/** Injection is all-or-nothing: apply nothing when abortReasons is non-empty. */
export interface InjectionPlan {
  applications: InjectionApplication[]
  abortReasons: string[]
  untranslatedCount: number
}

/** Magic page tokens drive runtime page splits/merges – no static injection can honor them. */
const MAGIC_PAGE_TOKENS = ['<easyrpg:new_page>', '<easyrpg:delete_page>']

function validateTranslation(unit: DumpUnit, collected: CollectedUnit, context: InjectionContext): string | undefined {
  // Only entries that would be applied reach here – fuzzy (skipped in inject) and
  // untranslated (skipped in planInjection) units keep their non-fatal skip, so the
  // magic-token abort below never fires on them.
  const magicToken = MAGIC_PAGE_TOKENS.find(token => unit.translation.includes(token))
  if (magicToken !== undefined)
    return `${unit.address}: runtime page-manipulation token ${magicToken} is not supported by static injection`
  if (unit.source !== collected.source)
    return `${unit.address}: source text differs from the game – the dump is stale, re-extract and merge`
  const lines = unit.translation.split('\n')
  if (collected.expectedLineCount !== undefined && lines.length !== collected.expectedLineCount)
    return `${unit.address}: translation has ${lines.length} lines but exactly ${collected.expectedLineCount} required`
  for (const line of lines) {
    if (context.transcoder.decode(context.transcoder.encode(line)) !== line)
      return `${unit.address}: translation is not representable in ${context.encoding}`
  }
  return undefined
}

export function planInjection(collectedUnits: CollectedUnit[], dumpUnits: DumpUnit[], context: InjectionContext): InjectionPlan {
  const unitsByAddress = new Map<string, CollectedUnit>()
  for (const collected of collectedUnits) {
    if (unitsByAddress.has(collected.address))
      throw new LcfError(`Duplicate unit address ${collected.address} – this is a bug in lcfkit`)
    unitsByAddress.set(collected.address, collected)
  }

  const abortReasons: string[] = []
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
    const abortReason = validateTranslation(unit, collected, context)
    if (abortReason !== undefined)
      abortReasons.push(abortReason)
    else
      applications.push({ collected, lines: unit.translation.split('\n') })
  }
  return { applications, abortReasons, untranslatedCount }
}
