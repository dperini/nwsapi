import { packPackage } from '../../../scripts/repo/build/package.mts'
import type * as TestingLibrary from '@testing-library/dom'
import type * as NodeChildProcess from 'node:child_process'
import type * as NodeFs from 'node:fs'
import type * as Jsdom from 'jsdom'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const testingLibraryVersion = (
  require('@testing-library/dom/package.json') as { version: string }
).version
const jsdomVersion = (require('jsdom/package.json') as { version: string })
  .version

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
        dependencies: {
          jsdom: jsdomVersion,
          '@testing-library/dom': testingLibraryVersion,
        },
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
  const consumerRequire = createRequire(jsdomPackage)
  const installed = path.resolve(
    path.dirname(consumerRequire.resolve('@asamuzakjp/dom-selector')),
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
  assert.equal(consumerRequire('@asamuzakjp/dom-selector'), factory)
  const { JSDOM } = consumerRequire('jsdom') as typeof Jsdom
  const testingLibrary = consumerRequire(
    '@testing-library/dom',
  ) as typeof TestingLibrary
  const dom = new JSDOM(
    '<form><label for="email">Email address</label><input id="email" type="email" required><span id="label">Save changes</span><button aria-labelledby="label" data-testid="save">Save</button></form>',
  )
  try {
    const queries = testingLibrary.within(dom.window.document.body)
    const save = queries.getByRole('button', { name: 'Save changes' })
    assert.equal(save, queries.getByTestId('save'))
    assert.equal(queries.getByLabelText('Email address').id, 'email')
    save.setAttribute('data-testid', 'updated')
    assert.equal(queries.queryByTestId('save'), null)
    assert.equal(queries.getByTestId('updated'), save)
  } finally {
    dom.window.close()
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
}
