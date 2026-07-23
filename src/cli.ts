import type { ArgsDef, CommandDef } from 'citty'
import process from 'node:process'
import { defineCommand, runMain } from 'citty'
import packageJson from '../package.json' with { type: 'json' }
import { LcfError } from './codec/errors.ts'
import { convertCommand } from './commands/convert.ts'
import { extractCommand } from './commands/extract.ts'
import { injectCommand } from './commands/inject.ts'

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

const main = defineCommand({
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

runMain(main)
