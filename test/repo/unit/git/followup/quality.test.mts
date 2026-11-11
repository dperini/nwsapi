import { expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runQuality } from '../../../../../scripts/repo/git/followup/quality.mts'

test('keeps managed tools available for the subsequent commit hooks', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'followup-tools-'))
  const root = path.join(directory, 'checkout')
  const source = path.join(directory, 'source')
  try {
    mkdirSync(path.join(root, 'scripts/repo/translation'), { recursive: true })
    mkdirSync(path.join(source, 'node_modules'), { recursive: true })
    mkdirSync(path.join(source, '.cache/bin'), { recursive: true })
    writeFileSync(path.join(source, '.cache/bin/node'), 'managed runtime')
    writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(
      path.join(root, 'scripts/repo/translation/incremental.mts'),
      'export async function translateIncremental() { return [] }',
    )
    await runQuality(root, [], source)
    expect(existsSync(path.join(root, 'node_modules'))).toBe(true)
    expect(existsSync(path.join(root, '.cache/bin/node'))).toBe(true)
    rmSync(root, { recursive: true })
    expect(existsSync(path.join(source, '.cache/bin/node'))).toBe(true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
