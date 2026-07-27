import type { Database, MapUnit } from '../src/index.ts'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { convertFile } from '../src/commands/convert.ts'
import { extractGame } from '../src/commands/extract.ts'
import { encodeDatabase, encodeMapUnit } from '../src/index.ts'

const temporaryDirectories: string[] = []

function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'rpgrt-commands-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  while (temporaryDirectories.length > 0)
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

function writeMap(directory: string): string {
  const mapPath = join(directory, 'Map0001.lmu')
  writeFileSync(mapPath, encodeMapUnit(defaultRecord('MapUnit', '2k') as unknown as MapUnit, { engine: '2k' }))
  return mapPath
}

describe('cli argument rejection', () => {
  const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

  function runCli(...argv: string[]): { status: number | null, stderr: string } {
    return spawnSync(process.execPath, [cliPath, ...argv], { encoding: 'utf8' })
  }

  it('rejects an unknown flag', () => {
    const result = runCli('convert', 'file.lmu', '--nope')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unknown argument(s): --nope')
  })

  it('rejects surplus positionals', () => {
    const result = runCli('convert', 'a.lmu', 'b.lmu')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('"b.lmu"')
  })
})

describe('convert overwrite guards', () => {
  it('refuses to overwrite an existing JSON output without force', () => {
    const directory = createDirectory()
    const mapPath = writeMap(directory)
    convertFile(mapPath)
    expect(() => convertFile(mapPath)).toThrow('already exists – pass --force to overwrite')
    expect(() => convertFile(mapPath, { isForce: true })).not.toThrow()
  })

  it('backs an existing LCF target up as .rpgrt-bak when converting back', () => {
    const directory = createDirectory()
    const mapPath = writeMap(directory)
    const originalBytes = readFileSync(mapPath)
    convertFile(mapPath)
    const result = convertFile(`${mapPath}.json`)
    expect(result.outputPath).toBe(mapPath)
    expect(result.backupPath).toBe(`${mapPath}.rpgrt-bak`)
    expect(readFileSync(`${mapPath}.rpgrt-bak`)).toEqual(originalBytes)
    expect(readFileSync(mapPath)).toEqual(originalBytes)
  })

  it('reports no backup when the target is new', () => {
    const directory = createDirectory()
    const mapPath = writeMap(directory)
    convertFile(mapPath)
    const result = convertFile(`${mapPath}.json`, { output: join(directory, 'fresh.lmu') })
    expect(result.backupPath).toBeUndefined()
  })
})

describe('convert json validation', () => {
  it('rejects a malformed _unknown chunk', () => {
    const directory = createDirectory()
    const mapPath = writeMap(directory)
    convertFile(mapPath)
    const envelope = JSON.parse(readFileSync(`${mapPath}.json`, 'utf8')) as { data: Record<string, unknown> }
    envelope.data._unknown = [{ id: 'not-a-number', bytes: 42 }]
    writeFileSync(`${mapPath}.json`, JSON.stringify(envelope))
    expect(() => convertFile(`${mapPath}.json`)).toThrow('Malformed _unknown chunk')
  })

  it('rejects a non-numeric beforeId on an _unknown chunk', () => {
    const directory = createDirectory()
    const mapPath = writeMap(directory)
    convertFile(mapPath)
    const envelope = JSON.parse(readFileSync(`${mapPath}.json`, 'utf8')) as { data: Record<string, unknown> }
    envelope.data._unknown = [{ id: 0x63, bytes: 'AQI=', beforeId: 'x' }]
    writeFileSync(`${mapPath}.json`, JSON.stringify(envelope))
    expect(() => convertFile(`${mapPath}.json`)).toThrow('Malformed _unknown chunk')
  })
})

describe('extract overwrite guard', () => {
  it('refuses existing outputs without force and names them', () => {
    const directory = createDirectory()
    writeFileSync(join(directory, 'RPG_RT.ldb'), encodeDatabase(defaultRecord('Database', '2k') as unknown as Database, { engine: '2k' }))
    const outputPath = join(directory, 'strings.json')
    writeFileSync(outputPath, '{}')
    expect(() => extractGame(directory, { output: outputPath })).toThrow(`pass --force to overwrite: ${outputPath}`)
    expect(() => extractGame(directory, { output: outputPath, isForce: true })).not.toThrow()
  })
})
