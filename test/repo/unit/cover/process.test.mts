import { mkdtempSync, readdirSync, rmSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { markTransformedProcess } from '../../../../scripts/fleet/cover/process.mts'

test('only coverage sessions mark their transformed test processes', () => {
  expect(markTransformedProcess(undefined)).toBeUndefined()
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-transformed-'))
  try {
    markTransformedProcess(directory)
    expect(readdirSync(directory)).toHaveLength(1)
    expect(
      JSON.parse(
        readFileSync(path.join(directory, readdirSync(directory)[0]!), 'utf8'),
      ),
    ).toEqual({})
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
