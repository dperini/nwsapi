import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { sample, timingEngine } from './timing.mts'
const [baseline, candidate, output] = process.argv.slice(2)
if (!baseline || !candidate || !output) {
  throw new Error(
    'Usage: compiler.mts <baseline.cjs> <candidate.cjs> <output.json>',
  )
}
const require = createRequire(import.meta.url),
  { window } = new JSDOM('<!doctype html><p></p>')
const engines = [
  require(path.resolve(baseline))(window),
  require(path.resolve(candidate))(window),
]
const patterns = [
  'button.primary',
  ':is(.card,.panel):not(.hidden)',
  ':is(div:has(> span[data-x="a,b"]), section):not(.hidden)',
  ':where(.α,.😀,.\\31 x):not([data-x="a)\\\"b"])',
  ':not(:is(.a,.b),:where(.c,.d))',
  ':is(' + Array.from({ length: 30 }, (_, i) => '.class' + i).join(',') + ')',
]
const rows = []
let consumed = 0
for (const pattern of patterns) {
  const samples = [[], []]
  for (let r = 0; r < 9; r++) {
    for (let k = 0; k < 2; k++) {
      const e = (r + k) % 2
      let sequence = 0
      const result = await sample(() => {
        consumed += engines[e]
          .compile(
            pattern + `:not(.engine${e}round${r}item${sequence++})`,
            true,
          )
          .toString().length
      }, 500)
      samples[e].push(result.milliseconds)
    }
  }
  const ms = samples.map(s => s.toSorted((a, b) => a - b)[4])
  rows.push({ pattern, samples, ms })
  console.log(pattern, ms, ms[0] / ms[1])
}
writeFileSync(
  output,
  JSON.stringify(
    {
      node: process.version,
      v8: process.versions.v8,
      sha256: [baseline, candidate].map(file =>
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ),
      timingEngine,
      rounds: 9,
      iterations: 500,
      rows,
      consumed,
    },
    null,
    2,
  ),
)
window.close()
