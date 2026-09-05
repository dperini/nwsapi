import { defineConfig } from 'vitest/config'
import base from './vitest.config.mts'

export default defineConfig({
  ...base,
  test: { ...base.test, include: ['test/node/jsdom.spec.mts'] },
})
