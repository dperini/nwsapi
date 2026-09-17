import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { activateTool } from '../../../../scripts/repo/setup/tools.mts'
import manifest from '../../../../.config/external-tools.json' with { type: 'json' }
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

test('activating Node again through its managed launcher preserves the executable', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-tool-activation-'),
  )
  try {
    const launcher = path.join(
      directory,
      process.platform === 'win32' ? 'node.exe' : 'node',
    )
    activateTool('node', process.execPath, directory)
    activateTool('node', launcher, directory)
    expect(
      execFileSync(launcher, ['--version'], {
        cwd: directory,
        encoding: 'utf8',
      }).trim(),
    ).toBe(process.version)
    if (process.platform !== 'win32') {
      expect(realpathSync(launcher)).toBe(realpathSync(process.execPath))
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('failed bootstrap replaces existing manager launchers with repair stubs', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tool-failure-'))
  try {
    const files = [
      'scripts/repo/setup/tools.mts',
      'scripts/repo/setup/firewall.mts',
      'scripts/repo/setup/install.mts',
      'scripts/repo/setup/download.mts',
      'scripts/repo/setup/archive.mts',
      'scripts/repo/node.mts',
      'scripts/repo/external-tools.mts',
      'scripts/repo/lib/paths.mts',
      'scripts/repo/lib/run-node.mts',
      '.config/node-interop.json',
    ]
    for (const file of files) {
      const target = path.join(directory, file)
      mkdirSync(path.dirname(target), { recursive: true })
      copyFileSync(path.join(REPO_ROOT, file), target)
    }
    const invalid = structuredClone(manifest)
    invalid.tools.sfw.version = 'latest'
    writeFileSync(
      path.join(directory, '.config/external-tools.json'),
      JSON.stringify(invalid),
    )
    const bin = path.join(directory, '.cache/bin')
    activateTool('npm', process.execPath, bin)
    activateTool('pnpm', process.execPath, bin)
    const setup = spawnSync(
      process.execPath,
      ['scripts/repo/setup/tools.mts'],
      { cwd: directory, encoding: 'utf8' },
    )
    expect(setup.status).toBe(1)
    expect(setup.stderr).toContain('Invalid external tool configuration: sfw')
    for (const name of ['npm', 'pnpm']) {
      const windows = process.platform === 'win32'
      const command = path.join(bin, windows ? `${name}.cmd` : name)
      const result = spawnSync(
        windows ? 'cmd.exe' : command,
        windows ? ['/d', '/c', command] : [],
        { cwd: directory, encoding: 'utf8' },
      )
      expect(result.status).toBe(127)
      expect(result.stderr).toContain('node scripts/repo/setup/tools.mts')
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
