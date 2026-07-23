import type { ArgsDef, CommandDef } from 'citty'
import type { CollectedUnit, Dump, DumpUnit } from '../translation/units.ts'
import type { LoadedGame } from './game.ts'
import { readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { defineCommand } from 'citty'
import { LcfError } from '../codec/errors.ts'
import { encodeDatabase, encodeMapTree, encodeMapUnit } from '../index.ts'
import { planInjection } from '../translation/inject.ts'
import { parsePoCatalog } from '../translation/po.ts'
import { poCatalogs } from './extract.ts'
import { collectGameUnits, loadGame } from './game.ts'

export interface InjectOptions {
  engine?: string
  encoding?: string
}

export interface InjectResult {
  appliedCount: number
  untranslatedCount: number
  /** `#, fuzzy` entries skipped as untranslated (PO input only). */
  fuzzySkippedCount: number
  writtenFileNames: string[]
  engine: LoadedGame['engine']
  encoding: string
}

type DumpSource
  = | { format: 'json', filePaths: string[] }
    | { format: 'po', filePaths: string[] }

/** Auto-detects the dump format by extension; a directory mixing both aborts. */
function classifyDumpSource(dumpPath: string): DumpSource {
  const stats = statSync(dumpPath, { throwIfNoEntry: false })
  if (stats === undefined)
    throw new LcfError(`No such file or directory: ${dumpPath}`)
  if (!stats.isDirectory()) {
    const lowerName = dumpPath.toLowerCase()
    if (lowerName.endsWith('.po'))
      return { format: 'po', filePaths: [dumpPath] }
    if (lowerName.endsWith('.json'))
      return { format: 'json', filePaths: [dumpPath] }
    throw new LcfError(`${dumpPath} is neither a .po nor a .json dump`)
  }
  const entryNames = readdirSync(dumpPath).sort()
  const poFilePaths = entryNames.filter(name => name.toLowerCase().endsWith('.po')).map(name => join(dumpPath, name))
  const jsonFilePaths = entryNames.filter(name => name.toLowerCase().endsWith('.json')).map(name => join(dumpPath, name))
  if (poFilePaths.length > 0 && jsonFilePaths.length > 0)
    throw new LcfError(`${dumpPath} mixes .po and .json dumps – inject one format at a time`)
  if (poFilePaths.length > 0)
    return { format: 'po', filePaths: poFilePaths }
  if (jsonFilePaths.length > 0)
    return { format: 'json', filePaths: jsonFilePaths }
  throw new LcfError(`No .po or .json dumps in ${dumpPath}`)
}

function readJsonDumps(filePaths: string[], dumpPath: string): Dump[] {
  const dumps = filePaths.map((filePath) => {
    const dump = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<Dump>
    const hasValidShape = (dump.engine === '2k' || dump.engine === '2k3')
      && typeof dump.encoding === 'string' && Array.isArray(dump.units)
    if (!hasValidShape)
      throw new LcfError(`${filePath} is not an lcfkit dump (expected engine, encoding, and units keys)`)
    return dump as Dump
  })
  for (const dump of dumps) {
    if (dump.engine !== dumps[0]!.engine || dump.encoding !== dumps[0]!.encoding)
      throw new LcfError(`Dumps in ${dumpPath} disagree on engine or encoding (${dumps[0]!.engine}/${dumps[0]!.encoding} vs ${dump.engine}/${dump.encoding}) – re-extract them together`)
  }
  return dumps
}

/** Runtime page splits/merges – incompatible with lcfkit's static line-wise injection. */
const MAGIC_PAGE_TOKENS = ['<easyrpg:new_page>', '<easyrpg:delete_page>']

interface PoDumpResult {
  units: DumpUnit[]
  fuzzySkippedCount: number
  untranslatedCount: number
  abortReasons: string[]
}

/**
 * Turns PO catalogs into dump units keyed by game address. Each entry resolves
 * to addresses by its `#:` references, or – for foreign PO without them – by
 * exact `(msgctxt, source)` matching scoped to the catalog filename, fanning the
 * translation out to every matching address. Identical (address, translation)
 * pairs collapse; a conflicting one aborts, guarding the non-idempotent splice.
 */
function readPoDumps(filePaths: string[], collectedUnits: CollectedUnit[], game: LoadedGame): PoDumpResult {
  const catalogs = poCatalogs(collectedUnits, game)
  const abortReasons: string[] = []
  const emittedByAddress = new Map<string, DumpUnit>()
  let fuzzySkippedCount = 0
  let untranslatedCount = 0

  for (const filePath of filePaths) {
    const fileName = basename(filePath)
    let entries
    try {
      entries = parsePoCatalog(readFileSync(filePath, 'utf8'))
    }
    catch (error) {
      if (error instanceof LcfError)
        throw new LcfError(`${fileName}: ${error.rawMessage}`)
      throw error
    }

    const scopeUnitsByKey = new Map<string, CollectedUnit[]>()
    for (const unit of catalogs.get(fileName) ?? []) {
      const key = `${unit.context ?? ''}\x01${unit.source}`
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
        if (entry.translation !== '')
          fuzzySkippedCount++
        continue
      }
      if (entry.translation === '') {
        // A merged entry stands for every occurrence – count remaining work in
        // game units, mirroring the JSON path's per-unit count.
        untranslatedCount += entry.addresses.length > 0
          ? entry.addresses.length
          : (scopeUnitsByKey.get(`${context ?? ''}\x01${entry.source}`)?.length ?? 1)
        continue
      }
      // Checked only for entries that would be applied – fuzzy or untranslated
      // entries with a stray token stay a non-fatal skip.
      const magicToken = MAGIC_PAGE_TOKENS.find(token => entry.translation.includes(token))
      if (magicToken !== undefined) {
        abortReasons.push(`${fileName}: runtime page-manipulation token ${magicToken} is not supported by static injection`)
        continue
      }
      let addresses: string[]
      if (entry.addresses.length > 0) {
        addresses = entry.addresses
      }
      else {
        const matches = scopeUnitsByKey.get(`${context ?? ''}\x01${entry.source}`)
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

export function injectDump(directory: string, dumpPath: string, options: InjectOptions = {}): InjectResult {
  const source = classifyDumpSource(dumpPath)

  let game: LoadedGame
  let dumpUnits: DumpUnit[]
  let untranslatedCount = 0
  let fuzzySkippedCount = 0
  let extraAbortReasons: string[]
  if (source.format === 'po') {
    // PO carries no engine/encoding, and fallback matching needs the collected
    // units, so the game must load before parsing.
    game = loadGame(directory, { engine: options.engine, encoding: options.encoding })
    const collectedUnits = collectGameUnits(game)
    const poDumps = readPoDumps(source.filePaths, collectedUnits, game)
    dumpUnits = poDumps.units
    untranslatedCount = poDumps.untranslatedCount
    fuzzySkippedCount = poDumps.fuzzySkippedCount
    extraAbortReasons = poDumps.abortReasons
  }
  else {
    const dumps = readJsonDumps(source.filePaths, dumpPath)
    game = loadGame(directory, {
      engine: options.engine ?? dumps[0]!.engine,
      encoding: options.encoding ?? dumps[0]!.encoding,
    })
    dumpUnits = dumps.flatMap(dump => dump.units)
    fuzzySkippedCount = 0
    extraAbortReasons = []
  }

  const plan = planInjection(collectGameUnits(game), dumpUnits, {
    transcoder: game.transcoder,
    encoding: game.encoding,
  })
  if (source.format === 'json')
    untranslatedCount = plan.untranslatedCount

  const abortReasons = [...extraAbortReasons, ...plan.abortReasons]
  if (abortReasons.length > 0) {
    const shownAbortReasons = abortReasons.slice(0, 20)
    if (abortReasons.length > shownAbortReasons.length)
      shownAbortReasons.push(`… and ${abortReasons.length - shownAbortReasons.length} more`)
    throw new LcfError(`Nothing was written – ${abortReasons.length} translation(s) failed validation:\n${shownAbortReasons.join('\n')}`)
  }

  for (const { collected, lines } of plan.applications)
    collected.applyTranslation(lines)

  const dirtyFileNames = new Set(plan.applications.map(({ collected }) => collected.fileName))
  const codecOptions = { engine: game.engine, transcoder: game.transcoder }
  const pendingWrites: { filePath: string, tempPath: string, bytes: Uint8Array }[] = []
  for (const fileName of [...dirtyFileNames].sort()) {
    let bytes: Uint8Array
    if (fileName === game.databaseFileName)
      bytes = encodeDatabase(game.database, codecOptions)
    else if (fileName === game.treeMapFileName)
      bytes = encodeMapTree(game.treeMap!, codecOptions)
    else
      bytes = encodeMapUnit(game.maps.find(map => map.fileName === fileName)!.mapUnit, codecOptions)
    const filePath = join(directory, fileName)
    pendingWrites.push({ filePath, tempPath: `${filePath}.lcfkit-tmp`, bytes })
  }
  // Two-phase write: stage every payload beside its target (same volume), then
  // swap them in with atomic renames – a mid-batch error can truncate a staged
  // temp file but never a game file.
  try {
    for (const { tempPath, bytes } of pendingWrites)
      writeFileSync(tempPath, bytes)
    for (const { filePath, tempPath } of pendingWrites)
      renameSync(tempPath, filePath)
  }
  catch (error) {
    for (const { tempPath } of pendingWrites)
      rmSync(tempPath, { force: true })
    throw error
  }

  return {
    appliedCount: plan.applications.length,
    untranslatedCount,
    fuzzySkippedCount,
    writtenFileNames: [...dirtyFileNames].sort(),
    engine: game.engine,
    encoding: game.encoding,
  }
}

export interface InjectArgs extends ArgsDef {
  game: { type: 'positional', description: string, required: true }
  dump: { type: 'positional', description: string, required: true }
  engine: { type: 'string', description: string }
  encoding: { type: 'string', description: string }
}

const injectArgs: InjectArgs = {
  game: { type: 'positional', description: 'Path to the game directory (contains RPG_RT.ldb)', required: true },
  dump: { type: 'positional', description: 'strings.json, a .po catalog, or a directory of split dumps', required: true },
  engine: { type: 'string', description: 'Engine version: 2k or 2k3 (overrides the dump metadata)' },
  encoding: { type: 'string', description: 'Text encoding (overrides the dump metadata)' },
}

export const injectCommand: CommandDef<InjectArgs> = defineCommand({
  meta: {
    name: 'inject',
    description: 'Write translated text units from a dump back into the game files',
  },
  args: injectArgs,
  run({ args }) {
    const result = injectDump(args.game, args.dump, { engine: args.engine, encoding: args.encoding })
    const fuzzyNote = result.fuzzySkippedCount > 0 ? `, ${result.fuzzySkippedCount} fuzzy entr${result.fuzzySkippedCount === 1 ? 'y' : 'ies'} skipped` : ''
    console.error(`${result.appliedCount} translation(s) applied, ${result.untranslatedCount} unit(s) still untranslated${fuzzyNote}`)
    console.error(`  engine ${result.engine}, encoding ${result.encoding}`)
    console.error(result.writtenFileNames.length === 0
      ? '  no files written'
      : `  wrote ${result.writtenFileNames.join(', ')}`)
  },
})
