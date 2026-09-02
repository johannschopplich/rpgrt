import process from 'node:process'
import { mainCommand } from './cli.ts'
import { runMain } from './errors.ts'

void runMain(mainCommand, process.argv.slice(2))
