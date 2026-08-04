import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json' with { type: 'json' }
import { defaultRecord, encodeMapUnit } from '../src/index.ts'
import { runCliProcess, useTemporaryDirectories } from './utils.ts'

const createDirectory = useTemporaryDirectories()

// In-process runs observe neither citty's builtin flags, which `runMain` owns,
// nor the exit code the shell sees.
describe('rpgrt CLI as a child process', () => {
  it('prints its version', async () => {
    const { stdout, exitCode } = await runCliProcess(['--version'])

    expect(stdout).toBe(`${packageJson.version}\n`)
    expect(exitCode).toBe(0)
  })

  it('converts a map and exits successfully', async () => {
    const directory = createDirectory()
    const mapPath = join(directory, 'Map0001.lmu')
    writeFileSync(mapPath, encodeMapUnit(defaultRecord('MapUnit', '2k') as never, { engine: '2k' }))

    const { exitCode } = await runCliProcess(['convert', mapPath], { cwd: directory })

    expect(exitCode).toBe(0)
  })

  it('exits with a failure status for a missing input', async () => {
    const directory = createDirectory()

    const { stdout, stderr, exitCode } = await runCliProcess(['convert', 'missing.lmu'], { cwd: directory })

    expect(exitCode).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('missing.lmu')
  })
})
