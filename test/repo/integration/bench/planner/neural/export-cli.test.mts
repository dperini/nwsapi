import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import path from 'node:path'
import { REPO_ROOT } from '../../../../../../scripts/repo/lib/paths.mts'

test('export CLI shows help and rejects missing arguments', () => {
  const script = path.join(
    REPO_ROOT,
    'scripts/repo/bench/planner/neural/export.mts',
  )
  const help = spawnSync(process.execPath, [script, '--help'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  const missing = spawnSync(process.execPath, [script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  expect(help.status).toBe(0)
  expect(missing.status).toBe(1)
})
