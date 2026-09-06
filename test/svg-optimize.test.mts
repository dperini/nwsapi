import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import {
  isSvgOptimized,
  optimiseSvg,
  SVG_FLOAT_PRECISION,
} from '../scripts/gen/svg-optimize.mts'
import {
  checkSvgs,
  findUnoptimizedSvgs,
  optimiseRepoSvg,
} from '../scripts/check/svgs-are-optimized.mts'
import { coverageBadgeSvg } from '../scripts/lib/coverage-badge.mts'
import { IMPORTANT_ICON_REL_PATH, REPO_ROOT } from '../scripts/lib/paths.mts'

const RAW =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- comment --><metadata>x</metadata><path d="M1.000000 2.000000 L3.000000 4.000000" fill="#ff0000"/></svg>'
const REPORT_PATH =
  'M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z'

test('the shared optimizer removes metadata and converges', () => {
  expect(SVG_FLOAT_PRECISION).toBe(2)
  const optimized = optimiseSvg(RAW)
  expect(optimized).not.toContain('<!--')
  expect(optimized).not.toContain('<metadata>')
  expect(optimiseSvg(optimized)).toBe(optimized)
  expect(isSvgOptimized(RAW)).toBe(false)
  expect(isSvgOptimized(optimized + '\n')).toBe(true)
})

test('optimization preserves gradients, IDs, and transforms', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><path transform="translate(1 2)" fill="url(#paint)" d="M0 0L3 3"/></svg>'
  const optimized = optimiseSvg(svg)
  expect(optimized).toContain('id="paint"')
  expect(optimized).toContain('fill="url(#paint)"')
  expect(optimized).toContain('transform="translate(1 2)"')
})

test('optimization normalizes legacy CRLF content', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA[\r\npath { fill: red; }\r\n]]></style></svg>'
  const optimized = optimiseSvg(svg)
  expect(optimized).not.toContain('\r')
  expect(isSvgOptimized(optimized)).toBe(true)
})

test('the important icon retains the exact supplied Octicon path', t => {
  const svg = readFileSync(
    path.join(REPO_ROOT, IMPORTANT_ICON_REL_PATH),
    'utf8',
  )
  const optimized = optimiseRepoSvg(svg, IMPORTANT_ICON_REL_PATH)
  const dom = new JSDOM(optimized, { contentType: 'image/svg+xml' })
  t.onTestFinished(() => dom.window.close())
  expect(dom.window.document.querySelectorAll('path')).toHaveLength(1)
  expect(dom.window.document.querySelector('path')?.getAttribute('d')).toBe(
    REPORT_PATH,
  )
  expect(dom.window.document.documentElement.getAttribute('viewBox')).toBe(
    '0 0 16 16',
  )
  expect(optimized.trimEnd()).toBe(svg.trimEnd())
})

test('every coverage badge is already optimized', () => {
  for (const pct of [undefined, 0, 49, 50, 60, 70, 80, 90, 99.4, 100]) {
    expect(isSvgOptimized(coverageBadgeSvg(pct))).toBe(true)
  }
})

test('drift reports byte counts and ignores trailing whitespace', () => {
  const optimized = optimiseSvg(RAW)
  expect(
    findUnoptimizedSvgs([
      { path: 'raw.svg', content: RAW },
      { path: 'ready.svg', content: optimized + '\n' },
    ]),
  ).toEqual([
    {
      path: 'raw.svg',
      before: Buffer.byteLength(RAW),
      after: Buffer.byteLength(optimized),
    },
  ])
})

test('checks include new files, do not write, and fixes converge', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-svg-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  execFileSync('git', ['init', '--quiet', root])
  const file = path.join(root, 'new icon.svg')
  writeFileSync(file, RAW)
  expect(() => checkSvgs(false, root)).toThrow('new icon.svg')
  expect(readFileSync(file, 'utf8')).toBe(RAW)
  checkSvgs(true, root)
  expect(() => checkSvgs(false, root)).not.toThrow()
  expect(readFileSync(file, 'utf8')).toBe(optimiseSvg(RAW) + '\n')
  checkSvgs(true, root)
  expect(readFileSync(file, 'utf8')).toBe(optimiseSvg(RAW) + '\n')
})
