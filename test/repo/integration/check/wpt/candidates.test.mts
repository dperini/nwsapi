import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { auditCandidates } from '../../../../../scripts/repo/check/wpt/candidates.mts'

test('candidate discovery catches additions, edits, wrappers, and scope blockers', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-wpt-candidates-'))
  t.onTestFinished(() => rmSync(root, { recursive: true }))
  const checkout = path.join(root, 'upstream/wpt')
  mkdirSync(checkout, { recursive: true })
  const write = (file: string, source: string) =>
    writeFileSync(path.join(checkout, file), source)
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', checkout, ...args], { stdio: 'pipe' })
  const harness = '<script src="/resources/testharness.js"></script>'
  write(
    'matching.html',
    harness + '<script>assert_true(el["matches"]("p"))</script>',
  )
  write(
    'rendering.html',
    harness +
      '<script>assert_equals(el.matches("p"), el.offsetWidth > 0)</script>',
  )
  write('wrapped.window.js', 'test(() => assert_true(el.matches("p")))')
  write(
    'unrelated.html',
    harness + '<script>assert_equals(document.title, "example")</script>',
  )
  git('init', '-q')
  git('add', '.')
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'Fixture',
  )
  const before = auditCandidates(root)
  expect(before.candidates.map(entry => entry.path)).toEqual([
    '/matching.html',
    '/rendering.html',
    '/wrapped.window.js',
  ])
  expect(before.candidates[0]!.reasons).toEqual([])
  expect(before.candidates[1]!.reasons.join()).toContain('offsetWidth')
  expect(before.candidates[2]!.reasons).toEqual([])
  write(
    'matching.html',
    harness + '<script>assert_true(el.matches("div"))</script>',
  )
  write(
    'added.html',
    harness + '<script>assert_equals(el.closest("p"), el)</script>',
  )
  const after = auditCandidates(root)
  expect(after.candidates).toHaveLength(4)
  expect(
    after.candidates.find(entry => entry.path === '/matching.html')!.sha256,
  ).not.toBe(before.candidates[0]!.sha256)
})
