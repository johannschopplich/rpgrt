import type { Dump } from '../src/commands/extract.ts'
import type { EngineVersion } from '../src/index.ts'
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractGame } from '../src/commands/extract.ts'
import { injectDump } from '../src/commands/inject.ts'
import { reencode } from './reencode.ts'
import { useTemporaryDirectories } from './utils.ts'

const createDirectory = useTemporaryDirectories()

const corpusDirectory = join(import.meta.dirname, 'corpus')
const gameNames = existsSync(corpusDirectory)
  ? readdirSync(corpusDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  : []

function firstDifference(expectedBytes: Uint8Array, actualBytes: Uint8Array): number {
  const shorter = Math.min(expectedBytes.length, actualBytes.length)
  for (let index = 0; index < shorter; index++) {
    if (expectedBytes[index] !== actualBytes[index])
      return index
  }
  return expectedBytes.length === actualBytes.length ? -1 : shorter
}

// Corpus games that name their engine are held to it – trying both would let
// a regression in one engine hide behind the other happening to round-trip.
function knownEngines(gameName: string): EngineVersion[] {
  if (/2000/.test(gameName))
    return ['2k']
  if (/2003|maniac/i.test(gameName))
    return ['2k3']
  return ['2k', '2k3']
}

describe.skipIf(gameNames.length === 0)('corpus byte identity', () => {
  for (const gameName of gameNames) {
    const gameDirectory = join(corpusDirectory, gameName)
    const fileNames = readdirSync(gameDirectory)
      .filter(name => /\.(?:lmu|ldb|lmt|lsd)$/i.test(name))
      .sort()

    describe(gameName, () => {
      it.each(fileNames)('%s', (fileName) => {
        const bytes = new Uint8Array(readFileSync(join(gameDirectory, fileName)))
        const failures: string[] = []
        for (const engine of knownEngines(gameName)) {
          let encodedBytes: Uint8Array
          try {
            encodedBytes = reencode(bytes, fileName, engine)
          }
          catch (error) {
            failures.push(`${engine}: ${(error as Error).message}`)
            continue
          }
          const differenceOffset = firstDifference(bytes, encodedBytes)
          if (differenceOffset === -1)
            return
          failures.push(`${engine}: first difference at byte ${differenceOffset} (source ${bytes.length} bytes, encoded ${encodedBytes.length})`)
        }
        expect.fail(failures.join('\n'))
      })
    })
  }
})

const testGame2000Directory = join(corpusDirectory, 'TestGame-2000')

// RPG_RT 2000 v1.61+ writes the database version chunk, which must not read as 2k3.
describe.skipIf(!existsSync(testGame2000Directory))('corpus engine detection', () => {
  it('detects an RPG Maker 2000 v1.61+ game as 2k and injects without growing its database', () => {
    const gameDirectory = createDirectory()
    for (const fileName of readdirSync(testGame2000Directory).filter(name => /\.(?:lmu|ldb|lmt|ini)$/i.test(name)))
      copyFileSync(join(testGame2000Directory, fileName), join(gameDirectory, fileName))
    const databasePath = join(gameDirectory, 'RPG_RT.ldb')
    const databaseSize = statSync(databasePath).size

    const dumpPath = join(createDirectory(), 'strings.json')
    expect(extractGame(gameDirectory, { output: dumpPath })).toMatchObject({ engine: '2k', engineSource: 'database' })

    const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as Dump
    const unit = dump.units.find(entry => entry.address === 'ldb/actors/1/name')!
    unit.translation = [...unit.source].reverse().join('')
    writeFileSync(dumpPath, JSON.stringify(dump))

    expect(injectDump(gameDirectory, dumpPath).writtenFileNames).toEqual(['RPG_RT.ldb'])
    expect(statSync(databasePath).size).toBe(databaseSize)
  })
})
