import { defineCommand, runMain } from 'citty'
import packageJson from '../package.json' with { type: 'json' }
import { convertCommand } from './commands/convert.ts'
import { extractCommand } from './commands/extract.ts'
import { injectCommand } from './commands/inject.ts'

const main = defineCommand({
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

runMain(main)
