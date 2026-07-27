export interface LcfErrorContext {
  /** Record path such as `Database.actors[3].stateRanks`. */
  path?: string
  /** Byte offset into the enclosing chunk payload – file-absolute only for top-level stream errors. */
  offset?: number
}

export class LcfError extends Error {
  readonly rawMessage: string
  readonly path: string | undefined
  readonly offset: number | undefined

  constructor(message: string, context: LcfErrorContext = {}) {
    const location = [
      context.path,
      context.offset === undefined ? undefined : `byte ${context.offset}`,
    ].filter(part => part !== undefined).join(', ')
    super(location === '' ? message : `${message} (${location})`)
    this.name = 'LcfError'
    this.rawMessage = message
    this.path = context.path
    this.offset = context.offset
  }
}

/** Attaches the path to an `LcfError` only if it has none yet, so the innermost frame's path wins. */
export function inPath<T>(path: string, run: () => T): T {
  try {
    return run()
  }
  catch (error) {
    if (error instanceof LcfError && error.path === undefined)
      throw new LcfError(error.rawMessage, { path, offset: error.offset })
    throw error
  }
}
