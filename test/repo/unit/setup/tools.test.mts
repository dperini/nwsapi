import { expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  describeToolSetup,
  installJouet,
  main,
  setupGithubTools,
  toolSetupPlan,
} from '../../../../scripts/repo/setup/tools.mts'
import manifest from '../../../../.config/external-tools.json' with { type: 'json' }
import {
  toolPlan,
  toolPlatform,
} from '../../../../scripts/repo/external-tools.mts'

test('Jouet installation skips platforms without a pinned asset', async () => {
  const install = vi.fn()
  const log = vi.fn()

  await installJouet({ platform: 'unsupported-platform', install, log })

  expect(install).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledWith(
    'Jouet has no pinned release asset for unsupported-platform; its hooks will stay inactive here.',
  )
})

test('Jouet installation verifies its pinned version before activation', async () => {
  const executable = '/cache/jouet'
  const install = vi.fn(async () => executable)
  const verify = vi.fn(() => `jouet ${manifest.tools.jouet.version}`)
  const activate = vi.fn()

  await installJouet({
    platform: 'darwin-arm64',
    install,
    verify,
    activate,
  })

  expect(install).toHaveBeenCalledWith(toolPlan('jouet', 'darwin-arm64'))
  expect(verify).toHaveBeenCalledWith(executable)
  expect(activate).toHaveBeenCalledWith(executable)
})

test('Jouet version mismatch prevents activation', async () => {
  const activate = vi.fn()

  await expect(
    installJouet({
      platform: 'darwin-arm64',
      install: vi.fn(async () => '/cache/jouet'),
      verify: () => 'jouet 0.0.0',
      activate,
    }),
  ).rejects.toThrow(
    `Expected jouet ${manifest.tools.jouet.version}, received jouet 0.0.0`,
  )

  expect(activate).not.toHaveBeenCalled()
})

test('tool setup preview lists pinned versions and checkout destinations', () => {
  const plan = toolSetupPlan()
  expect(plan.tools.map(tool => tool.name)).toEqual([
    'nub',
    'pnpm',
    'npm',
    'sfw',
    'mise',
    ...(manifest.tools.jouet.platforms[
      toolPlatform() as keyof typeof manifest.tools.jouet.platforms
    ]
      ? ['jouet']
      : []),
  ])
  expect(plan.targets).toContain('.cache/bin/toolchain.json')
  expect(plan.targets).toContain('.cache/external-tools')
})

test('tool setup dry-run does not call the installer', async () => {
  const setup = vi.fn(async () => '/checkout/.cache/bin')
  const log = vi.fn()
  await main(['--dry-run', '--json'], setup, log)
  expect(setup).not.toHaveBeenCalled()
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    type: 'preview',
    command: 'setup/tools',
  })
  expect(describeToolSetup().options).toContain('--dry-run')
})

test('GitHub bootstrap appends the tool path without loading the CLI parser', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tools-'))
  const githubPath = path.join(directory, 'github-path')
  const setup = vi.fn(async () => path.join(directory, 'bin'))
  const log = vi.fn()

  try {
    await main(['--github-path', '--full'], setup, log, {
      GITHUB_PATH: githubPath,
    })
    expect(setup).toHaveBeenCalledWith({ full: true })
    expect(readFileSync(githubPath, 'utf8')).toBe(
      path.join(directory, 'bin') + '\n',
    )
    expect(log).toHaveBeenCalledWith(
      'Toolchain ready for repository commands. Global defaults are unchanged.',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('GitHub bootstrap validates its output path before setup', async () => {
  const setup = vi.fn(async () => '/cache/bin')
  await expect(setupGithubTools({ setup, env: {} })).rejects.toThrow(
    'GITHUB_PATH is required with --github-path.',
  )
  expect(setup).not.toHaveBeenCalled()
})
