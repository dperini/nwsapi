import {
  NODE_INTEROP_VERSIONS,
  nodeInteropEnvironment,
  resolveNodeRuntime,
} from '../../../scripts/repo/node.mts'
import { packPackage } from '../../../scripts/repo/build/package.mts'
import type * as NodeChildProcess from 'node:child_process'
import type * as NodeFs from 'node:fs'
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
const { copyFileSync, mkdtempSync, rmSync, writeFileSync } =
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
          nwsapi: 'file:' + path.resolve(directory, tarball),
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
  const consumer = path.join(directory, 'node-interop.mts')
  copyFileSync(new URL('./fixture/node-interop.mts', import.meta.url), consumer)
  for (const version of NODE_INTEROP_VERSIONS) {
    const executable = resolveNodeRuntime(version)
    console.log(`Testing package interoperability on Node ${version}`)
    execFileSync(executable, [consumer], {
      cwd: directory,
      env: nodeInteropEnvironment(),
      stdio: 'inherit',
    })
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
}
