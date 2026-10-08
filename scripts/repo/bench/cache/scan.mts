import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanCases } from './workload.mts'

const [before, after, output] = process.argv.slice(2)
if (!before || !after || !output) {
  throw new Error('Usage: scan.mts <before.cjs> <after.cjs> <output.json>')
}
const worker = fileURLToPath(new URL('./worker.mts', import.meta.url))
const variants = [
  { name: 'before', bundle: path.resolve(before) },
  { name: 'after', bundle: path.resolve(after) },
  {
    name: 'after-expanded',
    bundle: path.resolve(after),
    settings: { CACHE_LIMIT: 8192, CACHE_BYTES: 8 * 1024 * 1024 },
  },
]
const rows = []
for (const spec of scanCases) {
  for (const variant of variants) {
    const run = (mode: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--expose-gc',
            worker,
            variant.bundle,
            spec.name,
            mode,
            JSON.stringify(variant.settings || {}),
          ],
          { cwd: process.cwd(), encoding: 'utf8' },
        ),
      )
    const samples = Array.from({ length: 3 }, () => run('timing'))
    const counts = run('counts')
    rows.push({ variant: variant.name, case: spec.name, samples, counts })
    console.log(
      variant.name,
      spec.name,
      ((counts.hits / counts.lookups) * 100).toFixed(2) + '%',
    )
  }
}
writeFileSync(
  output,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: cpus()[0]?.model,
      beforeRevision: 'c6ccba8b2a9fd04a11ddc830491f00461815d40b',
      candidateRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      }).trim(),
      variants: variants.map(variant => ({
        ...variant,
        sha256: createHash('sha256')
          .update(readFileSync(variant.bundle))
          .digest('hex'),
      })),
      cases: scanCases,
      rows,
    },
    null,
    2,
  ) + '\n',
)
