import type { ArgsDef, CommandDef } from 'citty'
import process from 'node:process'
import { defineCommand } from 'citty'
import packageJson from '../package.json' with { type: 'json' }
import { LcfError } from './codec/errors.ts'
import { convertCommand } from './commands/convert.ts'
import { extractCommand } from './commands/extract.ts'
import { injectCommand } from './commands/inject.ts'

/**
 * citty parses with `strict: false` and has no unknown-flag rejection, so a
 * typo like `-o` on a command without it would silently do nothing. Undeclared
 * flags land as extra keys on the parsed args; a flag that consumed a value
 * (or plain trailing junk) shows up as a surplus positional.
 */
function assertNoUnknownArgs(argDefs: ArgsDef, args: Record<string, unknown>): void {
  const knownKeys = new Set(['_'])
  let positionalCount = 0
  for (const [name, definition] of Object.entries(argDefs)) {
    knownKeys.add(name)
    const alias = (definition as { alias?: string | string[] }).alias
    for (const aliasName of typeof alias === 'string' ? [alias] : alias ?? [])
      knownKeys.add(aliasName)
    if ((definition as { type?: string }).type === 'positional')
      positionalCount++
  }
  const unknownArguments = Object.keys(args)
    .filter(key => !knownKeys.has(key))
    .map(key => key.length === 1 ? `-${key}` : `--${key}`)
  for (const surplusPositional of (args._ as string[]).slice(positionalCount))
    unknownArguments.push(JSON.stringify(surplusPositional))
  if (unknownArguments.length > 0)
    throw new LcfError(`Unknown argument(s): ${unknownArguments.join(', ')} – see --help`)
}

// citty's runMain swallows errors itself (print + exit) with no formatting hook,
// so the clean-message boundary has to wrap each subcommand's run.
function withCleanErrors<T extends ArgsDef>(command: CommandDef<T>): CommandDef<T> {
  const run = command.run
  if (run === undefined)
    return command
  return {
    ...command,
    async run(context) {
      try {
        assertNoUnknownArgs((command.args ?? {}) as ArgsDef, context.args)
        return await run(context)
      }
      catch (error) {
        if (error instanceof LcfError) {
          console.error(error.message)
          process.exit(1)
        }
        throw error
      }
    },
  }
}

export const mainCommand: CommandDef = defineCommand({
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
  },
  subCommands: {
    convert: withCleanErrors(convertCommand),
    extract: withCleanErrors(extractCommand),
    inject: withCleanErrors(injectCommand),
  },
})
