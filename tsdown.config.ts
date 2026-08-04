import type { UserConfig } from 'tsdown/config'
import { defineConfig } from 'tsdown/config'

const config: UserConfig = defineConfig({
  entry: ['src/index.ts', 'src/encoding.ts', 'src/cli.ts', 'src/entry.ts'],
  dts: true,
})

export default config
