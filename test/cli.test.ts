import { describe, expect, it } from 'vitest'
import { runCli } from './utils.ts'

describe('rpgrt CLI', () => {
  describe('argument rejection', () => {
    it('rejects an unknown flag', async () => {
      const { stderr, exitCode } = await runCli(['convert', 'file.lmu', '--nope'])
      expect(exitCode).toBe(1)
      expect(stderr).toContain('Unknown argument(s): --nope')
    })

    it('rejects surplus positionals', async () => {
      const { stderr, exitCode } = await runCli(['convert', 'a.lmu', 'b.lmu'])
      expect(exitCode).toBe(1)
      expect(stderr).toContain('"b.lmu"')
    })
  })
})
