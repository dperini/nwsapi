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
import { test } from 'vitest'
import { makeCoverageBadge } from '../scripts/gen/coverage-badge.mts'
import {
  badgeColor,
  coverageBadgeSvg,
  readCoveragePct,
} from '../scripts/lib/coverage-badge.mts'

function fixture(t) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-coverage-'))
  t.onTestFinished(() => rmSync(repoRoot, { recursive: true, force: true }))
  mkdirSync(path.join(repoRoot, 'coverage'))
  writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ repository: 'https://github.com/dperini/nwsapi.git' }),
  )
  writeFileSync(
    path.join(repoRoot, 'README.md'),
    '![Coverage](assets/repo/coverage.svg)\n',
  )
  const summary = pct =>
    writeFileSync(
      path.join(repoRoot, 'coverage/coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct } } }),
    )
  return { repoRoot, summary }
}

test.each([
  [49, '#e05d44'],
  [50, '#fe7d37'],
  [60, '#dfb317'],
  [70, '#a4a61d'],
  [80, '#97ca00'],
  [90, '#4c1'],
])('coverage %s uses %s', (pct, color) => {
  assert.equal(badgeColor(pct), color)
  assert.match(
    coverageBadgeSvg(pct),
    new RegExp(`aria-label="coverage: ${pct}%"`),
  )
})

test('an unmeasured badge uses the grey n/a placeholder', () => {
  assert.match(coverageBadgeSvg(undefined), /aria-label="coverage: n\/a"/)
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
  assert.match(
    readme,
    /https:\/\/raw.githubusercontent.com\/dperini\/nwsapi\/HEAD\/assets\/repo\/coverage.svg/,
  )
  assert.match(readme, /width="\d+" height="20"/)
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
  for (const pct of [undefined, null, '95', -1, 101]) {
    summary(pct)
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
