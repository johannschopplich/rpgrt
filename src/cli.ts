import { defineCommand, runMain } from 'citty'
import packageJson from '../package.json' with { type: 'json' }
import { convertCommand } from './commands/convert.ts'

const main = defineCommand({
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
  },
  subCommands: {
    convert: convertCommand,
  },
})

runMain(main)
