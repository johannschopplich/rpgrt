import type { Database, EngineVersion, MapUnit, Transcoder, TreeMap } from '../index.ts'
import type { CatalogContext } from '../translation/po.ts'
import type { CollectedUnit } from '../translation/units.ts'
import type { ResolvedEncoding, ResolvedEngine } from './resolve.ts'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { LcfError } from '../codec/errors.ts'
import { createTranscoder } from '../encoding.ts'
import { decodeDatabase, decodeMapTree, decodeMapUnit } from '../index.ts'
import { collectDatabaseUnits, collectMapUnits, collectTreeMapUnits } from '../translation/units.ts'
import { resolveEncoding, resolveEngine } from './resolve.ts'

export interface LoadedMap {
  fileName: string
  mapId: number
  mapUnit: MapUnit
}

export interface LoadedGame {
  directory: string
  engine: EngineVersion
  engineSource: ResolvedEngine['engineSource']
  encoding: string
  encodingSource: ResolvedEncoding['encodingSource']
  transcoder: Transcoder
  databaseFileName: string
  database: Database
  treeMapFileName?: string
  treeMap?: TreeMap
  maps: LoadedMap[]
  /** .lmu files without a MapNNNN name – they have no addressable map ID. */
  skippedFileNames: string[]
}

export interface GameLoadOptions {
  engine?: string
  encoding?: string
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

export function loadGame(directory: string, options: GameLoadOptions = {}): LoadedGame {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory())
    throw new LcfError(`Not a directory: ${directory}`)
  const entryNames = readdirSync(directory)
  const databaseFileName = entryNames.find(name => name.toLowerCase() === 'rpg_rt.ldb')
  if (databaseFileName === undefined)
    throw new LcfError(`No RPG_RT.ldb in ${directory} – not an RPG Maker game directory`)

  const databasePath = join(directory, databaseFileName)
  const databaseBytes = new Uint8Array(readFileSync(databasePath))
  const { engine, engineSource } = resolveEngine(databasePath, databaseBytes, 'ldb', options.engine)
  const { encoding, encodingSource } = resolveEncoding(databasePath, databaseBytes, 'ldb', engine, options.encoding)
  const transcoder = createTranscoder(encoding)
  const codecOptions = { engine, transcoder }

  const database = decodeDatabase(databaseBytes, codecOptions)

  const treeMapFileName = entryNames.find(name => name.toLowerCase() === 'rpg_rt.lmt')
  const treeMap = treeMapFileName === undefined
    ? undefined
    : decodeMapTree(new Uint8Array(readFileSync(join(directory, treeMapFileName))), codecOptions)

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
      mapUnit: decodeMapUnit(new Uint8Array(readFileSync(join(directory, fileName))), codecOptions),
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
