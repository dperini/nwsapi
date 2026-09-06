import { test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs')
import os from 'node:os'
const path = require('node:path')

const helper = path.resolve(__dirname, '../scripts/git-partial-submodule.mts')
const pin = '1234567890123456789012345678901234567890'
const fixtureEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: os.devNull,
}

function fixture(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-checkout-'))
  t.onTestFinished(() => rmSync(base, { recursive: true, force: true }))
  const root = path.join(base, 'project')
  const outside = path.join(base, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  writeFileSync(
    path.join(root, '.gitmodules'),
    `[submodule "upstream/wpt"]
  path = upstream/wpt
  url = https://example.invalid/wpt.git
  ref = ${pin}
  sparse-checkout = selected
`,
  )
  const run = command =>
    spawnSync(process.execPath, [helper, command], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      env: fixtureEnv,
    })
  return { root, outside, run }
}

function repository(dir) {
  mkdirSync(dir, { recursive: true })
  const git = (...args) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: fixtureEnv,
    })
  git('init')
  writeFileSync(path.join(dir, 'tracked.txt'), 'original\n')
  git('add', 'tracked.txt')
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'fixture',
  )
  return git
}

for (const command of ['clone', 'restore-sparse']) {
  for (const shape of ['target', 'ancestor']) {
    test(`${command} refuses an external ${shape} symlink without changing its repository`, t => {
      const { root, outside, run } = fixture(t)
      const dir = shape === 'target' ? outside : path.join(outside, 'wpt')
      const git = repository(dir)
      const before = git('rev-parse', 'HEAD')
      const config = readFileSync(path.join(dir, '.git/config'), 'utf8')
      if (shape === 'target') {
        mkdirSync(path.join(root, 'upstream'))
        symlinkSync(outside, path.join(root, 'upstream/wpt'), 'dir')
      } else {
        symlinkSync(outside, path.join(root, 'upstream'), 'dir')
      }
      const result = run(command)
      assert.equal(result.status, 1, result.stderr)
      assert.match(result.stderr, /refusing symlink escape/)
      assert.equal(git('rev-parse', 'HEAD'), before)
      assert.equal(readFileSync(path.join(dir, '.git/config'), 'utf8'), config)
      assert.equal(
        readFileSync(path.join(dir, 'tracked.txt'), 'utf8'),
        'original\n',
      )
    })
  }

  test(`${command} refuses a dirty in-repository checkout before sparse changes`, t => {
    const { root, run } = fixture(t)
    const dir = path.join(root, 'upstream/wpt')
    const git = repository(dir)
    const before = git('rev-parse', 'HEAD')
    const config = readFileSync(path.join(dir, '.git/config'), 'utf8')
    writeFileSync(path.join(dir, 'tracked.txt'), 'user edit\n')
    const result = run(command)
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /checkout is dirty/)
    assert.equal(git('rev-parse', 'HEAD'), before)
    assert.equal(readFileSync(path.join(dir, '.git/config'), 'utf8'), config)
    assert.equal(
      readFileSync(path.join(dir, 'tracked.txt'), 'utf8'),
      'user edit\n',
    )
  })
}

test('clone refuses a missing target beneath an external symlink', t => {
  const { root, outside, run } = fixture(t)
  symlinkSync(outside, path.join(root, 'upstream'), 'dir')
  const result = run('clone')
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /refusing symlink escape/)
  assert.equal(existsSync(path.join(outside, 'wpt')), false)
})

test('a clean checkout inside the repository can restore sparse patterns', t => {
  const { root, run } = fixture(t)
  repository(path.join(root, 'upstream/wpt'))
  const result = run('restore-sparse')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /sparse-checkout set to: selected/)
})
