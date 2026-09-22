#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const maxBuffer = 512 * 1024 * 1024
const modules = path.join(root, '.gitmodules')
const prefix = 'submodule.upstream/wpt.'
const get = key => execFileSync('git', ['config', '--file', modules, '--get', prefix + key], { encoding: 'utf8' }).trim()
const config = { path: get('path'), ref: get('ref'), url: get('url'), branch: get('branch'), sparse: get('sparse-checkout').split(/\s+/) }
const manifest = readFileSync(modules, 'utf8').match(/^#\s+wpt-[\w-]+\s+sha256:([0-9a-f]{64})$/m)?.[1]
const upstream = path.join(root, config.path)

if (
  config.path !== 'upstream/wpt' ||
  !/^[0-9a-f]{40}$/.test(config.ref) ||
  !config.url.startsWith('https://') ||
  !/^[A-Za-z0-9._/-]+$/.test(config.branch) ||
  !manifest ||
  config.sparse.some(entry => entry.startsWith('-'))
) {
  throw new Error('Invalid upstream/wpt pin in .gitmodules')
}

switch (process.argv[2]) {
  case 'setup': setup(); break
  case 'verify': verify(); break
  case 'serve': verify(); serve(); break
  default: console.error('Usage: node test/wpt/wpt-launcher.mjs <setup|verify|serve>'); process.exitCode = 1
}

function git(args) {
  execFileSync('git', args, { cwd: root, stdio: 'inherit' })
}

function phpInstallHint() {
  switch (process.platform) {
    case 'darwin': return 'Install it with Homebrew: brew install php'
    case 'linux': return 'Install the PHP CLI with your distribution package manager, for example: sudo apt install php-cli'
    case 'win32': return 'Install PHP with winget, then restart the terminal so php is on PATH.'
    default: return 'Install the PHP CLI and make the php command available on PATH.'
  }
}

function serve() {
  const php = spawnSync('php', ['--version'], { stdio: 'ignore' })
  if (php.error || php.status !== 0) {
    throw new Error(`PHP is required for the interactive WPT server. ${phpInstallHint()}`)
  }
  const result = spawnSync('php', ['-S', `localhost:${process.env.NWSAPI_WPT_PORT || '8000'}`, '-t', upstream, path.join(root, 'test/wpt/router.php')], {
    cwd: root, env: { ...process.env, BROWSER_ROOT: upstream, NWSAPI_ROOT: root }, stdio: 'inherit',
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}

function setup() {
  if (existsSync(upstream)) return verify()
  mkdirSync(path.dirname(upstream), { recursive: true })
  git(['clone', '--depth', '1', '--single-branch', '--filter=blob:none', '--no-checkout', '--branch', config.branch, config.url, upstream])
  git(['-C', upstream, 'sparse-checkout', 'set', '--cone', '--', ...config.sparse])
  git(['-C', upstream, 'fetch', '--depth', '1', '--filter=blob:none', 'origin', config.ref])
  git(['-C', upstream, 'checkout', '--detach', 'FETCH_HEAD', '--'])
  verify()
}

function verify() {
  const head = existsSync(upstream) ? execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() : null
  if (head !== config.ref) throw new Error(`${config.path} is not pinned at ${config.ref}; run npm run wpt:setup`)
  if (!existsSync(path.join(upstream, 'resources', 'testharness.js'))) throw new Error(`${config.path} does not contain the WPT harness resources`)
  if (execFileSync('git', ['-C', upstream, 'status', '--porcelain'], { encoding: 'utf8' }) !== '') throw new Error(`${config.path} is dirty; refusing to run modified upstream tests`)
  const tree = execFileSync('git', ['-C', upstream, '-c', 'core.quotePath=false', 'ls-tree', '-r', config.ref], { maxBuffer })
  if (createHash('sha256').update(tree).digest('hex') !== manifest) throw new Error(`${config.path} does not match its pinned tree manifest`)
}
