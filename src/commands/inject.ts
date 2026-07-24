import type { ArgsDef, CommandDef } from 'citty'
import type { ParsedCatalog } from '../translation/inject.ts'
import type { CollectedUnit, Dump, DumpUnit } from '../translation/units.ts'
import type { LoadedGame } from './game.ts'
import type { EncodingSource, EngineSource } from './resolve.ts'
import { readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { defineCommand } from 'citty'
import { LcfError } from '../codec/errors.ts'
import { encodeDatabase, encodeMapUnit, encodeTreeMap } from '../index.ts'
import { planInjection, resolvePoDumps } from '../translation/inject.ts'
import { parsePoCatalog } from '../translation/po.ts'
import { collectGameUnits, loadGame, toCatalogContext } from './game.ts'
import { describeFileContext } from './resolve.ts'

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
  engineSource: EngineSource
  encoding: string
  encodingSource: EncodingSource
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
    const jsonText = readFileSync(filePath, 'utf8')
    let parsedValue: unknown
    try {
      parsedValue = JSON.parse(jsonText)
    }
    catch (error) {
      throw new LcfError(`${filePath} is not valid JSON: ${(error as Error).message}`)
    }
    const dump = parsedValue as Partial<Dump>
    const hasValidShape = (dump.engine === '2k' || dump.engine === '2k3')
      && typeof dump.encoding === 'string' && Array.isArray(dump.units)
    if (!hasValidShape)
      throw new LcfError(`${filePath} is not an rpgrt dump (expected engine, encoding, and units keys)`)
    return dump as Dump
  })
  for (const dump of dumps) {
    if (dump.engine !== dumps[0]!.engine || dump.encoding !== dumps[0]!.encoding)
      throw new LcfError(`Dumps in ${dumpPath} disagree on engine or encoding (${dumps[0]!.engine}/${dumps[0]!.encoding} vs ${dump.engine}/${dump.encoding}) – re-extract them together`)
  }
  return dumps
}

function parsePoCatalogFile(filePath: string): ParsedCatalog {
  const fileName = basename(filePath)
  try {
    return { fileName, entries: parsePoCatalog(readFileSync(filePath, 'utf8')) }
  }
  catch (error) {
    if (error instanceof LcfError)
      throw new LcfError(`${fileName}: ${error.rawMessage}`)
    throw error
  }
}

export function injectDump(directory: string, dumpPath: string, options: InjectOptions = {}): InjectResult {
  const source = classifyDumpSource(dumpPath)

  let game: LoadedGame
  let collectedUnits: CollectedUnit[]
  let dumpUnits: DumpUnit[]
  let untranslatedCount = 0
  let fuzzySkippedCount = 0
  let extraAbortReasons: string[]
  let engineSource: EngineSource
  let encodingSource: EncodingSource
  if (source.format === 'po') {
    // PO carries no engine/encoding, and fallback matching needs the collected
    // units, so the game must load before parsing.
    game = loadGame(directory, { engine: options.engine, encoding: options.encoding })
    engineSource = game.engineSource
    encodingSource = game.encodingSource
    collectedUnits = collectGameUnits(game)
    const parsedCatalogs = source.filePaths.map(parsePoCatalogFile)
    const resolution = resolvePoDumps(parsedCatalogs, collectedUnits, toCatalogContext(game))
    dumpUnits = resolution.units
    untranslatedCount = resolution.untranslatedCount
    fuzzySkippedCount = resolution.fuzzySkippedCount
    extraAbortReasons = resolution.abortReasons
  }
  else {
    const dumps = readJsonDumps(source.filePaths, dumpPath)
    game = loadGame(directory, {
      engine: options.engine ?? dumps[0]!.engine,
      encoding: options.encoding ?? dumps[0]!.encoding,
    })
    // The dump's engine/encoding were passed through the flag slot above, so the
    // game's source reads `flag` – re-derive it as `dump` instead.
    engineSource = options.engine !== undefined ? game.engineSource : 'dump'
    encodingSource = options.encoding !== undefined ? game.encodingSource : 'dump'
    collectedUnits = collectGameUnits(game)
    dumpUnits = dumps.flatMap(dump => dump.units)
    fuzzySkippedCount = 0
    extraAbortReasons = []
  }

  const plan = planInjection(collectedUnits, dumpUnits, {
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

  const dirtyFileNames = [...new Set(plan.applications.map(({ collected }) => collected.fileName))].sort()
  const codecOptions = { engine: game.engine, transcoder: game.transcoder }
  const pendingWrites: { filePath: string, tempPath: string, backupPath: string, bytes: Uint8Array }[] = []
  for (const fileName of dirtyFileNames) {
    let bytes: Uint8Array
    if (fileName === game.databaseFileName)
      bytes = encodeDatabase(game.database, codecOptions)
    else if (fileName === game.treeMapFileName)
      bytes = encodeTreeMap(game.treeMap!, codecOptions)
    else
      bytes = encodeMapUnit(game.maps.find(map => map.fileName === fileName)!.mapUnit, codecOptions)
    const filePath = join(directory, fileName)
    pendingWrites.push({ filePath, tempPath: `${filePath}.rpgrt-tmp`, backupPath: `${filePath}.rpgrt-bak`, bytes })
  }
  // Temps are staged beside their targets so every rename stays on one volume
  // and is atomic. Crash or power loss between renames remains out of scope.
  // Only files whose original made it into a backup need (or may) be restored –
  // probing the filesystem instead would mistake a stray occupant of the backup
  // path for a backup.
  const backedUpWrites: typeof pendingWrites = []
  try {
    for (const { tempPath, bytes } of pendingWrites)
      writeFileSync(tempPath, bytes)
    for (const pendingWrite of pendingWrites) {
      renameSync(pendingWrite.filePath, pendingWrite.backupPath)
      backedUpWrites.push(pendingWrite)
      renameSync(pendingWrite.tempPath, pendingWrite.filePath)
    }
    for (const { backupPath } of backedUpWrites)
      rmSync(backupPath, { force: true })
  }
  catch (error) {
    const unrestoredFileNames: string[] = []
    for (const { filePath, backupPath } of backedUpWrites) {
      try {
        renameSync(backupPath, filePath)
      }
      catch {
        unrestoredFileNames.push(basename(filePath))
      }
    }
    for (const { tempPath } of pendingWrites)
      rmSync(tempPath, { force: true })
    if (unrestoredFileNames.length > 0)
      throw new LcfError(`Writing failed and rollback left ${unrestoredFileNames.join(', ')} unrestored – recover them from their .rpgrt-bak siblings. Original error: ${(error as Error).message}`)
    throw new LcfError(`Nothing was written – the write phase failed and every file was restored: ${(error as Error).message}`)
  }

  return {
    appliedCount: plan.applications.length,
    untranslatedCount,
    fuzzySkippedCount,
    writtenFileNames: dirtyFileNames,
    engine: game.engine,
    engineSource,
    encoding: game.encoding,
    encodingSource,
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
    console.error(`  ${describeFileContext(result)}`)
    console.error(result.writtenFileNames.length === 0
      ? '  no files written'
      : `  wrote ${result.writtenFileNames.join(', ')}`)
  },
})
