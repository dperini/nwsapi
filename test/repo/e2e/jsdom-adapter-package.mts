import { packPackage } from '../../../scripts/repo/build/package.mts'
import type * as NodeChildProcess from 'node:child_process'
import type * as NodeFs from 'node:fs'
import { createRequire } from 'node:module'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

// Test the published file layout and an override, not a patched module cache.
const { execFileSync } =
  require('node:child_process') as typeof NodeChildProcess
const { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } =
  require('node:fs') as typeof NodeFs
import os from 'node:os'
import path from 'node:path'
const directory = mkdtempSync(
  path.resolve(os.tmpdir(), 'nwsapi-jsdom-adapter-'),
)
const isPnpm = process.env['npm_config_user_agent']?.startsWith('pnpm/')
const cli = process.env['npm_execpath']
const command =
  cli && /\.[cm]?js$/.test(cli)
    ? process.execPath
    : cli || (process.platform === 'win32' ? 'npm.cmd' : 'npm')
const prefix = command === process.execPath ? [cli!] : []
const run = (
  args: string[],
  options: NodeChildProcess.ExecFileSyncOptionsWithStringEncoding,
) => execFileSync(command, [...prefix, ...args], options)

try {
  const packed = await packPackage(directory)
  assert.deepEqual(
    packed.files.map((file: { path: string }) => file.path).toSorted(),
    [
      'LICENSE',
      'README.md',
      'bin/nwsapi.js',
      'dist/external/unicode.js',
      'dist/external/unicode.d.ts',
      'src/modules/nwsapi-legacy.js',
      'package.json',
      'src/dom-selector.js',
      'src/modules/nwsapi-jquery.js',
      'src/modules/nwsapi-traversal.js',
      'src/nwsapi.js',
    ].toSorted(),
  )
  const tarball = packed.filename
  writeFileSync(
    path.resolve(directory, 'package.json'),
    JSON.stringify(
      {
        name: 'nwsapi-jsdom-adapter-test',
        private: true,
        dependencies: { jsdom: '30.0.1', '@testing-library/dom': '10.4.1' },
        overrides: isPnpm
          ? undefined
          : {
              '@asamuzakjp/dom-selector':
                'file:' + path.resolve(directory, tarball),
            },
      },
      null,
      2,
    ),
  )
  if (isPnpm) {
    writeFileSync(
      path.resolve(directory, 'pnpm-workspace.yaml'),
      'overrides:\n  "@asamuzakjp/dom-selector": ' +
        JSON.stringify('file:' + path.resolve(directory, tarball)) +
        '\n',
    )
  }
  run(
    [
      'install',
      '--ignore-scripts',
      // This isolated consumer intentionally installs our freshly built tarball.
      ...(isPnpm ? [] : ['--package-lock=false', '--allow-file=all']),
    ],
    {
      cwd: directory,
      stdio: 'inherit',
      encoding: 'utf8',
    },
  )
  const jsdomPackage = realpathSync(
    path.resolve(directory, 'node_modules/jsdom/package.json'),
  )
  const installed = path.resolve(
    path.dirname(
      createRequire(jsdomPackage).resolve('@asamuzakjp/dom-selector'),
    ),
    '..',
  )
  const metadata = JSON.parse(
    readFileSync(path.resolve(installed, 'package.json'), 'utf8'),
  )
  assert.deepEqual(metadata.bin, { nwsapi: './bin/nwsapi.js' })
  const cliOutput = execFileSync(
    process.execPath,
    [
      path.resolve(installed, metadata.bin.nwsapi),
      'compile',
      '--json',
      '.card',
    ],
    { cwd: directory, encoding: 'utf8' },
  )
  assert.equal(JSON.parse(cliOutput).selector, '.card')
  assert.equal(metadata.main, './src/nwsapi')
  assert.equal(metadata.type, undefined)
  assert.equal(metadata.exports, undefined)
  const factory = require(installed)
  assert.equal(typeof factory, 'function')
  assert.equal(factory, require(path.resolve(installed, 'src/nwsapi.js')))
  assert.equal(
    factory.DOMSelector,
    require(path.resolve(installed, 'src/dom-selector.js')),
  )
  const vitest = path.resolve(
    require.resolve('vitest/package.json'),
    '../vitest.mjs',
  )
  execFileSync(
    process.execPath,
    [
      vitest,
      'run',
      '--config',
      '.config/repo/vitest.config.mts',
      'test/repo/integration/jsdom-adapter.test.mts',
      'test/repo/integration/adapter/jsdom/readers.test.mts',
    ],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      encoding: 'utf8',
      env: {
        ...process.env,
        JSDOM_PACKAGE: jsdomPackage,
      },
    },
  )
} finally {
  rmSync(directory, { recursive: true, force: true })
}
