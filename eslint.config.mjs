import { defineConfig } from "eslint/config";
import js from '@eslint/js';
import globals from 'globals';

export default defineConfig([
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js'],
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

      'default-case': 'error',
      'no-duplicate-case': 'error',
      'radix': 'error',
      'no-with': 'error',
    },
  },
]);
