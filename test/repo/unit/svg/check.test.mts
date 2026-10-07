import { JSDOM } from 'jsdom'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, expect, test, vi } from 'vitest'
import {
  checkSvgs,
  findUnoptimizedSvgs,
  optimiseRepoSvg,
} from '../../../../scripts/repo/svg/check.mts'
import { IMPORTANT_ICON_REL_PATH } from '../../../../scripts/repo/lib/paths.mts'
import type * as RepoPaths from '../../../../scripts/repo/lib/paths.mts'
import type * as NodeRunner from '../../../../scripts/repo/lib/run-node.mts'

const state = vi.hoisted(() => ({
  root: '/tmp/nwsapi-svg-test-' + process.pid,
  main: false,
}))
vi.mock('../../../../scripts/repo/lib/paths.mts', async importOriginal => ({
  ...(await importOriginal<typeof RepoPaths>()),
  REPO_ROOT: state.root,
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', async importOriginal => ({
  ...(await importOriginal<typeof NodeRunner>()),
  isMainModule: (url: string) => state.main && url.endsWith('/svg/check.mts'),
}))
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => 'dirty.svg\0clean.svg\0dirty.svg\0'),
}))
mkdirSync(state.root, { recursive: true })
afterAll(() => rmSync(state.root, { recursive: true, force: true }))
const dirty =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">\n<!-- removable --> <path d="M 0 0 L 10 10 Z"/>\n</svg>'

test('SVG drift compares byte counts and ignores trailing whitespace', () => {
  expect(
    findUnoptimizedSvgs(
      [{ content: 'same\n', path: 'same.svg' }],
      () => 'same',
    ),
  ).toEqual([])
  expect(
    findUnoptimizedSvgs([{ content: 'long', path: 'changed.svg' }], () => 'é'),
  ).toEqual([{ before: 4, after: 2, path: 'changed.svg' }])
  const dom = new JSDOM(optimiseRepoSvg(dirty, IMPORTANT_ICON_REL_PATH), {
    contentType: 'image/svg+xml',
  })
  try {
    expect(dom.window.document.querySelector('path')?.getAttribute('d')).toBe(
      'M 0 0 L 10 10 Z',
    )
  } finally {
    dom.window.close()
  }
})

test('repository SVG checks deduplicate Git inputs and rewrite only files that drift', () => {
  const clean = optimiseRepoSvg(dirty, 'clean.svg')
  writeFileSync(path.join(state.root, 'clean.svg'), clean)
  writeFileSync(path.join(state.root, 'dirty.svg'), dirty)
  expect(() => checkSvgs()).toThrow()
  checkSvgs(true)
  expect(readFileSync(path.join(state.root, 'clean.svg'), 'utf8')).toBe(clean)
  expect(
    findUnoptimizedSvgs([
      {
        path: 'dirty.svg',
        content: readFileSync(path.join(state.root, 'dirty.svg'), 'utf8'),
      },
    ]),
  ).toEqual([])
  expect(() => checkSvgs()).not.toThrow()
})

test('SVG CLI rejects unknown options and supports fix and validation modes', async () => {
  writeFileSync(
    path.join(state.root, 'clean.svg'),
    optimiseRepoSvg(dirty, 'clean.svg'),
  )
  writeFileSync(path.join(state.root, 'dirty.svg'), dirty)
  const argv = process.argv
  state.main = true
  try {
    process.argv = ['node', 'check.mts', '--unknown']
    vi.resetModules()
    await expect(
      import('../../../../scripts/repo/svg/check.mts'),
    ).rejects.toThrow()
    process.argv = ['node', 'check.mts', '--fix']
    vi.resetModules()
    await import('../../../../scripts/repo/svg/check.mts')
    process.argv = ['node', 'check.mts']
    vi.resetModules()
    await import('../../../../scripts/repo/svg/check.mts')
  } finally {
    process.argv = argv
    state.main = false
  }
})
