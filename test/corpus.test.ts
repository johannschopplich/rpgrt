import type { EngineVersion } from '../src/index.ts'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodeDatabase, decodeMapTree, decodeMapUnit, decodeSave, encodeDatabase, encodeMapTree, encodeMapUnit, encodeSave } from '../src/index.ts'

// Real game files, never committed – the suite skips itself when absent.
const corpusDirectory = fileURLToPath(new URL('corpus', import.meta.url))
const gameNames = existsSync(corpusDirectory)
  ? readdirSync(corpusDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  : []

function reencode(bytes: Uint8Array, fileName: string, engine: EngineVersion): Uint8Array {
  const options = { engine }
  if (fileName.toLowerCase().endsWith('.lmu'))
    return encodeMapUnit(decodeMapUnit(bytes, options), options)
  if (fileName.toLowerCase().endsWith('.ldb'))
    return encodeDatabase(decodeDatabase(bytes, options), options)
  if (fileName.toLowerCase().endsWith('.lsd'))
    return encodeSave(decodeSave(bytes, options), options)
  return encodeMapTree(decodeMapTree(bytes, options), options)
}

function firstDifference(expected: Uint8Array, actual: Uint8Array): number {
  const shorter = Math.min(expected.length, actual.length)
  for (let index = 0; index < shorter; index++) {
    if (expected[index] !== actual[index])
      return index
  }
  return expected.length === actual.length ? -1 : shorter
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
        for (const engine of ['2k', '2k3'] as const) {
          let encoded: Uint8Array
          try {
            encoded = reencode(bytes, fileName, engine)
          }
          catch (error) {
            failures.push(`${engine}: ${(error as Error).message}`)
            continue
          }
          const difference = firstDifference(bytes, encoded)
          if (difference === -1)
            return
          failures.push(`${engine}: first difference at byte ${difference} (source ${bytes.length} bytes, encoded ${encoded.length})`)
        }
        expect.fail(failures.join('\n'))
      })
    })
  }
})
