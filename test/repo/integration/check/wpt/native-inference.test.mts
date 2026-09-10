import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  inferCase,
  inferScripts,
} from '../../../../../scripts/repo/check/wpt/native-inference.mts'
import { pageMetadata } from '../../../../../scripts/repo/check/wpt/native-metadata.mts'
import { REPO_ROOT } from '../../../../../scripts/repo/lib/paths.mts'

const analyze = (files: string[]) =>
  inferScripts(
    files.flatMap(file => {
      const document = readFileSync(
        path.join(REPO_ROOT, 'upstream/wpt', file),
        'utf8',
      )
      return pageMetadata(document, file).scripts.map(source => ({
        file,
        source,
      }))
    }),
  ).profiles

test('pinned WPT selector fixtures survive helper and alias inference', () => {
  const profiles = analyze([
    '/dom/nodes/Element-matches.html',
    '/dom/nodes/Element-matches.js',
    '/dom/nodes/Element-matches-init.js',
    '/dom/nodes/ParentNode-querySelector-All.js',
    '/dom/nodes/selectors.js',
  ])
  expect(inferCase('Detached Element.matches(null)', profiles)?.category).toBe(
    'selector-matching',
  )
  expect(
    inferCase('Detached Element supports matches', profiles)?.category,
  ).toBe('other-api')
  expect(
    inferCase('Detached Element.matches no parameter', profiles)?.category,
  ).toBe('selector-parsing')
})

test('pinned WPT transformed collections and direction helpers remain matching requirements', () => {
  const relative = analyze(['/css/selectors/has-relative-argument.html'])
  expect(
    inferCase('.x:has(.a) matches expected elements', relative)?.category,
  ).toBe('selector-matching')
  const direction = analyze([
    '/html/dom/elements/global-attributes/dir-auto-dynamic-changes.window.js',
    '/html/dom/elements/global-attributes/dir-shadow-utils.js',
  ])
  expect(
    inferCase(
      'dir=auto slot is not affected by text in value of input element children',
      direction,
    )?.category,
  ).toBe('selector-matching')
  expect(
    inferCase('dynamic insertion of RTL text in a child element', direction)
      ?.category,
  ).toBe('mixed-selector')
})

test('pinned WPT implicit no-throw tests remain parsing requirements', () => {
  const profiles = analyze(['/css/selectors/selector-after-font-family.html'])
  expect(inferCase(':empty is a valid selector', profiles)?.category).toBe(
    'selector-parsing',
  )
})
