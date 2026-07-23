import type { ArgsDef, CommandDef } from 'citty'
import type { EngineVersion } from '../index.ts'
import type { CollectedUnit, Dump, DumpUnit } from '../translation/units.ts'
import type { LoadedGame } from './game.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { defineCommand } from 'citty'
import { LcfError } from '../codec/errors.ts'
import { formatPoCatalog } from '../translation/po.ts'
import { collectGameUnits, loadGame } from './game.ts'

export type { Dump, DumpUnit } from '../translation/units.ts'

export interface ExtractOptions {
  output?: string
  isSplit?: boolean
  isPo?: boolean
  engine?: string
  encoding?: string
}

export interface ExtractResult {
  outputPaths: string[]
  unitCount: number
  engine: EngineVersion
  engineSource: LoadedGame['engineSource']
  encoding: string
  encodingSource: LoadedGame['encodingSource']
  skippedFileNames: string[]
}

function toDumpUnit(unit: CollectedUnit): DumpUnit {
  return {
    address: unit.address,
    source: unit.source,
    translation: '',
    context: unit.context,
    info: unit.info,
  }
}

function writeDump(filePath: string, engine: EngineVersion, encoding: string, units: DumpUnit[]): void {
  const dump: Dump = { engine, encoding, units }
  writeFileSync(filePath, `${JSON.stringify(dump, undefined, 2)}\n`)
}

/** PO catalogs follow lcftrans's naming so its tooling and EasyRPG Player match up. */
export function poCatalogs(units: CollectedUnit[], game: LoadedGame): Map<string, CollectedUnit[]> {
  const catalogs = new Map<string, CollectedUnit[]>([
    [`${game.databaseFileName}.po`, units.filter(unit => unit.catalog === 'terms')],
    [`${game.databaseFileName}.common.po`, units.filter(unit => unit.catalog === 'common')],
    [`${game.databaseFileName}.battle.po`, units.filter(unit => unit.catalog === 'battle')],
  ])
  const treeMapUnits = units.filter(unit => unit.catalog === 'lmt')
  if (treeMapUnits.length > 0)
    catalogs.set(`${game.treeMapFileName}.po`, treeMapUnits)
  for (const map of game.maps) {
    const mapUnits = units.filter(unit => unit.fileName === map.fileName)
    if (mapUnits.length > 0)
      catalogs.set(`${map.fileName.replace(/\.lmu$/i, '')}.po`, mapUnits)
  }
  return catalogs
}

export function extractGame(directory: string, options: ExtractOptions = {}): ExtractResult {
  if (options.isSplit === true && options.isPo === true)
    throw new LcfError('--split and --po are mutually exclusive – PO output is always per file')

  const game = loadGame(directory, { engine: options.engine, encoding: options.encoding })
  const units = collectGameUnits(game)
  const outputPaths: string[] = []

  if (options.isPo === true) {
    const outputDirectory = options.output ?? 'po'
    mkdirSync(outputDirectory, { recursive: true })
    const projectName = basename(directory)
    for (const [catalogFileName, catalogUnits] of poCatalogs(units, game)) {
      const outputPath = join(outputDirectory, catalogFileName)
      writeFileSync(outputPath, formatPoCatalog(catalogUnits, projectName))
      outputPaths.push(outputPath)
    }
  }
  else if (options.isSplit === true) {
    const outputDirectory = options.output ?? 'strings'
    mkdirSync(outputDirectory, { recursive: true })
    const fileNames = [...new Set(units.map(unit => unit.fileName))]
    for (const fileName of fileNames) {
      const outputPath = join(outputDirectory, `${fileName}.json`)
      writeDump(outputPath, game.engine, game.encoding, units.filter(unit => unit.fileName === fileName).map(toDumpUnit))
      outputPaths.push(outputPath)
    }
  }
  else {
    const outputPath = options.output ?? 'strings.json'
    writeDump(outputPath, game.engine, game.encoding, units.map(toDumpUnit))
    outputPaths.push(outputPath)
  }

  return {
    outputPaths,
    unitCount: units.length,
    engine: game.engine,
    engineSource: game.engineSource,
    encoding: game.encoding,
    encodingSource: game.encodingSource,
    skippedFileNames: game.skippedFileNames,
  }
}

export interface ExtractArgs extends ArgsDef {
  game: { type: 'positional', description: string, required: true }
  output: { type: 'string', alias: string, description: string }
  split: { type: 'boolean', description: string }
  po: { type: 'boolean', description: string }
  engine: { type: 'string', description: string }
  encoding: { type: 'string', description: string }
}

const extractArgs: ExtractArgs = {
  game: { type: 'positional', description: 'Path to the game directory (contains RPG_RT.ldb)', required: true },
  output: { type: 'string', alias: 'o', description: 'Output path (strings.json, or a directory for --split/--po)' },
  split: { type: 'boolean', description: 'Write one JSON file per game file instead of a single strings.json' },
  po: { type: 'boolean', description: 'Write lcftrans-compatible PO catalogs instead of JSON' },
  engine: { type: 'string', description: 'Engine version: 2k or 2k3 (overrides detection)' },
  encoding: { type: 'string', description: 'Text encoding, e.g. Shift_JIS or 1252 (overrides detection)' },
}

export const extractCommand: CommandDef<ExtractArgs> = defineCommand({
  meta: {
    name: 'extract',
    description: 'Extract all translatable text of a game into a dump (JSON, or PO via --po)',
  },
  args: extractArgs,
  run({ args }) {
    const result = extractGame(args.game, {
      output: args.output,
      isSplit: args.split,
      isPo: args.po,
      engine: args.engine,
      encoding: args.encoding,
    })
    console.error(`${result.unitCount} text units → ${result.outputPaths.length === 1 ? result.outputPaths[0] : `${result.outputPaths.length} files`}`)
    console.error(`  engine ${result.engine}, encoding ${result.encoding}`)
    for (const skippedFileName of result.skippedFileNames)
      console.error(`  skipped ${skippedFileName} – no MapNNNN name, so its units have no stable address`)
  },
})
