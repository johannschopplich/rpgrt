import type { Database, MapUnit } from '../src/index.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertFile } from '../src/commands/convert.ts'
import { extractGame } from '../src/commands/extract.ts'
import { defaultRecord, encodeDatabase, encodeMapUnit } from '../src/index.ts'
import { useTemporaryDirectories } from './utils.ts'

const createDirectory = useTemporaryDirectories()

function writeMap(directory: string): string {
  const mapPath = join(directory, 'Map0001.lmu')
  writeFileSync(mapPath, encodeMapUnit(defaultRecord('MapUnit', '2k') as unknown as MapUnit, { engine: '2k' }))
  return mapPath
}

describe('convert overwrite guards', () => {
  it('rejects an existing JSON output unless --force is passed', () => {
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

describe('extract overwrite guards', () => {
  it('rejects an existing output unless --force is passed, naming it', () => {
    const directory = createDirectory()
    writeFileSync(join(directory, 'RPG_RT.ldb'), encodeDatabase(defaultRecord('Database', '2k') as unknown as Database, { engine: '2k' }))
    const outputPath = join(directory, 'strings.json')
    writeFileSync(outputPath, '{}')
    expect(() => extractGame(directory, { output: outputPath })).toThrow(`pass --force to overwrite: ${outputPath}`)
    expect(() => extractGame(directory, { output: outputPath, isForce: true })).not.toThrow()
  })
})
