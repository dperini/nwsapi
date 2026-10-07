import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

test('the partial checkout verifier accepts a clean local sparse checkout without fetching its remote', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-partial-verify-'))
  const checkout = path.join(root, 'upstream/fixture')
  mkdirSync(path.join(checkout, 'fixtures'), { recursive: true })
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: checkout,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
    }).trim()
  try {
    git(['init', '--quiet'])
    git(['config', 'user.email', 'fixture@example.test'])
    git(['config', 'user.name', 'Fixture'])
    writeFileSync(
      path.join(checkout, 'fixtures/case.html'),
      '<title>Fixture</title>',
    )
    git(['add', '.'])
    git(['commit', '--quiet', '-m', 'Fixture'])
    git(['sparse-checkout', 'init', '--cone'])
    git(['sparse-checkout', 'set', 'fixtures'])
    const revision = git(['rev-parse', 'HEAD'])
    const tree = execFileSync(
      'git',
      ['-c', 'core.quotePath=false', 'ls-tree', '-r', revision],
      { cwd: checkout, encoding: 'utf8' },
    )
    const hash = createHash('sha256').update(tree).digest('hex')
    writeFileSync(
      path.join(root, '.gitmodules'),
      [
        `# fixture sha256:${hash}`,
        '[submodule "upstream/fixture"]',
        '  path = upstream/fixture',
        '  url = https://example.test/fixture.git',
        `  ref = ${revision}`,
        '  sparse-checkout = fixtures',
        '',
      ].join('\n'),
    )
    const script = fileURLToPath(
      new URL(
        '../../../../../scripts/repo/git/partial/submodule.mts',
        import.meta.url,
      ),
    )
    const result = spawnSync(process.execPath, [script, 'verify'], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr || result.stdout).toBe(0)
    expect(git(['status', '--porcelain'])).toBe('')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
