import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildFixtures } from '../test/fixtures/build.ts'

const fixturesDirectory = join(import.meta.dirname, '../test/fixtures')
mkdirSync(fixturesDirectory, { recursive: true })
const fixtures = buildFixtures()
for (const fixture of fixtures)
  writeFileSync(join(fixturesDirectory, fixture.fileName), fixture.bytes)
console.log(`Wrote ${fixtures.length} fixtures → test/fixtures/`)
