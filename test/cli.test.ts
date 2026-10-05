import { describe, expect, it } from 'vitest'
import { runCli } from './utils.ts'

describe('rpgrt CLI', () => {
  describe('argument rejection', () => {
    it('rejects an unknown flag', async () => {
      const { stderr, exitCode } = await runCli(['convert', 'file.lmu', '--nope'])
      expect(exitCode).toBe(1)
      expect(stderr).toContain('Unknown option \'--nope\'')
    })

    it('rejects surplus positionals', async () => {
      const { stderr, exitCode } = await runCli(['convert', 'a.lmu', 'b.lmu'])
      expect(exitCode).toBe(1)
      expect(stderr).toContain('"b.lmu"')
    })

    it.each([
      ['convert', 'file.lmu'],
      ['extract', 'game'],
      ['inject', 'game', 'strings.json'],
    ])('%s rejects an unknown --engine, listing 2k and 2k3', async (...argv) => {
      const { stderr, exitCode } = await runCli([...argv, '--engine', 'sega'])
      expect(exitCode).toBe(1)
      expect(stderr).toContain('Invalid value for --engine: "sega". Expected one of: 2k, 2k3')
    })
  })
})
