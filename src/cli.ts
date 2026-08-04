import type { CommandDef } from 'citty'
import { defineCommand } from 'citty'
import packageJson from '../package.json' with { type: 'json' }
import { convertCommand } from './commands/convert.ts'
import { extractCommand } from './commands/extract.ts'
import { injectCommand } from './commands/inject.ts'
import { withCleanErrors } from './errors.ts'

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
