import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  isPublishedPackage,
  missingGitHubSlugMessage,
  parseGitHubSlug,
  rawAssetUrl,
  rawBaseUrl,
  readRepositoryField,
  repoGitHubSlug,
} from '../../../../scripts/repo/lib/github-raw-url.mts'

test.each([
  'git+https://github.com/owner/project.git',
  'https://github.com/owner/project?query',
  'git@github.com:owner/project.git#ref',
  'owner/project.git',
])('normalizes supported GitHub repository forms: %s', repository => {
  expect(parseGitHubSlug(repository)).toBe('owner/project')
})

test('raw image URLs preserve the supplied ref and tracked v3 asset branch', () => {
  expect(rawBaseUrl('owner/project', 'tag')).toBe(
    'https://raw.githubusercontent.com/owner/project/tag/',
  )
  expect(
    new URL(rawAssetUrl('owner/project', 'assets/chart.svg')).pathname,
  ).toBe('/owner/project/refs/heads/prerelease/3.0.0/assets/chart.svg')
  expect(parseGitHubSlug({ url: 'owner/project' })).toBe('owner/project')
  expect(parseGitHubSlug(undefined)).toBeUndefined()
  expect(parseGitHubSlug({})).toBeUndefined()
  expect(parseGitHubSlug('invalid')).toBeUndefined()
})

test('repository metadata and publication status handle missing and malformed manifests', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-github-url-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  expect(readRepositoryField(root)).toBeUndefined()
  expect(isPublishedPackage(root)).toBe(true)
  expect(missingGitHubSlugMessage(root)).toBeTypeOf('string')
  const file = path.join(root, 'package.json')
  writeFileSync(file, '{')
  expect(readRepositoryField(root)).toBeUndefined()
  expect(isPublishedPackage(root)).toBe(true)
  const invalid = [
    null,
    1,
    {},
    { repository: {} },
    { repository: { url: 1 } },
    { repository: false },
  ]
  for (let i = 0, length = invalid.length; i < length; i += 1) {
    writeFileSync(file, JSON.stringify(invalid[i]))
    expect(readRepositoryField(root)).toBeUndefined()
    expect(isPublishedPackage(root)).toBe(true)
  }
  writeFileSync(
    file,
    JSON.stringify({ repository: 'owner/project', private: true }),
  )
  expect(readRepositoryField(root)).toBe('owner/project')
  expect(repoGitHubSlug(root)).toBe('owner/project')
  expect(isPublishedPackage(root)).toBe(false)
  expect(missingGitHubSlugMessage(root)).toBeTypeOf('string')
  writeFileSync(
    file,
    JSON.stringify({ repository: { url: 'owner/project' }, private: false }),
  )
  expect(readRepositoryField(root)).toEqual({ url: 'owner/project' })
  expect(repoGitHubSlug(root)).toBe('owner/project')
  expect(isPublishedPackage(root)).toBe(true)
  expect(missingGitHubSlugMessage(root)).toBeTypeOf('string')
})
