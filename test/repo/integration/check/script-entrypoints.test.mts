import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  checkScriptEntrypoints,
  discoverScriptEntrypoints,
  inspectEntrypointSource,
  runnerTargets,
} from '../../../../scripts/repo/check/script-entrypoints.mts'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-entrypoints-'))
  mkdirSync(path.join(root, 'scripts/repo/check'), { recursive: true })
  return root
}

test('extracts every local runner target from a package command', () => {
  expect(
    runnerTargets(
      'pnpm run build && node scripts/repo/run.mts "scripts/repo/a.mts"; node scripts/repo/run.mts scripts/repo/b.mts --json',
    ),
  ).toEqual(['scripts/repo/a.mts', 'scripts/repo/b.mts'])
})

test('detects executable guards and help behavior from syntax', () => {
  expect(
    inspectEntrypointSource(`
      // process.argv.includes('--help')
      const example = "isMainModule(import.meta.url)"
      if (process.argv.includes('--help')) console.log(example)
      if (isMainModule(import.meta.url)) await main()
    `),
  ).toEqual({ guarded: true, help: true })
  expect(
    inspectEntrypointSource(`const text = "process.argv.includes('--help')"`),
  ).toEqual({
    guarded: false,
    help: false,
  })
})

test('combines package targets with guarded repository scripts', t => {
  const root = fixture()
  t.onTestFinished(() => rmSync(root, { recursive: true }))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        alpha: 'node scripts/repo/run.mts scripts/repo/alpha.mts',
      },
    }),
  )
  writeFileSync(
    path.join(root, 'scripts/repo/alpha.mts'),
    `if (process.argv.includes('-h')) process.exit(0)`,
  )
  writeFileSync(
    path.join(root, 'scripts/repo/check/guarded.mts'),
    `if (isMainModule(import.meta.url)) await main()`,
  )
  expect(discoverScriptEntrypoints(root)).toEqual({
    entrypoints: [
      {
        file: 'scripts/repo/alpha.mts',
        packageScripts: ['alpha'],
        guarded: false,
        help: true,
      },
      {
        file: 'scripts/repo/check/guarded.mts',
        packageScripts: [],
        guarded: true,
        help: false,
      },
    ],
    errors: [],
  })
})

test('reports missing and escaping package targets', t => {
  const root = fixture()
  t.onTestFinished(() => rmSync(root, { recursive: true }))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        missing: 'node scripts/repo/run.mts scripts/repo/missing.mts',
        escaping: 'node scripts/repo/run.mts ../outside.mts',
      },
    }),
  )
  const report = discoverScriptEntrypoints(root)
  expect(report.errors).toHaveLength(2)
  expect(() => checkScriptEntrypoints(root)).toThrow()
})

test('expensive repository commands answer help without starting work', () => {
  for (const entry of [
    'scripts/repo/bench/build-compression.mts',
    'scripts/repo/bench/heap-snapshot.mts',
    'scripts/repo/bench/jsdom-override.mts',
    'scripts/repo/bench/native-heap-snapshot.mts',
    'scripts/repo/browser.mts',
  ]) {
    execFileSync(process.execPath, [entry, '--help'], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 5000,
    })
  }
})
import { execFileSync } from 'node:child_process'
