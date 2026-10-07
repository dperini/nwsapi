import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import nock from 'nock'
import type * as Yaml from 'yaml'
import {
  addSoakException,
  checkSoak,
  cleanSoakExceptions,
  soakPolicy,
  syncNpmSoak,
} from '../../../scripts/repo/soak.mts'
import { updateDependencies } from '../../../scripts/repo/dependency/update.mts'

const workspace =
  '# policy\nminimumReleaseAge: 1440\ncatalog:\n  example: 1.0.0\n'
const published = '2026-09-01T12:00:00.000Z'
const fresh = Date.parse('2026-09-01T13:00:00.000Z')
const directories: string[] = []
afterEach(() => {
  directories.forEach(directory =>
    rmSync(directory, { recursive: true, force: true }),
  )
  directories.length = 0
  vi.doUnmock('../../../scripts/repo/lib/paths.mts')
  vi.doUnmock('../../../scripts/repo/lib/run-node.mts')
  vi.doUnmock('yaml')
  vi.doUnmock('node:fs')
  vi.resetModules()
})

async function localModule(main = false) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-soak-test-'))
  directories.push(root)
  const workspacePath = path.join(root, 'pnpm-workspace.yaml')
  writeFileSync(workspacePath, workspace)
  writeFileSync(path.join(root, '.npmrc'), 'min-release-age=1\n')
  vi.doMock('../../../scripts/repo/lib/paths.mts', async original => ({
    ...(await original<object>()),
    REPO_ROOT: root,
    WORKSPACE_PATH: workspacePath,
  }))
  vi.doMock('../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: (url: string) => main && url.endsWith('/soak.mts'),
  }))
  vi.resetModules()
  return {
    root,
    workspacePath,
    load: () => import('../../../scripts/repo/soak.mts'),
  }
}

test('invalid excludes and expired checks fail closed', () => {
  for (const excludes of ['{}', '[42]', '[example@latest]']) {
    expect(() =>
      soakPolicy(workspace + 'minimumReleaseAgeExclude: ' + excludes),
    ).toThrow()
  }
  const added = addSoakException(workspace, 'example@1.0.0', published, fresh)
  expect(() => checkSoak(added, syncNpmSoak(added, ''))).toThrow()
  const kept = addSoakException(
    addSoakException(workspace, 'zeta@1.0.0', published, fresh),
    'alpha@1.0.0',
    published,
    fresh,
  )
  vi.spyOn(Date, 'now').mockReturnValue(fresh)
  expect(() => checkSoak(kept, syncNpmSoak(kept, ''))).not.toThrow()
  expect(
    soakPolicy(cleanSoakExceptions(kept, fresh + 86_400_000)).excludes,
  ).toEqual([])
})

test('cleanup retains fresh exceptions when an older sibling expires', () => {
  const oldTime = new Date(fresh - 48 * 60 * 60 * 1000).toISOString()
  const first = addSoakException(
    workspace,
    'old@1.0.0',
    oldTime,
    fresh - 47 * 60 * 60 * 1000,
  )
  const both = addSoakException(first, 'fresh@1.0.0', published, fresh)
  expect(soakPolicy(cleanSoakExceptions(both, fresh)).excludes).toEqual([
    'fresh@1.0.0',
  ])
})

test.each([
  'nonsequence',
  'nonscalar',
  'collection-comment',
  'missing-comment',
])('document guards handle %s metadata', async mode => {
  const before = addSoakException(workspace, 'first@1.0.0', published, fresh)
  const input = addSoakException(before, 'second@1.0.0', published, fresh)
  vi.doMock('yaml', async original => {
    const actual = await original<typeof Yaml>()
    return {
      ...actual,
      parseDocument: (text: string) => {
        const doc = actual.parseDocument(text)
        const entries = doc.get('minimumReleaseAgeExclude')
        if (mode === 'nonsequence') {
          doc.set('minimumReleaseAgeExclude', { invalid: true })
        } else if (actual.isSeq(entries)) {
          if (mode === 'nonscalar') {
            entries.items[0] = doc.createNode({ invalid: true })
          } else {
            const first = entries.items[0]
            if (actual.isScalar(first)) {
              entries.commentBefore = ` published: ${published} | removable: 2026-09-02T12:00:00.000Z`
              first.commentBefore = null
            }
            if (mode === 'missing-comment') {
              const second = entries.items[1]
              if (actual.isScalar(second)) {
                second.commentBefore = null
              }
            }
          }
        }
        return doc
      },
    }
  })
  vi.resetModules()
  const module = await import('../../../scripts/repo/soak.mts')
  if (mode === 'collection-comment') {
    expect(module.cleanSoakExceptions(input, fresh)).toBe(input)
  } else {
    expect(() => module.cleanSoakExceptions(input, fresh)).toThrow()
  }
  if (mode === 'nonsequence') {
    expect(() =>
      module.addSoakException(input, 'third@1.0.0', published, fresh),
    ).toThrow()
  }
})

test('refresh synchronizes local files and preserves an already current policy', async () => {
  const { root, workspacePath, load } = await localModule()
  const added = addSoakException(workspace, 'example@1.0.0', published, fresh)
  writeFileSync(workspacePath, added)
  writeFileSync(path.join(root, '.npmrc'), 'min-release-age=7\n')
  const module = await load()
  module.refreshSoak()
  expect(soakPolicy(readFileSync(workspacePath, 'utf8')).excludes).toEqual([])
  expect(readFileSync(path.join(root, '.npmrc'), 'utf8')).toBe(
    'min-release-age=1\n',
  )
  module.refreshSoak()
  expect(() => module.checkSoak()).not.toThrow()
})

test.each([
  { args: ['--check'] },
  { args: ['invalid'] },
  { args: ['--bypass'] },
  { args: ['--bypass', 'example@latest'] },
  { args: ['--bypass', 'example@1.0.0', 'extra'] },
])('CLI validates invocation %#', async ({ args }) => {
  const { load } = await localModule(true)
  const argv = process.argv
  process.argv = [argv[0]!, '/soak.mts', ...args]
  try {
    if (args[0] === '--check') {
      await expect(load()).resolves.toBeDefined()
    } else {
      await expect(load()).rejects.toThrow()
    }
  } finally {
    process.argv = argv
  }
})

test.each(['success', 'http', 'missing', 'no-time'])(
  'CLI registry bypass handles %s responses',
  async mode => {
    const { root, workspacePath, load } = await localModule(true)
    const publication = new Date(Date.now() - 1000).toISOString()
    const body =
      mode === 'missing'
        ? { time: {} }
        : mode === 'no-time'
          ? {}
          : { time: { '1.0.0': publication } }
    const service = nock('https://registry.npmjs.org')
      .get('/example')
      .reply(mode === 'http' ? 404 : 200, mode === 'http' ? '' : body)
    const argv = process.argv
    process.argv = [argv[0]!, '/soak.mts', '--bypass', 'example@1.0.0']
    vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      if (mode === 'success') {
        await load()
        expect(
          soakPolicy(readFileSync(workspacePath, 'utf8')).excludes,
        ).toEqual(['example@1.0.0'])
        expect(() =>
          checkSoak(
            readFileSync(workspacePath, 'utf8'),
            readFileSync(path.join(root, '.npmrc'), 'utf8'),
          ),
        ).not.toThrow()
      } else {
        await expect(load()).rejects.toThrow()
      }
      expect(service.isDone()).toBe(true)
    } finally {
      process.argv = argv
    }
  },
)

test('exact scoped bypasses expire at the publication timestamp plus the configured delay', () => {
  const added = addSoakException(
    workspace,
    '@scope/example@2.0.0',
    published,
    fresh,
  )
  expect(soakPolicy(added).excludes).toEqual(['@scope/example@2.0.0'])
  expect(added).toContain('removable: 2026-09-02T12:00:00.000Z')
  expect(
    addSoakException(added, '@scope/example@2.0.0', published, fresh),
  ).toBe(added)
  expect(cleanSoakExceptions(added, fresh)).toBe(added)
  const cleaned = cleanSoakExceptions(added, Date.parse('2026-09-02T12:00:00Z'))
  expect(soakPolicy(cleaned).excludes).toEqual([])
  expect(cleaned).toContain('# policy')
  expect(cleaned).toContain('example: 1.0.0')
})

test('bypasses reject broad patterns and unverifiable publication dates', () => {
  for (const spec of [
    'example',
    'example@latest',
    '@scope/*@1.0.0',
    'example@^1.0.0',
  ]) {
    expect(() => addSoakException(workspace, spec, published, fresh)).toThrow()
  }
  for (const date of ['invalid', '2027-01-01']) {
    expect(() =>
      addSoakException(workspace, 'example@1.0.0', date, fresh),
    ).toThrow()
  }
  expect(
    addSoakException(workspace, 'example@1.0.0', published, fresh + 86_400_000),
  ).toBe(workspace)
})

test('soak check rejects inconsistent managers and missing annotations', () => {
  checkSoak(workspace, 'min-release-age=1\n')
  expect(() => checkSoak(workspace, 'min-release-age=7\n')).toThrow()
  expect(() => checkSoak(workspace, '')).toThrow()
  expect(() =>
    cleanSoakExceptions(
      workspace + "minimumReleaseAgeExclude:\n  - 'example@1.0.0'\n",
    ),
  ).toThrow()
  for (const minutes of ['null', '-1', '1.1', 'Infinity', 'true']) {
    expect(() => soakPolicy(`minimumReleaseAge: ${minutes}`)).toThrow()
  }
})

test('npm synchronization preserves unrelated settings and removes expired bypasses', () => {
  const before =
    'save-exact=true\nmin-release-age=7\nmin-release-age-exclude[]=old@1.0.0\n'
  const after = syncNpmSoak(workspace, before)
  expect(after).toBe('save-exact=true\nmin-release-age=1\n')
  checkSoak(workspace, after)
})

test('policy preparation failures prevent both registry updates and installation', () => {
  const calls: string[] = []
  expect(() =>
    updateDependencies(
      false,
      () => {
        calls.push('taze')
      },
      () => {
        calls.push('install')
      },
      () => {
        throw new Error('policy')
      },
    ),
  ).toThrow()
  expect(calls).toEqual([])
})
