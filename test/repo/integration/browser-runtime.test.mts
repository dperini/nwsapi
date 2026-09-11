import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'acorn'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import installLegacy from '../../../dist/modules/nwsapi-legacy.js'
import { cases } from '../../../scripts/repo/bench/cases.mts'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'

test('browser lint rejects unsupported APIs and loops and accepts generated resolvers', t => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-browser-runtime-'),
  )
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(path.join(directory, 'src/core'), { recursive: true })
  copyFileSync(
    path.join(REPO_ROOT, 'package.json'),
    path.join(directory, 'package.json'),
  )
  // Match the real source override while keeping all test output outside the repo.
  const file = path.join(directory, 'src/core/nwsapi.mts')
  const lint = (code: string) => {
    writeFileSync(file, code)
    return spawnSync(
      process.execPath,
      [
        'node_modules/oxlint/bin/oxlint',
        '--config',
        '.config/oxlint.json',
        '--allow',
        'all',
        '--deny',
        'compat/compat',
        '--deny',
        'nwsapi/no-for-of',
        '--deny',
        'nwsapi/prefer-cached-loop-length',
        file,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
  }
  const rejected = lint(
    [
      '"text".includes("ex");',
      'String.fromCodePoint(0x1f600);',
      'void fetch("/");',
      'for (const value of [1]) { console.log(value); }',
      'for (var index = 0; index < values.length; index++) { console.log(values[index]); }',
    ].join('\n'),
  )
  expect(rejected.status).not.toBe(0)
  const messages = rejected.stdout + rejected.stderr
  for (const message of [
    'String.includes()',
    'String.fromCodePoint()',
    'fetch',
    'no-for-of',
    'prefer-cached-loop-length',
    'IE 11',
  ]) {
    expect(messages).toContain(message)
  }

  const { window } = new JSDOM('<main><input type="checkbox" checked></main>')
  t.onTestFinished(() => window.close())
  const engine = installLegacy(factory(window))
  const selectors = new Set([
    ...Object.values(cases).flatMap(groups => Object.values(groups).flat()),
    ':checked',
    ':default',
    ':placeholder-shown',
    ':read-only',
    ':read-write',
    ':required',
    ':optional',
    ':in-range',
    ':out-of-range',
    ':valid',
    ':invalid',
    ':dir(rtl)',
    ':nth-child(2n of .item)',
    ':nth-last-child(2 of .item)',
    '[*|lang="en"]',
  ])
  const output = [
    'if (typeof String.fromCodePoint === "function") { String.fromCodePoint(0x1f600); }',
    'for (var index = 0, length = values.length; index < length; index++) { console.log(values[index]); }',
  ]
  for (const LEGACY of [false, true]) {
    engine.configure({ LEGACY })
    for (const selector of selectors) {
      for (const mode of [false, true, null]) {
        const resolver = engine.compile(selector, mode, true)
        expect(resolver, selector).not.toBeNull()
        const code = `void (${resolver!.toString()});`
        parse(code, { ecmaVersion: 5, sourceType: 'script' })
        output.push(code)
      }
    }
  }
  const accepted = lint(output.join('\n'))
  expect(accepted.status, accepted.stdout + accepted.stderr).toBe(0)
})
