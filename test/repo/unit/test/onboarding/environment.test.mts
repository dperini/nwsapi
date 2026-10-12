import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { stageCommands } from '../../../../../scripts/repo/test/onboarding/environment.mts'

test.skipIf(process.platform !== 'win32')(
  'Windows staged manager launcher uses its declared Node path from another working directory',
  async () => {
    const root = mkdtempSync(
      path.join(os.tmpdir(), 'nwsapi staged node with spaces-'),
    )
    const bin = path.join(root, 'entry bin')
    const node = path.join(bin, 'node.exe')
    const manager = path.join(root, 'manager script.mjs')
    try {
      mkdirSync(bin, { recursive: true })
      copyFileSync(process.execPath, node)
      writeFileSync(
        manager,
        'process.stdout.write(JSON.stringify({ executable: process.execPath, args: process.argv.slice(2) }))',
      )
      await stageCommands(bin, node, 'pnpm', manager)
      const launcher = path.join(bin, 'pnpm.cmd')
      const result = spawnSync(
        process.env['ComSpec'] ?? 'cmd.exe',
        ['/d', '/s', '/c', `""${launcher}" "argument with spaces" omega"`],
        {
          cwd: os.tmpdir(),
          encoding: 'utf8',
          windowsVerbatimArguments: true,
          windowsHide: true,
        },
      )
      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(JSON.parse(result.stdout), {
        executable: node,
        args: ['argument with spaces', 'omega'],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)
