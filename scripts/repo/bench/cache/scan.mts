import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cacheCases } from './workload.mts'

const [baselineArg, candidateArg, outputArg] = process.argv.slice(2)
if (!baselineArg || !candidateArg || !outputArg) {
  throw new Error(
    'Usage: scan.mts <baseline-src.js> <candidate-src.js> <output.json>',
  )
}

const baseline = path.resolve(baselineArg)
const candidate = path.resolve(candidateArg)
const output = path.resolve(outputArg)
const candidateRoot = repositoryRoot(candidate)
const baselineRoot = repositoryRoot(baseline)
const candidateRelativeSource = path
  .relative(candidateRoot, candidate)
  .split(path.sep)
  .join('/')
const baselineRelativeSource = path
  .relative(candidateRoot, baseline)
  .split(path.sep)
  .join('/')
const require = createRequire(import.meta.url)
const worker = fileURLToPath(new URL('./worker.mts', import.meta.url))
const variants = [
  { name: 'baseline', source: baseline },
  { name: 'candidate', source: candidate },
]
const run = (source: string, caseName: string, mode: string) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ['--expose-gc', worker, source, caseName, mode],
      { cwd: process.cwd(), encoding: 'utf8' },
    ),
  )

const rows = []
for (const spec of cacheCases) {
  for (const variant of variants) {
    const validation = run(variant.source, spec.name, 'validate')
    const samples = Array.from({ length: 3 }, () =>
      run(variant.source, spec.name, 'timing'),
    )
    const counts = run(variant.source, spec.name, 'counts')
    rows.push({
      variant: variant.name,
      case: spec.name,
      validation,
      samples,
      counts,
    })
    console.log(
      variant.name,
      spec.name,
      `${((counts.queryHits / counts.queryLookups) * 100).toFixed(2)}% query hits`,
      `${counts.compilations} Function constructions`,
    )
  }
}

const hash = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const sourceAtHead = execFileSync(
  'git',
  ['-C', candidateRoot, 'show', `HEAD:${candidateRelativeSource}`],
  {
    cwd: process.cwd(),
    encoding: 'buffer',
  },
)
const candidateBaseRevision = execFileSync(
  'git',
  ['-C', candidateRoot, 'rev-parse', 'HEAD'],
  { cwd: process.cwd(), encoding: 'utf8' },
).trim()
const baselineRevision = execFileSync(
  'git',
  ['-C', baselineRoot, 'rev-parse', 'HEAD'],
  { cwd: process.cwd(), encoding: 'utf8' },
).trim()
const record = {
  recordedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: cpus()[0]?.model ?? 'unknown',
  jsdom: require('jsdom/package.json').version,
  baselineRevision,
  baselineSource: baselineRelativeSource,
  candidateBaseRevision,
  candidateSourceModified:
    hash(candidate) !== createHash('sha256').update(sourceAtHead).digest('hex'),
  sources: variants.map(variant => ({
    name: variant.name,
    path:
      variant.name === 'baseline'
        ? baselineRelativeSource
        : candidateRelativeSource,
    sha256: hash(variant.source),
  })),
  settings: {
    defaultCacheLimit: 1000,
    defaultCacheBytes: 2 * 1024 * 1024,
    bytePressure: { CACHE_LIMIT: 100000, CACHE_BYTES: 2 * 1024 * 1024 },
    timingSamples: 3,
  },
  cases: cacheCases,
  rows,
}
mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(record, null, 2) + '\n')

function repositoryRoot(source: string): string {
  return execFileSync(
    'git',
    ['-C', path.dirname(source), 'rev-parse', '--show-toplevel'],
    { cwd: process.cwd(), encoding: 'utf8' },
  ).trim()
}
