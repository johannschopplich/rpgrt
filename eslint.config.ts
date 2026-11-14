import type { ConfigNames, TypedFlatConfigItem } from '@antfu/eslint-config'
import type { FlatConfigComposer } from 'eslint-flat-config-utils'
import antfu from '@antfu/eslint-config'

const config: FlatConfigComposer<TypedFlatConfigItem, ConfigNames> = antfu({
  rules: {
    'jsdoc/multiline-blocks': [
      'error',
      {
        noMultilineBlocks: true,
        minimumLengthForMultiline: 100,
      },
    ],
  },
}, {
  // The generator writes one table row per line, and CI checks its output byte for byte.
  files: ['src/generated/**'],
  rules: {
    'antfu/reasonable-newline': 'off',
  },
})

export default config
