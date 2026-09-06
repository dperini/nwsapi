import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Test the published file layout and an override, not a patched module cache.
const { execFileSync } = require('node:child_process')
const {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require('node:fs')
import os from 'node:os'
import path from 'node:path'
const directory = mkdtempSync(
  path.resolve(os.tmpdir(), 'nwsapi-jsdom-adapter-'),
)
const isPnpm = process.env.npm_config_user_agent?.startsWith('pnpm/')
const cli = process.env.npm_execpath
const command =
  cli && /\.[cm]?js$/.test(cli)
    ? process.execPath
    : cli || (process.platform === 'win32' ? 'npm.cmd' : 'npm')
const prefix = command === process.execPath ? [cli] : []
const run = (args, options) =>
  execFileSync(command, [...prefix, ...args], options)

try {
  const packResult = JSON.parse(
    run(
      [
        ...(isPnpm ? ['--reporter=silent'] : []),
        'pack',
        '--json',
        '--pack-destination',
        directory,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    ),
  )
  // npm 11 returns an array; npm 12 keys results by package name.
  const packed = Array.isArray(packResult)
    ? packResult[0]
    : packResult.nwsapi || packResult
  assert.deepEqual(
    packed.files.map(file => file.path).toSorted(),
    [
      'LICENSE',
      'README.md',
      'dist/nwsapi.min.js',
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
        dependencies: { jsdom: '30.0.1' },
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
      '.config/vitest.config.mts',
      'test/jsdom-adapter.test.mts',
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        JSDOM_PACKAGE: jsdomPackage,
      },
    },
  )
} finally {
  rmSync(directory, { recursive: true, force: true })
}
