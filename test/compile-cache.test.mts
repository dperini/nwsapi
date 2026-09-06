import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { COMPILE_CACHE_DIR, REPO_ROOT } from '../scripts/lib/paths.mts'

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-cache-test-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const entry = path.join(directory, 'entry.mjs')
  writeFileSync(
    entry,
    `
    import { execFileSync } from 'node:child_process'
    import { getCompileCacheDir } from 'node:module'
    const nested = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
      'import { getCompileCacheDir } from "node:module"; console.log(JSON.stringify({cache:process.env.NODE_COMPILE_CACHE, active:!!getCompileCacheDir(), disabled:process.env.NODE_DISABLE_COMPILE_CACHE}))'
    ], {encoding:'utf8'}))
    console.log(JSON.stringify({cache:process.env.NODE_COMPILE_CACHE, active:!!getCompileCacheDir(), args:process.argv.slice(2), nested}))
    process.exitCode = Number(process.env.CACHE_TEST_EXIT || 0)
  `,
  )
  return (
    env: NodeJS.ProcessEnv = { __proto__: null },
    args: string[] = [],
  ) => {
    const environment: NodeJS.ProcessEnv = {
      __proto__: null,
      ...process.env,
      ...env,
    }
    for (const key of [
      'NODE_COMPILE_CACHE',
      'NODE_DISABLE_COMPILE_CACHE',
      'NODE_V8_COVERAGE',
    ]) {
      if (!(key in env)) {
        delete environment[key]
      }
    }
    return spawnSync(process.execPath, ['scripts/run.mts', entry, ...args], {
      cwd: REPO_ROOT,
      env: environment,
      encoding: 'utf8',
    })
  }
}

test('the umbrella shares its default compile cache with children and grandchildren', t => {
  const result = fixture(t)()
  expect(result.status).toBe(0)
  const value = JSON.parse(result.stdout)
  expect(value.cache).toBe(COMPILE_CACHE_DIR)
  expect(value.active).toBe(true)
  expect(value.nested).toMatchObject({ cache: COMPILE_CACHE_DIR, active: true })
})

test('the umbrella preserves explicit cache settings and its child exit status', t => {
  const cache = path.join(os.tmpdir(), 'nwsapi-custom-compile-cache')
  const result = fixture(t)(
    {
      NODE_COMPILE_CACHE: cache,
      NODE_DISABLE_COMPILE_CACHE: '1',
      CACHE_TEST_EXIT: '23',
    },
    ['argument with spaces'],
  )
  expect(result.status).toBe(23)
  const value = JSON.parse(result.stdout)
  expect(value.cache).toBe(cache)
  expect(value.active).toBe(false)
  expect(value.args).toEqual(['argument with spaces'])
  expect(value.nested).toMatchObject({ cache, active: false, disabled: '1' })
})

for (const flag of ['--coverage', '--coverage=true', '--coverage.enabled']) {
  test(`coverage disables inherited caches for ${flag}`, t => {
    const result = fixture(t)({ NODE_COMPILE_CACHE: COMPILE_CACHE_DIR }, [flag])
    expect(result.status).toBe(0)
    const value = JSON.parse(result.stdout)
    expect(value.active).toBe(false)
    expect(value.nested).toMatchObject({ active: false, disabled: '1' })
  })
}
