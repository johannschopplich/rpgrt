import type { CommandDef, RunMainOptions } from 'utilful/cli'
import { defineCommand } from 'utilful/cli'
import packageJson from '../package.json' with { type: 'json' }
import { LcfError } from './codec/errors.ts'
import { convertCommand } from './commands/convert.ts'
import { extractCommand } from './commands/extract.ts'
import { injectCommand } from './commands/inject.ts'

export const cliOptions: RunMainOptions = { expectedErrors: [LcfError] }

export const mainCommand: CommandDef = defineCommand({
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
  },
  subCommands: {
    convert: convertCommand,
    extract: extractCommand,
    inject: injectCommand,
  },
})
