import type { Transcoder } from '../codec/transcoder.ts'
import type { CollectedUnit, DumpUnit } from './units.ts'
import { LcfError } from '../codec/errors.ts'

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
