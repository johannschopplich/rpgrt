import type { ArgsDef, CommandDef } from 'citty'
import type { Dump } from '../translation/units.ts'
import type { LoadedGame } from './game.ts'
import { readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineCommand } from 'citty'
import { LcfError } from '../codec/errors.ts'
import { encodeDatabase, encodeMapTree, encodeMapUnit } from '../index.ts'
import { planInjection } from '../translation/inject.ts'
import { collectGameUnits, loadGame } from './game.ts'

export interface InjectOptions {
  engine?: string
  encoding?: string
}

export interface InjectResult {
  appliedCount: number
  untranslatedCount: number
  writtenFileNames: string[]
  engine: LoadedGame['engine']
  encoding: string
}

function readDumps(dumpPath: string): Dump[] {
  const stats = statSync(dumpPath, { throwIfNoEntry: false })
  if (stats === undefined)
    throw new LcfError(`No such file or directory: ${dumpPath}`)
  const filePaths = stats.isDirectory()
    ? readdirSync(dumpPath).filter(name => name.toLowerCase().endsWith('.json')).sort().map(name => join(dumpPath, name))
    : [dumpPath]
  if (filePaths.length === 0)
    throw new LcfError(`No .json dumps in ${dumpPath}`)
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

export function injectDump(directory: string, dumpPath: string, options: InjectOptions = {}): InjectResult {
  const dumps = readDumps(dumpPath)
  const engine = options.engine ?? dumps[0]!.engine
  const encoding = options.encoding ?? dumps[0]!.encoding
  const game = loadGame(directory, { engine, encoding })

  const plan = planInjection(collectGameUnits(game), dumps.flatMap(dump => dump.units), {
    transcoder: game.transcoder,
    encoding: game.encoding,
  })
  if (plan.abortReasons.length > 0) {
    const shownAbortReasons = plan.abortReasons.slice(0, 20)
    if (plan.abortReasons.length > shownAbortReasons.length)
      shownAbortReasons.push(`… and ${plan.abortReasons.length - shownAbortReasons.length} more`)
    throw new LcfError(`Nothing was written – ${plan.abortReasons.length} translation(s) failed validation:\n${shownAbortReasons.join('\n')}`)
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
    untranslatedCount: plan.untranslatedCount,
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
  dump: { type: 'positional', description: 'strings.json, or a directory of split dumps', required: true },
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
    console.error(`${result.appliedCount} translation(s) applied, ${result.untranslatedCount} unit(s) still untranslated`)
    console.error(`  engine ${result.engine}, encoding ${result.encoding}`)
    console.error(result.writtenFileNames.length === 0
      ? '  no files written'
      : `  wrote ${result.writtenFileNames.join(', ')}`)
  },
})
