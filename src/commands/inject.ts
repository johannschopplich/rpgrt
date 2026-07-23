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

/** Reads and parses one PO catalog, wrapping parse aborts with the filename. */
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
    // The dump's metadata rides in through the flag slot – report it as its own
    // source so the CLI never claims a flag the user did not pass.
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

  const dirtyFileNames = new Set(plan.applications.map(({ collected }) => collected.fileName))
  const codecOptions = { engine: game.engine, transcoder: game.transcoder }
  const pendingWrites: { filePath: string, tempPath: string, bytes: Uint8Array }[] = []
  for (const fileName of [...dirtyFileNames].sort()) {
    let bytes: Uint8Array
    if (fileName === game.databaseFileName)
      bytes = encodeDatabase(game.database, codecOptions)
    else if (fileName === game.treeMapFileName)
      bytes = encodeTreeMap(game.treeMap!, codecOptions)
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
