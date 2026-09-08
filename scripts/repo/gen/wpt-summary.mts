import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { manifest } from '../../../test/repo/e2e/upstream/manifest.mts'

interface Counts {
  pass: number
  fail: number
  expectedFail: number
  unexpectedPass: number
  filtered: number
}
interface Page {
  path: string
  origin: string
  adaptation: string | null
  engineSha256: string
  wptRevision: string
  browser: string
  total: number
  counts: Counts
  harness: { status: number }
  knownFailures: Array<{ name: string; status: string; reason: string }>
}
interface Suite {
  suites?: Suite[]
  specs?: Array<{
    tests: Array<{
      status: string
      results: Array<{
        attachments?: Array<{ name: string; body?: string }>
      }>
    }>
  }>
}

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: {
      type: 'string',
      default: 'assets/repo/bench/wpt-summary.json',
    },
  },
})
if (!values.input) {
  throw new Error('Pass --input with a complete Playwright JSON report.')
}
const report: { suites: Suite[]; stats: { startTime: string } } = JSON.parse(
  readFileSync(values.input, 'utf8'),
)
const pages: Page[] = []
function collect(suites: Suite[]) {
  for (const suite of suites) {
    collect(suite.suites || [])
    for (const spec of suite.specs || []) {
      for (const test of spec.tests) {
        if (test.status !== 'expected') {
          throw new Error('Resolve unexpected, skipped, or flaky pages first.')
        }
        for (const attachment of test.results.at(-1)?.attachments || []) {
          if (attachment.name === 'wpt-subtests' && attachment.body) {
            pages.push(
              JSON.parse(Buffer.from(attachment.body, 'base64').toString()),
            )
          }
        }
      }
    }
  }
}
collect(report.suites)
const paths = new Set(pages.map(page => page.path))
if (
  pages.length !== manifest.length ||
  paths.size !== manifest.length ||
  manifest.some(entry => !paths.has(entry.path))
) {
  throw new Error('The report must contain every manifest page exactly once.')
}
const first = pages[0]!
const groups: Record<
  string,
  { pages: number; subtests: number; passed: number; knownFailures: number }
> = {}
for (const page of pages) {
  if (
    !page.engineSha256 ||
    !page.wptRevision ||
    !page.browser ||
    page.engineSha256 !== first.engineSha256 ||
    page.wptRevision !== first.wptRevision ||
    page.browser !== first.browser ||
    page.harness.status !== 0 ||
    page.counts.fail ||
    page.counts.unexpectedPass ||
    page.counts.filtered ||
    page.counts.pass + page.counts.expectedFail !== page.total ||
    page.knownFailures.length !== page.counts.expectedFail
  ) {
    throw new Error(`Incomplete or inconsistent results for ${page.path}`)
  }
  const key = page.adaptation || page.origin
  const group = (groups[key] ||= {
    pages: 0,
    subtests: 0,
    passed: 0,
    knownFailures: 0,
  })
  group.pages++
  group.subtests += page.total
  group.passed += page.counts.pass
  group.knownFailures += page.counts.expectedFail
}
const summary = {
  measuredAt: report.stats.startTime,
  engineSha256: first.engineSha256,
  wptRevision: first.wptRevision,
  browser: first.browser,
  scope:
    'Selected DOM matching tests and adapted selector-validity inputs. No rendering or CSSOM serialization assertions. Known failures are not passes.',
  expectations: 'test/repo/e2e/upstream/expectations.json',
  groups,
  pages: pages
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(page => ({
      path: page.path,
      origin: page.origin,
      adaptation: page.adaptation,
      total: page.total,
      passed: page.counts.pass,
      knownFailures: page.knownFailures.map(failure => failure.name),
    })),
}
writeFileSync(values.output, `${JSON.stringify(summary)}\n`)
console.log(`Wrote ${pages.length} pages to ${values.output}`)
