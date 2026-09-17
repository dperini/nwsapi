import { lstatSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { treeDigest } from '../../../../scripts/repo/setup/archive.mts'

test('file contents cannot impersonate another entry in an installed tree', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tool-tree-'))
  try {
    const first = path.join(directory, 'a')
    const second = path.join(directory, 'b')
    writeFileSync(first, 'prefix', { mode: 0o600 })
    writeFileSync(second, 'suffix', { mode: 0o600 })
    const expected = treeDigest(directory)
    const mode = lstatSync(second).mode
    writeFileSync(first, `prefixb\0${mode}\0suffix`)
    rmSync(second)
    expect(treeDigest(directory)).not.toBe(expected)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
