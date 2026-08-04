import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeFilesAtomically } from '../src/commands/atomic-write.ts'
import { useTemporaryDirectories } from './utils.ts'

const createDirectory = useTemporaryDirectories()

describe('writeFilesAtomically', () => {
  it('replaces existing files and removes the backups after the commit', () => {
    const directory = createDirectory()
    const filePath = join(directory, 'a.bin')
    writeFileSync(filePath, 'old')
    const result = writeFilesAtomically([{ filePath, bytes: Uint8Array.from([1, 2]) }])
    expect([...new Uint8Array(readFileSync(filePath))]).toEqual([1, 2])
    expect(result).toEqual({ backupPaths: [], warnings: [] })
    expect(readdirSync(directory)).toEqual(['a.bin'])
  })

  it('keeps the backup when asked and reports its path', () => {
    const directory = createDirectory()
    const filePath = join(directory, 'a.bin')
    writeFileSync(filePath, 'old')
    const result = writeFilesAtomically([{ filePath, bytes: Uint8Array.from([1]) }], { shouldKeepBackups: true })
    expect(result.backupPaths).toEqual([`${filePath}.rpgrt-bak`])
    expect(readFileSync(`${filePath}.rpgrt-bak`, 'utf8')).toBe('old')
  })

  it('writes a new file without creating a backup', () => {
    const directory = createDirectory()
    const filePath = join(directory, 'new.bin')
    const result = writeFilesAtomically([{ filePath, bytes: Uint8Array.from([7]) }], { shouldKeepBackups: true })
    expect(result.backupPaths).toEqual([])
    expect([...new Uint8Array(readFileSync(filePath))]).toEqual([7])
  })

  it('leaves every target untouched when staging a temp fails', () => {
    const directory = createDirectory()
    const goodPath = join(directory, 'a.bin')
    const badPath = join(directory, 'b.bin')
    writeFileSync(goodPath, 'a-old')
    writeFileSync(badPath, 'b-old')
    // A directory on the temp path makes the staging write fail before any rename.
    mkdirSync(`${badPath}.rpgrt-tmp`)
    expect(() => writeFilesAtomically([
      { filePath: goodPath, bytes: Uint8Array.from([1]) },
      { filePath: badPath, bytes: Uint8Array.from([2]) },
    ])).toThrow('Nothing was written')
    expect(readFileSync(goodPath, 'utf8')).toBe('a-old')
    expect(readFileSync(badPath, 'utf8')).toBe('b-old')
  })

  it('rolls the committed files back when a mid-batch rename fails', () => {
    const directory = createDirectory()
    const firstPath = join(directory, 'a.bin')
    const secondPath = join(directory, 'b.bin')
    writeFileSync(firstPath, 'a-old')
    writeFileSync(secondPath, 'b-old')
    // A directory on the second backup path makes its target→backup rename fail
    // after the first file has already been replaced.
    mkdirSync(`${secondPath}.rpgrt-bak`)
    expect(() => writeFilesAtomically([
      { filePath: firstPath, bytes: Uint8Array.from([1]) },
      { filePath: secondPath, bytes: Uint8Array.from([2]) },
    ])).toThrow('every file was restored')
    expect(readFileSync(firstPath, 'utf8')).toBe('a-old')
    expect(readFileSync(secondPath, 'utf8')).toBe('b-old')
    expect(existsSync(`${firstPath}.rpgrt-tmp`)).toBe(false)
    expect(existsSync(`${secondPath}.rpgrt-tmp`)).toBe(false)
  })

  it('removes a committed new file when a later write fails', () => {
    const directory = createDirectory()
    const newPath = join(directory, 'new.bin')
    const failingPath = join(directory, 'b.bin')
    writeFileSync(failingPath, 'b-old')
    mkdirSync(`${failingPath}.rpgrt-bak`)
    expect(() => writeFilesAtomically([
      { filePath: newPath, bytes: Uint8Array.from([1]) },
      { filePath: failingPath, bytes: Uint8Array.from([2]) },
    ])).toThrow('every file was restored')
    // The new file has no backup to restore – a full rollback means deleting it.
    expect(existsSync(newPath)).toBe(false)
    expect(readFileSync(failingPath, 'utf8')).toBe('b-old')
  })
})
