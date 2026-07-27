import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { LcfError } from '../codec/errors.ts'

export interface PendingWrite {
  filePath: string
  bytes: Uint8Array
}

export interface AtomicWriteResult {
  /** Backups of pre-existing targets that remain on disk after the commit. */
  backupPaths: string[]
  /** Non-fatal cleanup failures – the writes themselves are committed. */
  warnings: string[]
}

/**
 * All-or-nothing: every file is replaced (as `<file>` with the previous bytes
 * in `<file>.rpgrt-bak`) or none is. Temps are staged beside their targets so
 * every rename stays on one volume and is atomic. Crash or power loss between
 * renames remains out of scope. With `shouldKeepBackups` the backups survive the
 * commit; otherwise they are removed, and a failed removal only warns.
 */
export function writeFilesAtomically(writes: PendingWrite[], options: { shouldKeepBackups?: boolean } = {}): AtomicWriteResult {
  const stagedWrites = writes.map(write => ({
    ...write,
    tempPath: `${write.filePath}.rpgrt-tmp`,
    backupPath: `${write.filePath}.rpgrt-bak`,
  }))
  // Only files whose original made it into a backup need (or may) be restored –
  // probing the filesystem instead would mistake a stray occupant of the backup
  // path for a backup.
  const backedUpWrites: typeof stagedWrites = []
  // A target that never existed has no backup to restore – rollback must
  // delete the committed file instead.
  const committedNewWrites: typeof stagedWrites = []
  try {
    for (const { tempPath, bytes } of stagedWrites)
      writeFileSync(tempPath, bytes)
    for (const stagedWrite of stagedWrites) {
      if (existsSync(stagedWrite.filePath)) {
        renameSync(stagedWrite.filePath, stagedWrite.backupPath)
        backedUpWrites.push(stagedWrite)
        renameSync(stagedWrite.tempPath, stagedWrite.filePath)
      }
      else {
        renameSync(stagedWrite.tempPath, stagedWrite.filePath)
        committedNewWrites.push(stagedWrite)
      }
    }
  }
  catch (error) {
    const unrestoredFileNames: string[] = []
    for (const { filePath, backupPath } of backedUpWrites) {
      try {
        renameSync(backupPath, filePath)
      }
      catch {
        unrestoredFileNames.push(basename(filePath))
      }
    }
    for (const { filePath } of committedNewWrites) {
      try {
        rmSync(filePath, { force: true })
      }
      catch {
        unrestoredFileNames.push(basename(filePath))
      }
    }
    // Temp cleanup must not mask the rollback outcome.
    for (const { tempPath } of stagedWrites) {
      try {
        rmSync(tempPath, { force: true })
      }
      catch {}
    }
    if (unrestoredFileNames.length > 0)
      throw new LcfError(`Writing failed and rollback left ${unrestoredFileNames.join(', ')} unrestored – recover them from their .rpgrt-bak siblings. Original error: ${(error as Error).message}`)
    throw new LcfError(`Nothing was written – the write phase failed and every file was restored: ${(error as Error).message}`)
  }
  if (options.shouldKeepBackups === true)
    return { backupPaths: backedUpWrites.map(write => write.backupPath), warnings: [] }
  // Every rename is committed – leftover backups are cleanup, never rollback
  // state, so a failure here must not trigger the restore path above.
  const warnings: string[] = []
  for (const { backupPath } of backedUpWrites) {
    try {
      rmSync(backupPath, { force: true })
    }
    catch {
      warnings.push(`Could not remove leftover backup ${basename(backupPath)}`)
    }
  }
  return { backupPaths: [], warnings }
}
