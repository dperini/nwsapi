import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, expect, test, vi } from 'vitest'
import {
  auditCandidates,
  candidateSignals,
  checkCandidates,
} from '../../../../../scripts/repo/check/wpt/candidates.mts'
import { checkInventory } from '../../../../../scripts/repo/check/wpt/inventory.mts'
import type * as RepoPaths from '../../../../../scripts/repo/lib/paths.mts'
import type * as NodeRunner from '../../../../../scripts/repo/lib/run-node.mts'

const state = vi.hoisted(() => ({
  root: '/tmp/nwsapi-candidate-test-' + process.pid,
  main: false,
}))
vi.mock('../../../../../scripts/repo/lib/paths.mts', async importOriginal => ({
  ...(await importOriginal<typeof RepoPaths>()),
  REPO_ROOT: state.root,
}))
vi.mock(
  '../../../../../scripts/repo/lib/run-node.mts',
  async importOriginal => ({
    ...(await importOriginal<typeof NodeRunner>()),
    isMainModule: (url: string) =>
      state.main && url.endsWith('/wpt/candidates.mts'),
  }),
)
vi.mock('../../../../../test/repo/e2e/upstream/manifest.mts', () => ({
  manifest: [
    { path: '/selected.html' },
    { path: '/selected.window.html', script: true },
  ],
}))
vi.mock('../../../../../scripts/repo/check/wpt/inventory.mts', () => ({
  checkInventory: vi.fn(),
}))
vi.mock('../../../../../scripts/repo/check/wpt/scope.mts', () => ({
  inspectWptScope: (entries: Array<{ path: string }>) => {
    if (entries[0]?.path === '/broken.window.html') {
      throw Object.assign(new Error('Unparsed candidate'), {
        code: 'UNPARSED_SCRIPT',
      })
    }
    return {
      issues: [
        { reason: 'Rendering' },
        { reason: 'API' },
        { reason: 'Rendering' },
        { reason: 'DOM' },
      ],
    }
  },
}))
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((_command: string, args: string[]) =>
    args.includes('rev-parse')
      ? 'revision\n'
      : 'selector-external.html\npseudo-existing.html\nplain.html\nselectors.css\n',
  ),
}))

const checkout = path.join(state.root, 'upstream/wpt')
const artifact = path.join(state.root, 'test/repo/e2e/upstream/candidates.json')
mkdirSync(path.join(checkout, 'resources'), { recursive: true })
mkdirSync(path.dirname(artifact), { recursive: true })
afterAll(() => rmSync(state.root, { recursive: true, force: true }))
const files = {
  'selected.html':
    '<script src="testharness.js"></script><script>node.matches("div")</script>',
  'selected.window.js': 'node.matches("div")',
  'resources/helper.html':
    '<script src="testharness.js"></script><script>node.matches("div")</script>',
  'plain.html': '<p>plain</p>',
  'no-harness.html': '<script>node.matches("div")</script>',
  'query.html':
    '<script src="testharness.js"></script><script>node.matches("div")</script>',
  'parse.any.js': 'test_valid_selector("div")',
  'broken.window.js': 'document.querySelector("div"); const =',
  'pseudo-existing.html': '<p>plain</p>',
}
Object.entries(files).forEach(([file, source]) =>
  writeFileSync(path.join(checkout, file), source),
)

test('discovery prefilter recognizes selector APIs but leaves scope decisions to AST review', () => {
  expect(candidateSignals('node.querySelector("div")')).toBe(true)
  expect(candidateSignals('// node.matches("div")')).toBe(true)
  expect(candidateSignals('node.textContent')).toBe(false)
})

test('candidate audits exclude reviewed resources, deduplicate reasons and track sparse checkout gaps', () => {
  const report = auditCandidates()
  expect(report.revision).toBe('revision')
  expect(report.outsideCheckout).toEqual(['selector-external.html'])
  expect(report.candidates.map(candidate => candidate.path)).toEqual([
    '/broken.window.js',
    '/parse.any.js',
    '/query.html',
  ])
  expect(report.candidates[0]?.reasons).toHaveLength(1)
  expect(report.candidates[1]).toMatchObject({
    parsing: true,
    reasons: ['API', 'DOM', 'Rendering'],
  })
  expect(report.candidates[2]).toMatchObject({
    parsing: false,
    reasons: ['API', 'DOM', 'Rendering'],
  })
})

test('candidate checks require the reviewed artifact and record generated reports for review', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(() => checkCandidates()).toThrow()
  const report = checkCandidates(true)
  expect(checkInventory).toHaveBeenCalledWith({ quiet: true })
  expect(JSON.parse(readFileSync(artifact, 'utf8'))).toEqual(report)
  expect(checkCandidates()).toEqual(report)
  expect(log).toHaveBeenCalledTimes(2)
  writeFileSync(artifact, '{}')
  expect(() => checkCandidates()).toThrow()
})

test('candidate CLI rejects unknown options and supports review writes and subsequent checks', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const argv = process.argv
  state.main = true
  try {
    process.argv = ['node', 'candidates.mts', '--unknown']
    vi.resetModules()
    await expect(
      import('../../../../../scripts/repo/check/wpt/candidates.mts'),
    ).rejects.toThrow()
    process.argv = ['node', 'candidates.mts', '--write']
    vi.resetModules()
    await import('../../../../../scripts/repo/check/wpt/candidates.mts')
    process.argv = ['node', 'candidates.mts']
    vi.resetModules()
    await import('../../../../../scripts/repo/check/wpt/candidates.mts')
  } finally {
    process.argv = argv
    state.main = false
  }
})
