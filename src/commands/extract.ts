import type { ArgsDef, CommandDef } from 'citty'
import type { EngineVersion, WarningSink } from '../index.ts'
import type { CollectedUnit, Dump, DumpUnit } from '../translation/units.ts'
import type { LoadedGame } from './game.ts'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { defineCommand } from 'citty'
import { LcfError } from '../codec/errors.ts'
import { formatPoCatalog, poCatalogs } from '../translation/po.ts'
import { collectGameUnits, loadGame, toCatalogContext } from './game.ts'
import { describeFileContext, flagHints } from './resolve.ts'

export type { Dump, DumpUnit } from '../translation/units.ts'

export interface ExtractOptions {
  output?: string
  isSplit?: boolean
  isPo?: boolean
  engine?: string
  encoding?: string
  /** Overwrite existing output files. */
  isForce?: boolean
  onWarning?: WarningSink
}

/** All-or-nothing: refuse before the first byte is written, naming every conflict. */
function assertOutputsWritable(outputPaths: string[], isForce: boolean | undefined): void {
  if (isForce === true)
    return
  const existingPaths = outputPaths.filter(outputPath => existsSync(outputPath))
  if (existingPaths.length > 0)
    throw new LcfError(`Output already exists – pass --force to overwrite: ${existingPaths.join(', ')}`)
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

export function extractGame(directory: string, options: ExtractOptions = {}): ExtractResult {
  if (options.isSplit === true && options.isPo === true)
    throw new LcfError('--split and --po are mutually exclusive – PO output is always per file')

  const game = loadGame(directory, { ...flagHints(options.engine, options.encoding), onWarning: options.onWarning })
  const units = collectGameUnits(game)
  const outputPaths: string[] = []

  if (options.isPo === true) {
    const outputDirectory = options.output ?? 'po'
    const projectName = basename(directory)
    const catalogs = poCatalogs(units, toCatalogContext(game))
    assertOutputsWritable([...catalogs.keys()].map(catalogFileName => join(outputDirectory, catalogFileName)), options.isForce)
    mkdirSync(outputDirectory, { recursive: true })
    for (const [catalogFileName, catalogUnits] of catalogs) {
      const outputPath = join(outputDirectory, catalogFileName)
      writeFileSync(outputPath, formatPoCatalog(catalogUnits, projectName))
      outputPaths.push(outputPath)
    }
  }
  else if (options.isSplit === true) {
    const outputDirectory = options.output ?? 'strings'
    const fileNames = [...new Set(units.map(unit => unit.fileName))]
    assertOutputsWritable(fileNames.map(fileName => join(outputDirectory, `${fileName}.json`)), options.isForce)
    mkdirSync(outputDirectory, { recursive: true })
    for (const fileName of fileNames) {
      const outputPath = join(outputDirectory, `${fileName}.json`)
      writeDump(outputPath, game.engine, game.encoding, units.filter(unit => unit.fileName === fileName).map(toDumpUnit))
      outputPaths.push(outputPath)
    }
  }
  else {
    const outputPath = options.output ?? 'strings.json'
    assertOutputsWritable([outputPath], options.isForce)
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
  force: { type: 'boolean', description: string }
}

const extractArgs: ExtractArgs = {
  game: { type: 'positional', description: 'Path to the game directory (contains RPG_RT.ldb)', required: true },
  output: { type: 'string', alias: 'o', description: 'Output path (strings.json, or a directory for --split/--po)' },
  split: { type: 'boolean', description: 'Write one JSON file per game file instead of a single strings.json' },
  po: { type: 'boolean', description: 'Write lcftrans-compatible PO catalogs instead of JSON' },
  engine: { type: 'string', description: 'Engine version: 2k or 2k3 (overrides detection)' },
  encoding: { type: 'string', description: 'Text encoding, e.g. Shift_JIS or 1252 (overrides detection)' },
  force: { type: 'boolean', description: 'Overwrite existing output files' },
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
      isForce: args.force,
      onWarning: message => console.error(`Warning: ${message}`),
    })
    console.error(`${result.unitCount} text units → ${result.outputPaths.length === 1 ? result.outputPaths[0] : `${result.outputPaths.length} files`}`)
    console.error(`  ${describeFileContext(result)}`)
    for (const skippedFileName of result.skippedFileNames)
      console.error(`  skipped ${skippedFileName} – no MapNNNN name, so its units have no stable address`)
  },
})
