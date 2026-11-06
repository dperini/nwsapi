import { expect, test } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assertPathWithin,
  documentAliases,
  isTranslatableDocument,
  resolveTranslationDocument,
} from '../../../../../scripts/repo/translation/document/path.mts'

test('translatable document predicate accepts only source repository Markdown', () => {
  expect(isTranslatableDocument('README.md')).toBe(true)
  expect(isTranslatableDocument('docs/repo/guide.md')).toBe(true)
  expect(isTranslatableDocument('test/fixture.md')).toBe(false)
  expect(isTranslatableDocument('docs/repo/guide.mdx')).toBe(false)
  expect(isTranslatableDocument('docs/repo/guide.it.md')).toBe(false)
  expect(isTranslatableDocument('docs/translations/guide.md')).toBe(false)
})

test('path containment accepts descendants and rejects traversal and siblings', () => {
  const root = path.resolve(os.tmpdir(), 'nwsapi-repository')
  expect(() =>
    assertPathWithin(root, path.join(root, 'docs', 'guide.md')),
  ).not.toThrow()
  expect(() =>
    assertPathWithin(root, path.resolve(root, '..', 'outside.md')),
  ).toThrow('inside the repository')
  expect(() =>
    assertPathWithin(root, path.resolve(`${root}-sibling`, 'outside.md')),
  ).toThrow('inside the repository')
})

test('document names resolve only to known translatable Markdown sources', () => {
  const sources = [
    'README.md',
    'docs/repo/agent-guidance.md',
    'docs/fleet/agent-guidance.md',
    'docs/repo/guide.md',
    'docs/repo/guide.it.md',
    'docs/translations/guide.md',
    'test/fixture.md',
  ]
  expect([...documentAliases(sources)]).toEqual([
    ['readme', 'README.md'],
    ['repo/agent-guidance', 'docs/repo/agent-guidance.md'],
    ['fleet/agent-guidance', 'docs/fleet/agent-guidance.md'],
    ['guide', 'docs/repo/guide.md'],
  ])
})

test('document resolution rejects unknown names and traversal', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-translate-path-'))
  try {
    mkdirSync(path.join(root, 'docs'), { recursive: true })
    writeFileSync(path.join(root, 'docs', 'guide.md'), '# Guide\n')
    const sources = ['docs/guide.md']
    expect(resolveTranslationDocument(root, 'guide', sources)).toBe(
      'docs/guide.md',
    )
    expect(() =>
      resolveTranslationDocument(root, '../outside.md', sources),
    ).toThrow('Unknown document name')
    expect(() =>
      resolveTranslationDocument(root, 'outside.txt', sources),
    ).toThrow('Unknown document name')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('document resolution rejects a documentation directory that escapes the repository', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-translate-path-'))
  const outside = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-translate-outside-'),
  )
  try {
    const target = path.join(outside, 'guide.md')
    writeFileSync(target, '# Outside\n')
    symlinkSync(outside, path.join(root, 'docs'), 'junction')
    expect(() =>
      resolveTranslationDocument(root, 'guide', ['docs/guide.md']),
    ).toThrow('inside the repository')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})
