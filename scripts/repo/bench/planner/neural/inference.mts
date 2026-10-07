import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

type Model = {
  chooseInverse(features: number[], host: string): boolean
}

const directory =
  process.argv[2] || 'assets/repo/bench/planner-neural-2026-10-04'
const model = (await import(path.resolve(directory, 'model.mjs'))) as Model
const modelBytes = readFileSync(path.join(directory, 'model.mjs')).byteLength
const cases: Array<{
  name: string
  host: string
  features: [number, number, number, number]
}> = [
  { name: 'in-domain', host: 'chromium', features: [192, 96, 0, 0.5] },
  { name: 'fallback-small', host: 'chromium', features: [8, 32, 0, 4] },
]
const calls = 100_000
const rounds = 9

export function production(features: [number, number, number, number]) {
  const [anchors, witnesses, attributes, ratio] = features
  const inDomain =
    (attributes === 0 || attributes === 3) &&
    anchors >= 32 &&
    anchors <= 192 &&
    witnesses >= 0 &&
    witnesses <= 768 &&
    ratio >= 0 &&
    ratio <= 4
  return inDomain ? true : witnesses <= anchors * 2
}

function measure(fn: () => boolean) {
  let checksum = 0
  for (let index = 0; index < 10_000; ++index) {
    checksum += Number(fn())
  }
  const samples = []
  for (let round = 0; round < rounds; ++round) {
    const start = performance.now()
    for (let index = 0; index < calls; ++index) {
      checksum += Number(fn())
    }
    samples.push(((performance.now() - start) * 1e6) / calls)
  }
  samples.sort((left, right) => left - right)
  return { medianNsPerCall: samples[(rounds - 1) >> 1], checksum }
}

const results = Object.fromEntries(
  cases.map(entry => {
    const modelCall = () => model.chooseInverse(entry.features, entry.host)
    const ruleCall = () => production(entry.features)
    const modelResult = measure(modelCall)
    const ruleResult = measure(ruleCall)
    return [entry.name, { model: modelResult, rule: ruleResult }]
  }),
)
const report = {
  runtime: process.version,
  platform: `${process.platform}/${process.arch}`,
  callsPerRound: calls,
  rounds,
  modelBytes,
  results,
  note: 'Decision overhead only; DOM traversal and query costs are not included.',
}
mkdirSync(directory, { recursive: true })
writeFileSync(
  path.join(directory, 'inference.json'),
  JSON.stringify(report, null, 2) + '\n',
)
console.log(JSON.stringify(report, null, 2))
