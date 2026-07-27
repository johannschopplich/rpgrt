import type { Database, EngineVersion, MapUnit, Transcoder, TreeMap } from '../index.ts'
import type { CatalogContext } from '../translation/po.ts'
import type { CollectedUnit } from '../translation/units.ts'
import type { EncodingSource, EngineSource, ResolveInputs } from './resolve.ts'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { LcfError } from '../codec/errors.ts'
import { createTranscoder } from '../encoding.ts'
import { decodeDatabase, decodeMapUnit, decodeTreeMap } from '../index.ts'
import { collectDatabaseUnits, collectMapUnits, collectTreeMapUnits } from '../translation/units.ts'
import { resolveFileContext } from './resolve.ts'

export interface LoadedMap {
  fileName: string
  mapId: number
  mapUnit: MapUnit
}

export interface LoadedGame {
  directory: string
  engine: EngineVersion
  engineSource: EngineSource
  encoding: string
  encodingSource: EncodingSource
  transcoder: Transcoder
  databaseFileName: string
  database: Database
  treeMapFileName?: string
  treeMap?: TreeMap
  maps: LoadedMap[]
  /** .lmu files without a MapNNNN name – they have no addressable map ID. */
  skippedFileNames: string[]
}

/** Codec errors name their file – a 50-map game must say which map is corrupt. */
export function withFileContext<T>(fileName: string, run: () => T): T {
  try {
    return run()
  }
  catch (error) {
    if (error instanceof LcfError)
      throw new LcfError(`${fileName}: ${error.rawMessage}`, { path: error.path, offset: error.offset })
    throw error
  }
}

export function toCatalogContext(game: LoadedGame): CatalogContext {
  return {
    databaseFileName: game.databaseFileName,
    treeMapFileName: game.treeMapFileName,
    mapFileNames: game.maps.map(map => map.fileName),
  }
}

export function collectGameUnits(game: LoadedGame): CollectedUnit[] {
  const units = collectDatabaseUnits(game.database, game.databaseFileName)
  if (game.treeMap !== undefined)
    units.push(...collectTreeMapUnits(game.treeMap, game.treeMapFileName!))
  for (const map of game.maps)
    units.push(...collectMapUnits(map.mapUnit, map.mapId, map.fileName))
  return units
}

export function loadGame(directory: string, inputs: ResolveInputs = {}): LoadedGame {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory())
    throw new LcfError(`Not a directory: ${directory}`)
  const entryNames = readdirSync(directory)
  const databaseFileName = entryNames.find(name => name.toLowerCase() === 'rpg_rt.ldb')
  if (databaseFileName === undefined)
    throw new LcfError(`No RPG_RT.ldb in ${directory} – not an RPG Maker game directory`)

  const databasePath = join(directory, databaseFileName)
  const databaseBytes = new Uint8Array(readFileSync(databasePath))
  // Resolution warnings concern the database the context is derived from.
  const { engine, engineSource, encoding, encodingSource } = resolveFileContext(databasePath, databaseBytes, 'ldb', {
    ...inputs,
    onWarning: message => inputs.onWarning?.(`${databaseFileName}: ${message}`),
  })
  const transcoder = createTranscoder(encoding)
  const codecOptionsFor = (fileName: string): Parameters<typeof decodeDatabase>[1] => ({
    engine,
    transcoder,
    onWarning: message => inputs.onWarning?.(`${fileName}: ${message}`),
  })

  const database = withFileContext(databaseFileName, () => decodeDatabase(databaseBytes, codecOptionsFor(databaseFileName)))

  const treeMapFileName = entryNames.find(name => name.toLowerCase() === 'rpg_rt.lmt')
  const treeMap = treeMapFileName === undefined
    ? undefined
    : withFileContext(treeMapFileName, () => decodeTreeMap(new Uint8Array(readFileSync(join(directory, treeMapFileName))), codecOptionsFor(treeMapFileName)))

  const maps: LoadedMap[] = []
  const skippedFileNames: string[] = []
  for (const fileName of entryNames.filter(name => name.toLowerCase().endsWith('.lmu')).sort()) {
    const mapIdText = basename(fileName).match(/^map(\d+)\.lmu$/i)?.[1]
    if (mapIdText === undefined) {
      skippedFileNames.push(fileName)
      continue
    }
    maps.push({
      fileName,
      mapId: Number.parseInt(mapIdText, 10),
      mapUnit: withFileContext(fileName, () => decodeMapUnit(new Uint8Array(readFileSync(join(directory, fileName))), codecOptionsFor(fileName))),
    })
  }

  return {
    directory,
    engine,
    engineSource,
    encoding,
    encodingSource,
    transcoder,
    databaseFileName,
    database,
    treeMapFileName,
    treeMap,
    maps,
    skippedFileNames,
  }
}
