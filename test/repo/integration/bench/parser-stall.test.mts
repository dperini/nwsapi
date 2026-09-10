import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { probeParser } from '../../../../scripts/repo/bench/parser-stall.mts'

test('the captured malformed selector is rejected within a separate process limit', () => {
  const report = JSON.parse(
    readFileSync(
      new URL(
        '../../../../assets/repo/bench/parser-stall.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  const selector = Buffer.from(report.input.data, 'base64').toString()
  expect(probeParser(selector).outcome).toBe('SyntaxError')
})
