import { afterAll, beforeAll, test } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const {
  cpSync,
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

const helper = path.resolve(
  __dirname,
  '../../../scripts/repo/git-partial-submodule.mts',
)
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
  const run = (command, env = {}) =>
    spawnSync(process.execPath, [helper, command], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...fixtureEnv, ...env },
    })
  return { root, outside, run }
}

let seed: string
beforeAll(() => {
  seed = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-checkout-seed-'))
  initializeRepository(seed)
})
afterAll(() => {
  if (seed) {
    rmSync(seed, { recursive: true, force: true })
  }
})

function gitFor(dir) {
  return (...args) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: fixtureEnv,
    })
}

function repository(dir) {
  // Copy objects and metadata, not a shared working tree or mutable hardlinks.
  cpSync(seed, dir, { recursive: true })
  return gitFor(dir)
}

function initializeRepository(dir) {
  const git = gitFor(dir)
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

test('clone pins a depth-one single-branch sparse checkout and verifies its fetch scope', t => {
  const { root, outside, run } = fixture(t)
  const git = repository(outside)
  const ref = git('rev-parse', 'HEAD').trim()
  const branch = git('branch', '--show-current').trim()
  writeFileSync(
    path.join(root, '.gitmodules'),
    `[submodule "upstream/wpt"]
  path = upstream/wpt
  url = https://fixture.invalid/wpt.git
  ref = ${ref}
  branch = ${branch}
  shallow = true
  sparse-checkout = selected
`,
  )
  const cloned = run('clone', {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.${pathToFileURL(outside).href}.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://fixture.invalid/wpt.git',
  })
  assert.equal(cloned.status, 0, cloned.stderr)
  const checkout = gitFor(path.join(root, 'upstream/wpt'))
  assert.equal(checkout('rev-parse', 'HEAD').trim(), ref)
  assert.equal(checkout('rev-parse', '--is-shallow-repository').trim(), 'true')
  assert.equal(checkout('rev-list', '--count', 'HEAD').trim(), '1')
  assert.equal(
    checkout('config', '--get-all', 'remote.origin.fetch').trim(),
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  )
  assert.equal(checkout('sparse-checkout', 'list').trim(), 'selected')
  checkout(
    'config',
    '--replace-all',
    'remote.origin.fetch',
    '+refs/heads/*:refs/remotes/origin/*',
  )
  assert.equal(run('restore-sparse').status, 0)
  assert.equal(
    checkout('config', '--get-all', 'remote.origin.fetch').trim(),
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  )
})
