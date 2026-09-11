import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { REPO_ROOT } from '../lib/paths.mts'

const baseline = '24cdab6aa6b6e0a483197d30b09bfeed892256ef'
const parent = execFileSync('git', ['show', `${baseline}^:src/nwsapi.js`], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
})
const before = execFileSync('git', ['show', `${baseline}:src/nwsapi.js`], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
})
const after = readFileSync(
  new URL('../../../dist/nwsapi.js', import.meta.url),
  'utf8',
)
const worker = fileURLToPath(
  new URL('./display-state-reentry-worker.mts', import.meta.url),
)
const rows = []
for (const [name, source] of [
  ['before-change', parent],
  ['historical', before],
  ['current', after],
] as const) {
  for (const limit of [10, 100, 1000, 0]) {
    const result = spawnSync(process.execPath, [worker], {
      input: JSON.stringify({ source, limit }),
      encoding: 'utf8',
      timeout: 3000,
    })
    if (
      result.error &&
      (!('code' in result.error) || result.error.code !== 'ETIMEDOUT')
    ) {
      throw result.error
    }
    if (!result.error && result.status !== 0) {
      throw new Error(result.stderr)
    }
    rows.push({
      name,
      limit: limit || null,
      timedOut: !!result.error,
      result: result.error ? null : JSON.parse(result.stdout),
    })
  }
}
const report = {
  baseline,
  engineHash: createHash('sha256').update(after).digest('hex'),
  node: process.version,
  subprocessBudgetMs: 3000,
  scope:
    'One :modal query with an Element.matches delegate. The subprocess deadline includes startup. Capped cases interrupt recursion deliberately and are not throughput benchmarks.',
  rows,
}
writeFileSync(
  new URL(
    '../../../assets/repo/bench/display-state-reentry.json',
    import.meta.url,
  ),
  JSON.stringify(report, null, 2) + '\n',
)
console.log(JSON.stringify(report, null, 2))
