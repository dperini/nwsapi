import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { afterEach, expect, test, type TestContext } from 'vitest'
import { makeCoverageBadge } from '../../../../../scripts/repo/gen/coverage-badge.mts'
import {
  badgeColor,
  coverageBadgeSvg,
  readCoveragePct,
  svgWidth,
  badgeImgTag,
  coverageBadgeRef,
  readmeBadgeForm,
  hasUnrecognizedCoverageBadge,
  migrateReadmeBadge,
  parseBadgeSvgValue,
  coverageScriptName,
} from '../../../../../scripts/repo/lib/coverage/badge.mts'

test('badge geometry and accessible values can be read independently', () => {
  expect(svgWidth(coverageBadgeSvg(84))).toBeDefined()
  expect(svgWidth('<svg height="20"/>')).toBeUndefined()
  expect(parseBadgeSvgValue(coverageBadgeSvg(84))).toBe('84%')
  expect(parseBadgeSvgValue('<svg/>')).toBeUndefined()
  const { window } = new JSDOM(badgeImgTag('/badge.svg', 'Coverage'))
  expect(window.document.querySelector('img')?.height).toBe(20)
  window.close()
})

test.each([
  [
    'img',
    '<img src="https://raw.githubusercontent.com/owner/repo/main/assets/repo/coverage.svg" alt="Coverage" />',
  ],
  ['relative-img', '<img src="assets/repo/coverage.svg" alt="Coverage" />'],
  ['markdown', '![Coverage](assets/repo/coverage.svg)'],
  ['legacy-asset', '<img src="assets/coverage.svg" alt="Coverage" />'],
  [
    'legacy-asset',
    '<img src="assets/repo/badges/coverage.svg" alt="Coverage" />',
  ],
  ['shields', '![Coverage](https://img.shields.io/badge/coverage-90%25-green)'],
  [
    'shields',
    '<img alt="Coverage" src="https://img.shields.io/badge/coverage-90%25-green">',
  ],
])(
  'migrates the %s protocol to the current badge reference',
  (form, markup) => {
    const svg = coverageBadgeSvg(81)
    expect(readmeBadgeForm(markup)).toBe(form)
    expect(hasUnrecognizedCoverageBadge(markup)).toBe(false)
    const migrated = migrateReadmeBadge(markup, undefined, svg)
    expect(migrated).toBe(coverageBadgeRef(undefined, svg))
  },
)

test('unrecognized badge references differ from a document without a badge', () => {
  expect(
    hasUnrecognizedCoverageBadge('<img src="/other.svg" alt="Coverage" />'),
  ).toBe(true)
  expect(hasUnrecognizedCoverageBadge('no image')).toBe(false)
  expect(readmeBadgeForm('no image')).toBeUndefined()
})

test.each([
  null,
  12,
  {},
  { total: null },
  { total: 12 },
  { total: {} },
  { total: { lines: null } },
  { total: { lines: 12 } },
])('invalid coverage summary structure returns no percentage %#', value => {
  const { repoRoot } = fixture()
  writeFileSync(
    path.join(repoRoot, 'coverage/coverage-summary.json'),
    JSON.stringify(value),
  )
  expect(readCoveragePct(repoRoot)).toBeUndefined()
})

test('coverage commands use their declared priority and tolerate malformed manifests', t => {
  const { repoRoot } = fixture(t)
  const file = path.join(repoRoot, 'package.json')
  rmSync(file)
  expect(coverageScriptName(repoRoot)).toBeUndefined()
  for (const value of [
    '{',
    'null',
    '12',
    '{}',
    '{"scripts":null}',
    '{"scripts":12}',
    '{"scripts":{}}',
  ]) {
    writeFileSync(file, value)
    expect(coverageScriptName(repoRoot)).toBeUndefined()
  }
  for (const name of ['test:coverage', 'cover', 'coverage', 'test:cover']) {
    writeFileSync(file, JSON.stringify({ scripts: { [name]: 'node cover' } }))
    expect(coverageScriptName(repoRoot)).toBe(name)
  }
})

const directories: string[] = []
afterEach(() => {
  directories.forEach(directory =>
    rmSync(directory, { recursive: true, force: true }),
  )
  directories.length = 0
})
function fixture(t?: TestContext) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-coverage-'))
  if (t) {
    t.onTestFinished(() => rmSync(repoRoot, { recursive: true, force: true }))
  } else {
    directories.push(repoRoot)
  }
  mkdirSync(path.join(repoRoot, 'coverage'))
  writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ repository: 'https://github.com/dperini/nwsapi.git' }),
  )
  writeFileSync(
    path.join(repoRoot, 'README.md'),
    '![Coverage](assets/repo/coverage.svg)\n',
  )
  const summary = (pct: unknown) =>
    writeFileSync(
      path.join(repoRoot, 'coverage/coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct } } }),
    )
  return { repoRoot, summary }
}

test.each([
  [49, '#f56565'],
  [50, '#f56565'],
  [60, '#ed8936'],
  [70, '#ed8936'],
  [80, '#48bb78'],
  [90, '#48bb78'],
])('coverage %s uses %s', (pct, color) => {
  assert.equal(badgeColor(pct), color)
  assert.match(
    coverageBadgeSvg(pct),
    new RegExp(`aria-label="Coverage: ${pct}%"`),
  )
})

test('an unmeasured badge uses the grey n/a placeholder', () => {
  assert.match(coverageBadgeSvg(undefined), /aria-label="Coverage: n\/a"/)
  assert.match(coverageBadgeSvg(undefined), /fill="#9f9f9f"/)
})

test('replaces an unmeasured badge with coverage and an absolute README image', t => {
  const { repoRoot, summary } = fixture(t)
  mkdirSync(path.join(repoRoot, 'assets/repo'), { recursive: true })
  writeFileSync(
    path.join(repoRoot, 'assets/repo/coverage.svg'),
    coverageBadgeSvg(undefined),
  )
  summary(89.6)
  assert.equal(makeCoverageBadge({ repoRoot }), 0)
  const badge = readFileSync(
    path.join(repoRoot, 'assets/repo/coverage.svg'),
    'utf8',
  )
  assert.equal(badge, coverageBadgeSvg(89.6))
  const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8')
  const { window } = new JSDOM(readme)
  t.onTestFinished(() => window.close())
  const image = window.document.querySelector('img')!
  const imageUrl = new URL(image.src)
  assert.equal(imageUrl.origin, 'https://raw.githubusercontent.com')
  assert.equal(
    imageUrl.pathname,
    '/dperini/nwsapi/refs/heads/prerelease/3.0.0/assets/repo/coverage.svg',
  )
  assert.equal(image.height, 20)
  assert.equal(image.hasAttribute('width'), false)
  assert.equal(makeCoverageBadge({ repoRoot, check: true }), 0)
  assert.equal(readFileSync(path.join(repoRoot, 'README.md'), 'utf8'), readme)
  summary(40)
  assert.equal(makeCoverageBadge({ repoRoot, check: true }), 1)
  assert.equal(
    readFileSync(path.join(repoRoot, 'assets/repo/coverage.svg'), 'utf8'),
    badge,
  )
  assert.equal(makeCoverageBadge({ repoRoot }), 0)
  assert.equal(makeCoverageBadge({ repoRoot, check: true }), 0)
})

test('does not invent a percentage when coverage is missing or invalid', t => {
  const { repoRoot, summary } = fixture(t)
  assert.equal(makeCoverageBadge({ repoRoot }), 1)
  for (const pct of [undefined, null, '95', -1, 101] as const) {
    summary(pct!)
    assert.equal(readCoveragePct(repoRoot), undefined)
    assert.equal(makeCoverageBadge({ repoRoot }), 1)
  }
  writeFileSync(
    path.join(repoRoot, 'coverage/coverage-summary.json'),
    '{"total":{"lines":{"pct":1e999}}}',
  )
  assert.equal(readCoveragePct(repoRoot), undefined)
  writeFileSync(path.join(repoRoot, 'coverage/coverage-summary.json'), '{')
  assert.equal(readCoveragePct(repoRoot), undefined)
})

test('refuses a published badge without a GitHub repository or README image', t => {
  const { repoRoot, summary } = fixture(t)
  summary(80)
  writeFileSync(path.join(repoRoot, 'package.json'), '{}')
  assert.equal(makeCoverageBadge({ repoRoot }), 1)
  writeFileSync(path.join(repoRoot, 'README.md'), '# No badge\n')
  assert.equal(makeCoverageBadge({ repoRoot }), 1)
})
