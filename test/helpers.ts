import type { EngineVersion } from '../src/index.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { decodeLcfFile, encodeLcfFile, lcfFormatFor } from '../src/codec/formats.ts'

/** Decodes and re-encodes a file's bytes, dispatching the codec by extension. */
export function reencode(bytes: Uint8Array, fileName: string, engine: EngineVersion): Uint8Array {
  const format = lcfFormatFor(fileName)!
  const options = { engine }
  return encodeLcfFile(decodeLcfFile<object>(bytes, format, options), format, options)
}

/**
 * Returns a temp-directory factory and registers the cleanup – call at the top
 * level of a test file so the `afterEach` lands in that file's suite.
 */
export function useTemporaryDirectories(): () => string {
  const temporaryDirectories: string[] = []
  afterEach(() => {
    while (temporaryDirectories.length > 0)
      rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
  })
  return () => {
    const directory = mkdtempSync(join(tmpdir(), 'rpgrt-test-'))
    temporaryDirectories.push(directory)
    return directory
  }
}
