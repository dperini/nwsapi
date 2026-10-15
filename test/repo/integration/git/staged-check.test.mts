import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
import { expect, test } from 'vitest'
import {
  checkStagedFiles,
  createStagedSnapshot,
} from '../../../../scripts/repo/git/staged-check.mts'

function runGit(root: string, args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

function writeFile(root: string, file: string, content: string) {
  const target = path.join(root, file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function copyLintContext(root: string) {
  const files = [
    'scripts/repo/lint.mts',
    'scripts/repo/lint/files.mts',
    'scripts/repo/lib/is-agent.mts',
    'scripts/repo/lib/paths.mts',
    'scripts/repo/lib/run-node.mts',
    'scripts/repo/lib/external-git-environment.mts',
    'scripts/repo/lib/run-tool.mts',
    'scripts/repo/lib/platform.mts',
    'scripts/repo/lib/tool-process.mts',
    'scripts/repo/lib/tool-worker.mts',
    'scripts/repo/lib/tooling-scope.mts',
    'scripts/repo/develop/process.mts',
    'scripts/repo/git/staged-check.mts',
    'scripts/repo/format.mts',
    'scripts/repo/bench/compare/fixture.mts',
    'scripts/repo/bench/compare/options.mts',
    'scripts/repo/bench/compare/report.mts',
    'scripts/fleet/bench/comparison.mts',
    '.config/oxfmt.json',
    '.config/oxlint.json',
    '.config/tsconfig.check.json',
    '.config/fleet/oxlint/complexity.json',
    ...globSync('.config/repo/oxlint-plugin/**/*.mts', { cwd: REPO_ROOT }),
    'package.json',
  ]
  for (const file of files) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(path.join(REPO_ROOT, file), target)
  }
}

function createGitFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-staged-check-test-'))
  try {
    runGit(root, ['init', '-q'])
    runGit(root, ['config', 'user.name', 'Staged check test'])
    runGit(root, ['config', 'user.email', 'staged-check@example.invalid'])
    runGit(root, ['config', 'commit.gpgsign', 'false'])
    copyLintContext(root)
    symlinkSync(
      path.join(REPO_ROOT, 'node_modules'),
      path.join(root, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    writeFile(root, 'src/staged.mts', 'export const value = 1\n')
    runGit(root, ['add', '-A'])
    runGit(root, ['commit', '-m', 'fixture'])
    return root
  } catch (error) {
    rmSync(root, { recursive: true, force: true })
    throw error
  }
}

test('snapshot exports index bytes without changing staged or worktree files', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-staged-check-test-'))
  const snapshotRoots: string[] = []
  try {
    runGit(root, ['init', '-q'])
    runGit(root, ['config', 'user.name', 'Staged check test'])
    runGit(root, ['config', 'user.email', 'staged-check@example.invalid'])
    runGit(root, ['config', 'commit.gpgsign', 'false'])
    mkdirSync(path.join(root, 'node_modules'))
    writeFile(root, 'src/staged.mts', 'export const value = 1\n')
    writeFile(root, 'scripts/fleet/fixture.mts', 'export const shared = 1\n')
    runGit(root, ['add', '--', 'src/staged.mts', 'scripts/fleet/fixture.mts'])
    runGit(root, ['commit', '-m', 'fixture'])
    writeFile(root, 'src/staged.mts', 'export const value = 2\n')
    runGit(root, ['add', '--', 'src/staged.mts'])
    writeFile(root, 'src/staged.mts', 'export const value = 3\n')
    const stagedPathsBefore = runGit(root, ['diff', '--cached', '--name-only'])
    const worktreePathsBefore = runGit(root, ['diff', '--name-only'])

    const snapshot = createStagedSnapshot(root)
    snapshotRoots.push(snapshot)
    expect(
      readFileSync(path.join(snapshot, 'scripts/fleet/fixture.mts'), 'utf8'),
    ).toBe('export const shared = 1\n')

    expect(readFileSync(path.join(snapshot, 'src/staged.mts'), 'utf8')).toBe(
      'export const value = 2\n',
    )
    expect(readFileSync(path.join(root, 'src/staged.mts'), 'utf8')).toBe(
      'export const value = 3\n',
    )
    expect(runGit(root, ['show', ':src/staged.mts'])).toBe(
      'export const value = 2\n',
    )
    expect(runGit(root, ['diff', '--cached', '--name-only'])).toBe(
      stagedPathsBefore,
    )
    expect(runGit(root, ['diff', '--name-only'])).toBe(worktreePathsBefore)
  } finally {
    for (const snapshot of snapshotRoots) {
      rmSync(snapshot, { recursive: true, force: true })
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test('package changes run full staged lint with imported fleet context', async () => {
  const root = createGitFixture()
  try {
    writeFile(root, 'src/staged.mts', 'export const value = 2\n')
    runGit(root, ['add', '--', 'src/staged.mts'])
    writeFile(root, 'src/staged.mts', 'export const value = 3\n')
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    )
    manifest.description = 'Staged fixture package'
    writeFile(root, 'package.json', JSON.stringify(manifest, null, 2) + '\n')
    const formatterConfig = JSON.parse(
      readFileSync(path.join(root, '.config/oxfmt.json'), 'utf8'),
    )
    formatterConfig.overrides.push({
      files: ['__fixture__/**/*.mts'],
      options: { printWidth: 81 },
    })
    writeFile(
      root,
      '.config/oxfmt.json',
      JSON.stringify(formatterConfig, null, 2) + '\n',
    )
    execFileSync(
      process.execPath,
      [
        'node_modules/oxfmt/bin/oxfmt',
        '--config',
        '.config/oxfmt.json',
        '.config/oxfmt.json',
      ],
      { cwd: root, stdio: 'ignore' },
    )
    runGit(root, ['add', '--', 'package.json', '.config/oxfmt.json'])
    writeFile(root, '.config/oxfmt.json', '{ invalid worktree config\n')

    expect(await checkStagedFiles(root)).toBe(0)
    expect(
      JSON.parse(runGit(root, ['show', ':.config/oxfmt.json'])).overrides.at(
        -1,
      ),
    ).toEqual({
      files: ['__fixture__/**/*.mts'],
      options: { printWidth: 81 },
    })
    expect(readFileSync(path.join(root, '.config/oxfmt.json'), 'utf8')).toBe(
      '{ invalid worktree config\n',
    )
    expect(runGit(root, ['show', ':src/staged.mts'])).toBe(
      'export const value = 2\n',
    )
    expect(readFileSync(path.join(root, 'src/staged.mts'), 'utf8')).toBe(
      'export const value = 3\n',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('staged lint failure preserves invalid index and valid worktree bytes', async () => {
  const root = createGitFixture()
  try {
    writeFile(root, 'src/staged.mts', 'export const value = ;\n')
    runGit(root, ['add', '--', 'src/staged.mts'])
    writeFile(root, 'src/staged.mts', 'export const value = 4\n')
    const failingIndex = runGit(root, ['show', ':src/staged.mts'])
    const failingWorktree = readFileSync(
      path.join(root, 'src/staged.mts'),
      'utf8',
    )
    const failingStagedPaths = runGit(root, ['diff', '--cached', '--name-only'])
    const failingWorktreePaths = runGit(root, ['diff', '--name-only'])

    const rejected = spawnSync(
      process.execPath,
      ['scripts/repo/git/staged-check.mts'],
      { cwd: root, encoding: 'utf8' },
    )
    expect(rejected.error).toBeUndefined()
    expect(rejected.status).toBe(1)
    expect(rejected.stdout + rejected.stderr).toContain('Unexpected token')
    expect(runGit(root, ['show', ':src/staged.mts'])).toBe(failingIndex)
    expect(readFileSync(path.join(root, 'src/staged.mts'), 'utf8')).toBe(
      failingWorktree,
    )
    expect(runGit(root, ['diff', '--cached', '--name-only'])).toBe(
      failingStagedPaths,
    )
    expect(runGit(root, ['diff', '--name-only'])).toBe(failingWorktreePaths)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
