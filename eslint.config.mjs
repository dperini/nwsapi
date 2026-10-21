import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    files: ['src/nwsapi.js'],
    languageOptions: {
      ecmaVersion: 2015,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.amd,
        ...globals.commonjs,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-cond-assign': ['error', 'except-parens'],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Preserve callback parameters and intentionally ignored parse failures.
      // initEnv registers environment hooks through its initializer side effect.
      'no-unused-vars': [
        'error',
        {
          args: 'none',
          caughtErrors: 'none',
          varsIgnorePattern: '^initEnv$',
        },
      ],
    },
  },
]
