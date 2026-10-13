import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import {
  exactManagerVersionCommand,
  stageCommands,
} from '../../../../../scripts/repo/test/onboarding/environment.mts'

test('exact manager version command handles JavaScript launchers and native binaries', () => {
  const node = '/tools/node'
  const npm = '/tools/npm-cli.js'
  const pnpm = '/tools/pnpm'
  assert.deepEqual(exactManagerVersionCommand(npm, node), {
    executable: node,
    args: [npm, '--version'],
  })
  assert.deepEqual(exactManagerVersionCommand(pnpm, node), {
    executable: pnpm,
    args: ['--version'],
  })
})

test('staged manager launcher uses its declared Node path from another directory', async () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi staged node with spaces-'),
  )
  const bin = path.join(root, 'entry bin')
  const node = path.join(
    bin,
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  const manager = path.join(root, 'manager script.mjs')
  const args = ['argument with spaces', 'omega']
  try {
    mkdirSync(bin, { recursive: true })
    copyFileSync(process.execPath, node)
    chmodSync(node, 0o755)
    writeFileSync(
      manager,
      'process.stdout.write(JSON.stringify({ executable: process.execPath, args: process.argv.slice(2) }))',
    )
    await stageCommands(bin, node, 'pnpm', manager)
    const launcher = path.join(
      bin,
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    )
    const result =
      process.platform === 'win32'
        ? spawnSync(
            process.env['ComSpec'] ?? 'cmd.exe',
            ['/d', '/s', '/c', `""${launcher}" "argument with spaces" omega"`],
            {
              cwd: os.tmpdir(),
              encoding: 'utf8',
              windowsVerbatimArguments: true,
              windowsHide: true,
            },
          )
        : spawnSync(launcher, args, {
            cwd: os.tmpdir(),
            encoding: 'utf8',
          })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
      executable: realpathSync(node),
      args,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
