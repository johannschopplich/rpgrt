import { defineCommand, runMain } from 'citty'
import packageJson from '../package.json' with { type: 'json' }

const main = defineCommand({
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
  },
})

runMain(main)
