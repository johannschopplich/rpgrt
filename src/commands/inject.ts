import type { ArgsDef, CommandDef } from 'citty'
import type { CollectedUnit } from '../translation/units.ts'
import type { Dump, DumpUnit } from './extract.ts'
import type { LoadedGame } from './game.ts'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineCommand } from 'citty'
import { LcfError } from '../codec/errors.ts'
import { encodeDatabase, encodeMapTree, encodeMapUnit } from '../index.ts'
import { collectGameUnits } from './extract.ts'
import { loadGame } from './game.ts'

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

function validateTranslation(unit: DumpUnit, collected: CollectedUnit, game: LoadedGame): string | undefined {
  if (unit.source !== collected.source)
    return `${unit.address}: source text differs from the game – the dump is stale, re-extract and merge`
  const lines = unit.translation.split('\n')
  if (collected.expectedLineCount !== undefined && lines.length !== collected.expectedLineCount)
    return `${unit.address}: translation has ${lines.length} lines but exactly ${collected.expectedLineCount} required`
  for (const line of lines) {
    if (game.transcoder.decode(game.transcoder.encode(line)) !== line)
      return `${unit.address}: translation is not representable in ${game.encoding}`
  }
  return undefined
}

export function injectDump(directory: string, dumpPath: string, options: InjectOptions = {}): InjectResult {
  const dumps = readDumps(dumpPath)
  const engine = options.engine ?? dumps[0]!.engine
  const encoding = options.encoding ?? dumps[0]!.encoding
  const game = loadGame(directory, { engine, encoding })

  const unitsByAddress = new Map<string, CollectedUnit>()
  for (const collected of collectGameUnits(game)) {
    if (unitsByAddress.has(collected.address))
      throw new LcfError(`Duplicate unit address ${collected.address} – this is a bug in lcfkit`)
    unitsByAddress.set(collected.address, collected)
  }

  const abortReasons: string[] = []
  const applications: { collected: CollectedUnit, lines: string[] }[] = []
  let untranslatedCount = 0
  for (const dump of dumps) {
    for (const unit of dump.units) {
      if (unit.translation === undefined || unit.translation === '') {
        untranslatedCount++
        continue
      }
      const collected = unitsByAddress.get(unit.address)
      if (collected === undefined) {
        abortReasons.push(`${unit.address}: no such unit in the game`)
        continue
      }
      const abortReason = validateTranslation(unit, collected, game)
      if (abortReason !== undefined)
        abortReasons.push(abortReason)
      else
        applications.push({ collected, lines: unit.translation.split('\n') })
    }
  }
  if (abortReasons.length > 0) {
    const shownAbortReasons = abortReasons.slice(0, 20)
    if (abortReasons.length > shownAbortReasons.length)
      shownAbortReasons.push(`… and ${abortReasons.length - shownAbortReasons.length} more`)
    throw new LcfError(`Nothing was written – ${abortReasons.length} translation(s) failed validation:\n${shownAbortReasons.join('\n')}`)
  }

  // Splices shift the indices of everything behind them, so command-backed
  // units are applied back to front within each command list.
  applications.sort((a, b) => (b.collected.startIndex ?? 0) - (a.collected.startIndex ?? 0))
  for (const { collected, lines } of applications)
    collected.applyTranslation(lines)

  const dirtyFileNames = new Set(applications.map(({ collected }) => collected.fileName))
  const codecOptions = { engine: game.engine, transcoder: game.transcoder }
  const pendingWrites: { filePath: string, bytes: Uint8Array }[] = []
  for (const fileName of [...dirtyFileNames].sort()) {
    let bytes: Uint8Array
    if (fileName === game.databaseFileName)
      bytes = encodeDatabase(game.database, codecOptions)
    else if (fileName === game.treeMapFileName)
      bytes = encodeMapTree(game.treeMap!, codecOptions)
    else
      bytes = encodeMapUnit(game.maps.find(map => map.fileName === fileName)!.mapUnit, codecOptions)
    pendingWrites.push({ filePath: join(directory, fileName), bytes })
  }
  for (const { filePath, bytes } of pendingWrites)
    writeFileSync(filePath, bytes)

  return {
    appliedCount: applications.length,
    untranslatedCount,
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
