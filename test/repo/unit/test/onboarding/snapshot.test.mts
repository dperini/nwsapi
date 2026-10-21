import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  copyTrackedTree,
  requireSupportedNode,
} from '../../../../../scripts/repo/test/onboarding/snapshot.mts'

test('bootstrap onboarding rejects Node below the security floor', async () => {
  await expect(
    requireSupportedNode('bootstrap', '22.23.3', '/checkout'),
  ).rejects.toThrow('Node.js 22.23.4, 24.22.1, or 26.12.1')
  await expect(
    requireSupportedNode('bootstrap', '22.23.4', '/checkout'),
  ).resolves.toBeUndefined()
})

test('copies only tracked files and excludes generated and local state', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-snapshot-test-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source')
  const destination = path.join(root, 'snapshot')
  for (const directory of [
    'docs',
    '.git',
    '.cache',
    'coverage',
    'dist',
    'node_modules',
  ]) {
    await mkdir(path.join(source, directory), { recursive: true })
  }
  writeFileSync(path.join(source, 'README.md'), 'current checkout')
  writeFileSync(path.join(source, 'docs/guide.md'), 'tracked guide')
  writeFileSync(path.join(source, '.env.local-ci'), 'private token')
  writeFileSync(path.join(source, 'docs/draft.md'), 'untracked draft')
  writeFileSync(path.join(source, '.git/config'), 'local git state')
  writeFileSync(path.join(source, '.cache/trace'), 'generated cache')
  writeFileSync(path.join(source, 'coverage/report.json'), 'coverage')
  writeFileSync(path.join(source, 'dist/index.js'), 'build output')
  writeFileSync(path.join(source, 'node_modules/module.js'), 'installed')

  await copyTrackedTree(source, destination, ['README.md', 'docs/guide.md'])

  expect(readFileSync(path.join(destination, 'README.md'), 'utf8')).toBe(
    'current checkout',
  )
  expect(readFileSync(path.join(destination, 'docs/guide.md'), 'utf8')).toBe(
    'tracked guide',
  )
  for (const excluded of [
    '.env.local-ci',
    'docs/draft.md',
    '.git/config',
    '.cache/trace',
    'coverage/report.json',
    'dist/index.js',
    'node_modules/module.js',
  ]) {
    expect(existsSync(path.join(destination, excluded))).toBe(false)
  }

  await cp(source, destination, { recursive: true, force: true })
})
