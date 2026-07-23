import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildModel, emitDescriptors, emitEnums, emitStructs } from './lib/emit.ts'
import { loadTables, selectStructs } from './lib/tables.ts'

const rootDirectory = fileURLToPath(new URL('..', import.meta.url))
const tables = loadTables(join(rootDirectory, 'vendor/liblcf-csv'))
const selected = selectStructs(tables, ['ldb', 'lmt', 'lmu', 'lsd'])
const model = buildModel(tables, selected)

const outputDirectory = join(rootDirectory, 'src/generated')
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(join(outputDirectory, 'records.ts'), emitStructs(model))
writeFileSync(join(outputDirectory, 'descriptors.ts'), emitDescriptors(model))
writeFileSync(join(outputDirectory, 'enums.ts'), emitEnums(model))

const fieldCount = model.structs.reduce((sum, struct) => sum + struct.fields.length, 0)
console.log(`Generated ${model.structs.length} records (${fieldCount} fields), ${model.enums.length} enums, ${model.flagSets.length} flag sets → src/generated/`)
