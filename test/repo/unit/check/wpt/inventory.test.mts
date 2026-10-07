import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, expect, test, vi } from 'vitest'
import {
  checkInventory,
  fetchInventory,
  inspectSelectorCalls,
  scanInventory,
} from '../../../../../scripts/repo/check/wpt/inventory.mts'
import type * as RepoPaths from '../../../../../scripts/repo/lib/paths.mts'
import type * as NodeRunner from '../../../../../scripts/repo/lib/run-node.mts'

const state = vi.hoisted(() => ({
  root: '/tmp/nwsapi-inventory-test-' + process.pid,
  revision: 'revision',
  tree: '',
  files: {} as Record<string, string>,
  downloadError: false,
  archiveDirectory: '',
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
      state.main && url.endsWith('/wpt/inventory.mts'),
  }),
)
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((command: string, args: string[]) => {
    if (command === 'curl') {
      state.archiveDirectory = path.dirname(args[args.indexOf('--output') + 1]!)
      if (state.downloadError) {
        throw Object.assign(new Error('Download failure'), {
          code: 'DOWNLOAD_FAILED',
        })
      }
    }
    if (command === 'tar') {
      const root = args[args.indexOf('-C') + 1]!
      const entries = Object.entries(state.files)
      for (let i = 0, length = entries.length; i < length; i += 1) {
        const [file, source] = entries[i]!
        writeFileSync(path.join(root, file), source)
      }
    }
    return args.includes('rev-parse')
      ? state.revision
      : args.includes('ls-tree')
        ? state.tree
        : ''
  }),
}))

mkdirSync(path.join(state.root, 'test/repo/e2e/upstream'), { recursive: true })
afterAll(() => rmSync(state.root, { recursive: true, force: true }))
const artifact = path.join(state.root, 'test/repo/e2e/upstream/inventory.json')

function inventoryFiles() {
  state.files = {
    'selector.html':
      '<script src="/resources/testharness.js"></script><script>assert_true(document.querySelector("div")); document.querySelector("p")</script>',
    'plain.html': '<p>plain</p>',
    'supports.html': '<script>CSS.supports("selector(div)")</script>',
    'helper.js': 'test_valid_selector("div")',
  }
  state.tree =
    Object.entries(state.files)
      .map(([file, source]) => {
        const bytes = Buffer.from(source)
        const digest = createHash('sha1')
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest('hex')
        return `100644 blob ${digest}\t${file}\0`
      })
      .join('') +
    '120000 blob skipped\tlink.html\0' +
    '100644 blob skipped\tstyle.css\0'
}

test('selector inspection reports parsed API calls and distinguishes harness, assertions and validity', () => {
  expect(
    inspectSelectorCalls(
      '<script src="/resources/testharness.js"></script><script src="/resources/testdriver.js"></script><script>assert_true(node.matches("div")); node.matches("p"); node[method]("unknown"); node.other(); test_invalid_selector(":bad")</script><script>const =</script>',
      true,
    ),
  ).toEqual({
    harness: true,
    testdriver: true,
    calls: { matches: 2 },
    assertions: 1,
    validity: 1,
    unparsed: 1,
  })
  expect(
    inspectSelectorCalls(
      'test(() => assert_true(node.closest("div")), "case")',
      false,
    ),
  ).toMatchObject({ harness: true, calls: { closest: 1 }, assertions: 1 })
})

test('inventory scanning validates blob identities and filters links and unrelated files', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-inventory-sources-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  inventoryFiles()
  Object.entries(state.files).forEach(([file, source]) =>
    writeFileSync(path.join(root, file), source),
  )
  const report = scanInventory(root)
  expect(report.scanned).toBe(4)
  expect(report.candidates.map(candidate => candidate.path)).toEqual([
    '/selector.html',
    '/supports.html',
    '/helper.js',
  ])
  expect(report.candidates[0]).toMatchObject({
    harness: true,
    calls: { querySelector: 2 },
    assertions: 1,
  })
  writeFileSync(path.join(root, 'selector.html'), 'changed')
  expect(() => scanInventory(root)).toThrow()
})

test('inventory checks honor quiet mode and reject reports from a different pin', () => {
  const report = { revision: 'revision', scanned: 4, candidates: [] }
  writeFileSync(artifact, JSON.stringify(report))
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(checkInventory({ quiet: true })).toEqual(report)
  expect(log).not.toHaveBeenCalled()
  expect(checkInventory()).toEqual(report)
  expect(log).toHaveBeenCalledOnce()
  state.revision = 'different'
  expect(() => checkInventory()).toThrow()
  state.revision = 'revision'
})

test('fetching scans extracted inputs and cleans its directory after download failure', () => {
  inventoryFiles()
  expect(fetchInventory().scanned).toBe(4)
  expect(existsSync(state.archiveDirectory)).toBe(false)
  state.downloadError = true
  expect(() => fetchInventory()).toThrow(
    expect.objectContaining({ code: 'DOWNLOAD_FAILED' }),
  )
  expect(existsSync(state.archiveDirectory)).toBe(false)
  state.downloadError = false
})

test('inventory CLI checks option combinations and writes only reviewed source scans', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-inventory-cli-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  inventoryFiles()
  Object.entries(state.files).forEach(([file, source]) =>
    writeFileSync(path.join(root, file), source),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const argv = process.argv
  state.main = true
  try {
    const invalid = [
      ['--write'],
      ['--source', root],
      ['--fetch'],
      ['--write', '--source', root, '--fetch'],
    ]
    for (let i = 0, length = invalid.length; i < length; i += 1) {
      process.argv = ['node', 'inventory.mts', ...invalid[i]!]
      vi.resetModules()
      await expect(
        import('../../../../../scripts/repo/check/wpt/inventory.mts'),
      ).rejects.toThrow()
    }
    const valid = [['--write', '--source', root], ['--write', '--fetch'], []]
    for (let i = 0, length = valid.length; i < length; i += 1) {
      process.argv = ['node', 'inventory.mts', ...valid[i]!]
      vi.resetModules()
      await import('../../../../../scripts/repo/check/wpt/inventory.mts')
      expect(JSON.parse(readFileSync(artifact, 'utf8')).scanned).toBe(4)
    }
  } finally {
    state.main = false
    process.argv = argv
  }
})
