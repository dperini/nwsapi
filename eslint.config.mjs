import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
    'dist/',
    'node_modules/',
    'upstream/',
    'test-results/',
    'playwright-report/',
    // legacy browser-run suites, not lintable as modern JS
    'test/css3-compat/',
    'test/css3-escape/',
    'test/html5/',
    'test/jquery/',
    'test/jsvm/',
    'test/prototype/',
    'test/quirks/',
    'test/scope/',
    'test/scotch/',
    'test/slick/',
    'test/speed/',
    'test/w3c/',
    'test/W3C-Selector-tests/',
    'test/wpt/',
    'test/xml/',
    'build/',
  ]),
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.commonjs,
        ...globals.amd,
        NW: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-cond-assign': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'no-redeclare': 'off',
      'no-empty': 'off',

      'default-case': 'error',
      'no-duplicate-case': 'error',
      'radix': 'error',
      'no-with': 'error',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
]);
