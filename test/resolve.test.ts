import type { Database, MapUnit, Save } from '../src/index.ts'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { flagHints, resolveFileContext } from '../src/commands/resolve.ts'
import { createTranscoder } from '../src/encoding.ts'
import { encodeDatabase, encodeMapUnit, encodeSave } from '../src/index.ts'

const temporaryDirectories: string[] = []

function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'rpgrt-resolve-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  while (temporaryDirectories.length > 0)
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

function database2k3Bytes(): Uint8Array {
  return encodeDatabase(defaultRecord('Database', '2k3') as unknown as Database, { engine: '2k3' })
}

function map2kBytes(): Uint8Array {
  return encodeMapUnit(defaultRecord('MapUnit', '2k') as unknown as MapUnit, { engine: '2k' })
}

function japaneseDatabaseBytes(): Uint8Array {
  const database = defaultRecord('Database', '2k') as unknown as Database
  database.system = { ...database.system, titleName: 'こんにちは、日本語のテキストサンプルです' }
  database.terms = { ...database.terms, attack: '攻撃', defense: '防御', level: 'レベル' }
  return encodeDatabase(database, { engine: '2k', transcoder: createTranscoder('cp932') })
}

function saveBytesWithCodepage(codepage: number): Uint8Array {
  const save = defaultRecord('Save', '2k3') as unknown as Save
  save.easyrpgData = { ...save.easyrpgData, codepage }
  return encodeSave(save, { engine: '2k3' })
}

describe('engine resolution', () => {
  it('lets the flag hint win over a sibling database', () => {
    const directory = createDirectory()
    const bytes = database2k3Bytes()
    writeFileSync(join(directory, 'RPG_RT.ldb'), bytes)
    const context = resolveFileContext(join(directory, 'RPG_RT.ldb'), bytes, 'ldb', flagHints('2k'))
    expect(context).toMatchObject({ engine: '2k', engineSource: 'flag' })
  })

  it('scans the database ahead of a round-trip probe', () => {
    const directory = createDirectory()
    const bytes = database2k3Bytes()
    const context = resolveFileContext(join(directory, 'RPG_RT.ldb'), bytes, 'ldb')
    expect(context).toMatchObject({ engine: '2k3', engineSource: 'database' })
  })

  it('identifies a lone 2k map by re-encoding when no database is present', () => {
    const directory = createDirectory()
    const context = resolveFileContext(join(directory, 'Map0001.lmu'), map2kBytes(), 'lmu')
    expect(context).toMatchObject({ engine: '2k', engineSource: 'roundTrip' })
  })

  it('falls back to 2k3 when nothing decides', () => {
    const directory = createDirectory()
    const context = resolveFileContext(join(directory, 'Map0001.lmu'), new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]), 'lmu')
    expect(context).toMatchObject({ engine: '2k3', engineSource: 'fallback' })
  })

  it('rejects an unknown engine hint', () => {
    const directory = createDirectory()
    expect(() => resolveFileContext(join(directory, 'Map0001.lmu'), map2kBytes(), 'lmu', flagHints('sega'))).toThrow('Unknown engine')
  })
})

describe('encoding resolution', () => {
  it('lets the flag hint win over an ini hint and validates it', () => {
    const directory = createDirectory()
    writeFileSync(join(directory, 'RPG_RT.ini'), '[EasyRPG]\nEncoding=932\n')
    const context = resolveFileContext(join(directory, 'RPG_RT.ldb'), database2k3Bytes(), 'ldb', flagHints(undefined, 'cp1252'))
    expect(context).toMatchObject({ encoding: 'cp1252', encodingSource: 'flag' })
  })

  it('rejects an unknown encoding hint', () => {
    const directory = createDirectory()
    expect(() => resolveFileContext(join(directory, 'RPG_RT.ldb'), database2k3Bytes(), 'ldb', flagHints(undefined, 'not-an-encoding'))).toThrow('Unknown encoding')
  })

  it('prefers the ini hint over detection', () => {
    const directory = createDirectory()
    writeFileSync(join(directory, 'RPG_RT.ini'), '[EasyRPG]\nEncoding=1252\n')
    const context = resolveFileContext(join(directory, 'RPG_RT.ldb'), japaneseDatabaseBytes(), 'ldb')
    expect(context).toMatchObject({ encoding: 'cp1252', encodingSource: 'ini' })
  })

  it('detects the encoding from the database sample', () => {
    const directory = createDirectory()
    const context = resolveFileContext(join(directory, 'RPG_RT.ldb'), japaneseDatabaseBytes(), 'ldb')
    expect(context).toMatchObject({ encoding: 'cp932', encodingSource: 'detected' })
  })

  it('falls back to windows-1252 with a warning when nothing decides', () => {
    // A default map carries no strings at all, so the detection sample is empty.
    const directory = createDirectory()
    const warnings: string[] = []
    const context = resolveFileContext(join(directory, 'Map0001.lmu'), map2kBytes(), 'lmu', { onWarning: message => warnings.push(message) })
    expect(context).toMatchObject({ encoding: 'windows-1252', encodingSource: 'fallback' })
    expect(warnings).toContainEqual(expect.stringContaining('windows-1252'))
  })

  it('prefers the codepage an EasyRPG save carries over every non-flag rung', () => {
    const directory = createDirectory()
    writeFileSync(join(directory, 'RPG_RT.ini'), '[EasyRPG]\nEncoding=1252\n')
    const context = resolveFileContext(join(directory, 'Save01.lsd'), saveBytesWithCodepage(932), 'lsd')
    expect(context).toMatchObject({ encoding: 'cp932', encodingSource: 'save' })
  })

  it('warns on an unknown save codepage and falls through to the ini hint', () => {
    const directory = createDirectory()
    writeFileSync(join(directory, 'RPG_RT.ini'), '[EasyRPG]\nEncoding=1252\n')
    const warnings: string[] = []
    const context = resolveFileContext(join(directory, 'Save01.lsd'), saveBytesWithCodepage(65533), 'lsd', { onWarning: message => warnings.push(message) })
    expect(context).toMatchObject({ encoding: 'cp1252', encodingSource: 'ini' })
    expect(warnings).toContainEqual(expect.stringContaining('unknown codepage 65533'))
  })
})
