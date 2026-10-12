import { expect, test } from 'vitest'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT } from '../../../../../scripts/repo/lib/paths.mts'
import { runVersion } from '../../../../../scripts/repo/develop/version/run.mts'
import { parseOptions } from '../../../../../scripts/repo/develop/protocol.mts'

function git(root: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function fixture(branch: 'master' | 'prerelease/3.0.0') {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'nwsapi-version-run-')),
  )
  git(root, 'init', '-b', 'master')
  git(root, 'config', 'user.email', 'fixture@example.test')
  git(root, 'config', 'user.name', 'Fixture')
  writeFileSync(path.join(root, 'base'), 'fixture')
  git(root, 'add', 'base')
  git(root, 'commit', '-m', 'base')
  if (branch !== 'master') {
    git(root, 'switch', '-c', branch)
  }
  return root
}

function generatedCheckout(root: string, prefix: string) {
  const block = git(root, 'worktree', 'list', '--porcelain')
    .split('\n\n')
    .find(item => item.includes(`branch refs/heads/agent/${prefix}-`))
  return block?.split('\n')[0]?.slice('worktree '.length)
}

function cleanGeneratedCheckout(root: string, prefix: string) {
  const checkout = generatedCheckout(root, prefix)
  if (!checkout) {
    return
  }
  const branch = git(checkout, 'branch', '--show-current')
  const parent = path.dirname(checkout)
  try {
    execFileSync('git', ['worktree', 'remove', checkout, '--force'], {
      cwd: root,
      stdio: 'ignore',
    })
  } catch {
    /* Fixture may already be removed. */
  }
  try {
    execFileSync('git', ['branch', '-D', branch], {
      cwd: root,
      stdio: 'ignore',
    })
  } catch {
    /* Fixture branch may already be absent. */
  }
  rmSync(parent, { recursive: true, force: true })
}

test('selected-version discovery emits one object and does not create a worktree', () => {
  const before = git(REPO_ROOT, 'worktree', 'list', '--porcelain')
  const result = spawnSync(
    process.execPath,
    ['scripts/repo/develop/run.mts', '--version', 'v3', '--list', '--json'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  expect(result.status).toBe(0)
  const parsed = JSON.parse(result.stdout)
  expect(parsed.selectedVersion).toBe('v3')
  expect(parsed.tasks[0].execution).toContain('v3')
  expect(result.stdout.trim().split('\n')).toHaveLength(1)
  expect(git(REPO_ROOT, 'worktree', 'list', '--porcelain')).toBe(before)
})

test('version task names are delegated to the selected runner', () => {
  expect(
    parseOptions(['--version', 'v2', '--task', 'docs', '--json']),
  ).toMatchObject({
    version: 'v2',
    task: 'docs',
    json: true,
  })
})

test('version runner executes the selected checkout from its own working directory', async () => {
  const root = fixture('master')
  try {
    git(root, 'switch', '-c', 'prerelease/3.0.0')
    const runner = path.join(root, 'scripts/repo/develop/run.mts')
    mkdirSync(path.dirname(runner), { recursive: true })
    writeFileSync(
      runner,
      "import { writeFileSync } from 'node:fs'; writeFileSync('runner-cwd.txt', process.cwd())\n",
    )
    git(root, 'add', 'scripts/repo/develop/run.mts')
    git(root, 'commit', '-m', 'add v3 runner fixture')
    git(root, 'switch', 'master')
    await runVersion('v3', ['--task', 'fixture'], root)
    const checkout = generatedCheckout(root, 'v3')!
    expect(readFileSync(path.join(checkout, 'runner-cwd.txt'), 'utf8')).toBe(
      checkout,
    )
    process.exitCode = 0
  } finally {
    cleanGeneratedCheckout(root, 'v3')
    rmSync(root, { recursive: true, force: true })
  }
})

test('a v3 feature checkout with a 2.3 prerelease package stays in place', async () => {
  const root = fixture('master')
  git(root, 'switch', '-c', 'feature/v3-workflow')
  mkdirSync(path.join(root, 'scripts/repo/develop'), { recursive: true })
  writeFileSync(
    path.join(root, 'package.json'),
    '{"name":"nwsapi","version":"2.3.0-prerelease"}\n',
  )
  writeFileSync(
    path.join(root, 'scripts/repo/develop/run.mts'),
    "import { writeFileSync } from 'node:fs'; writeFileSync('runner-cwd.txt', process.cwd())\n",
  )
  git(root, 'add', 'package.json', 'scripts/repo/develop/run.mts')
  git(root, 'commit', '-m', 'v3 feature workflow fixture')
  const before = git(root, 'worktree', 'list', '--porcelain')
  try {
    await runVersion('v3', ['--task', 'fixture'], root)
    expect(readFileSync(path.join(root, 'runner-cwd.txt'), 'utf8')).toBe(root)
    expect(git(root, 'worktree', 'list', '--porcelain')).toBe(before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('v2 CLI task failure emits one JSON object when master has no guided runner', () => {
  const root = fixture('master')
  git(root, 'switch', '-c', 'prerelease/3.0.0')
  const moduleUrl = pathToFileURL(
    path.join(REPO_ROOT, 'scripts/repo/develop/run.mts'),
  ).href
  const invocation = `import { main } from ${JSON.stringify(moduleUrl)}; await main(['--version', 'v2', '--task', 'setup:check', '--json'], ${JSON.stringify(root)})`
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', invocation],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
  try {
    expect(result.status).toBe(2)
    expect(result.stdout.trim().split('\n')).toHaveLength(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: 'result',
      status: 'failed',
      exitCode: 2,
    })
    expect(generatedCheckout(root, 'v2')).toBeDefined()
  } finally {
    cleanGeneratedCheckout(root, 'v2')
    rmSync(root, { recursive: true, force: true })
  }
})

test('version wrapper forwards SIGINT to a noninteractive selected runner', async () => {
  const root = fixture('prerelease/3.0.0')
  const runner = path.join(root, 'scripts/repo/develop/run.mts')
  mkdirSync(path.dirname(runner), { recursive: true })
  writeFileSync(
    runner,
    `process.on('SIGINT', () => { console.log(JSON.stringify({type:'result', status:'failed', exitCode:130})); process.exit(130) }); process.stderr.write('READY\\n'); setInterval(() => {}, 1000)\n`,
  )
  git(root, 'add', 'scripts/repo/develop/run.mts')
  git(root, 'commit', '-m', 'add cancellable runner fixture')
  const moduleUrl = pathToFileURL(
    path.join(REPO_ROOT, 'scripts/repo/develop/version/run.mts'),
  ).href
  const invocation = `import { runVersion } from ${JSON.stringify(moduleUrl)}; await runVersion('v3', ['--task', 'fixture', '--json'], ${JSON.stringify(root)})`
  const child = spawn(
    process.execPath,
    ['--input-type=module', '-e', invocation],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let stdout = ''
  child.stdout?.on('data', chunk => {
    stdout += chunk.toString()
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Runner did not become ready.')),
        5000,
      )
      child.stderr?.on('data', chunk => {
        if (chunk.toString().includes('READY')) {
          clearTimeout(timeout)
          resolve()
        }
      })
      child.once('error', reject)
    })
    child.kill('SIGINT')
    const exitCode = await new Promise<number | null>(resolve => {
      child.once('close', code => resolve(code))
    })
    expect(exitCode).toBe(130)
    expect(stdout.trim().split('\n')).toHaveLength(1)
    expect(JSON.parse(stdout)).toMatchObject({
      type: 'result',
      status: 'failed',
      exitCode: 130,
    })
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await new Promise<void>(resolve => child.once('close', () => resolve()))
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test('version wrapper preserves cancellation when the selected runner exits cleanly', async () => {
  const root = fixture('prerelease/3.0.0')
  const runner = path.join(root, 'scripts/repo/develop/run.mts')
  mkdirSync(path.dirname(runner), { recursive: true })
  writeFileSync(
    runner,
    `process.on('SIGINT', () => process.exit(0)); process.stderr.write('READY\\n'); setInterval(() => {}, 1000)\n`,
  )
  git(root, 'add', 'scripts/repo/develop/run.mts')
  git(root, 'commit', '-m', 'add gracefully cancellable runner fixture')
  const moduleUrl = pathToFileURL(
    path.join(REPO_ROOT, 'scripts/repo/develop/version/run.mts'),
  ).href
  const invocation = `import { runVersion } from ${JSON.stringify(moduleUrl)}; await runVersion('v3', ['--task', 'fixture'], ${JSON.stringify(root)})`
  const child = spawn(
    process.execPath,
    ['--input-type=module', '-e', invocation],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Runner did not become ready.')),
        5000,
      )
      child.stderr?.on('data', chunk => {
        if (chunk.toString().includes('READY')) {
          clearTimeout(timeout)
          resolve()
        }
      })
      child.once('error', reject)
    })
    child.kill('SIGINT')
    const exitCode = await new Promise<number | null>(resolve => {
      child.once('close', code => resolve(code))
    })
    expect(exitCode).toBe(130)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await new Promise<void>(resolve => child.once('close', () => resolve()))
    }
    rmSync(root, { recursive: true, force: true })
  }
})
