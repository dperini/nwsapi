import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import {
  classifyPool,
  classifyScript,
} from '../../../../../../scripts/repo/check/wpt/native/scope.mts'
import type { passingUniverse } from '../../../../../../scripts/repo/check/wpt/native/pool.mts'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((_command: string, args: string[]) =>
    args.includes('rev-parse') ? 'revision\n' : '',
  ),
}))

test('script classification keeps explicit selector registrations and ignores other APIs', () => {
  const result = classifyScript(
    'test(() => assert_true(node.matches("div")), "selector"); test(() => assert_equals(node.textContent, "value"), "text")',
    '/page.js',
  )
  expect([...result.keys()]).toEqual(['selector'])
  expect(result.get('selector')?.kind).toBe('selector-matching')
})

test('pool classification resolves helpers and caches page variants without executing tests', t => {
  const checkout = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-scope-'))
  t.onTestFinished(() => rmSync(checkout, { recursive: true, force: true }))
  mkdirSync(path.join(checkout, 'css'))
  const sources: Record<string, string> = {
    'matching.html':
      '<title>Unnamed selector</title><script src="/resources/testharness.js"></script><script src="helper.js"></script><script>test(() => check(document), "selector"); test(() => check(document), "selector two")</script>',
    'helper.js': 'function check(node) { assert_true(node.matches("div")) }',
    'missing.html': '<script src="missing.js"></script>',
    'external.html': '<script src="https://example.test/helper.js"></script>',
    'invalid.html': '<script>const =</script>',
    'rendering.html':
      '<script>test(() => assert_equals(getComputedStyle(node).color, "red"), "render"); test(() => assert_equals(node.textContent, "text"), "text")</script>',
    'unnamed.html':
      '<title>Named by page</title><script>test(() => assert_true(node.matches("div")))</script>',
    'removed.html':
      '<script src="/resources/WebIDLParser.js"></script><script>test(() => assert_true(node.matches("div")), "selector")</script>',
  }
  const manifest: Record<string, unknown> = {}
  const entries = Object.entries(sources)
  for (let i = 0, length = entries.length; i < length; i += 1) {
    const [file, source] = entries[i]!
    writeFileSync(path.join(checkout, 'css', file), source)
    if (file.endsWith('.html')) {
      manifest[file] = ['hash', ['/css/' + file, {}]]
    }
  }
  writeFileSync(
    path.join(checkout, 'MANIFEST.json'),
    JSON.stringify({ items: { testharness: { css: manifest } } }),
  )
  const cases = [
    ['matching.html', 'selector'],
    ['matching.html', 'selector two'],
    ['missing.html', null],
    ['external.html', null],
    ['invalid.html', null],
    ['rendering.html', null],
    ['unnamed.html', 'Named by page'],
    ['removed.html', 'selector'],
  ] as const
  const pool: ReturnType<typeof passingUniverse> = {
    browser: 'browser',
    revision: 'revision',
    scope: 'candidate-native-passes',
    planned: cases.length,
    observed: cases.length,
    disabled: 0,
    cases: cases.map(([file, subtest]) => ({
      test: '/css/' + file,
      subsuite: '',
      subtest,
      type: 'testharness',
    })),
  }
  const result = classifyPool(pool, checkout)
  expect(result.selected.cases).toHaveLength(4)
  expect(result.totals).toEqual({
    'selector-matching': 4,
    unresolved: 3,
    'other-api': 1,
  })
  expect(result.finalized).toBe(false)
  expect(
    result.pages.find(page => page.test === '/css/matching.html')?.counts,
  ).toEqual({ 'selector-matching': 2 })
})
