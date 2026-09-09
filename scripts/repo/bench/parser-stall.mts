import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { provenance } from './footprint-shared.mts'

export function probeParser(selector: string, timeoutMs = 3000) {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { readFileSync } from 'node:fs'
    import { JSDOM } from 'jsdom'
    import factory from './src/nwsapi.js'
    const { window } = new JSDOM('<p></p>')
    const engine = factory(window)
    const selector = readFileSync(0, 'utf8')
    const start = performance.now()
    let outcome = 'accepted'
    try { engine.select(selector, window.document) }
    catch (error) { outcome = error.name }
    const selectMs = performance.now() - start
    window.close()
    process.stdout.write(JSON.stringify({ outcome, selectMs }))
  `,
    ],
    { cwd: REPO_ROOT, input: selector, encoding: 'utf8', timeout: timeoutMs },
  )
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(result.stderr)
  }
  return JSON.parse(result.stdout) as { outcome: string; selectMs: number }
}

if (isMainModule(import.meta.url)) {
  const file = new URL(
    '../../../assets/repo/bench/parser-stall.json',
    import.meta.url,
  )
  const report = JSON.parse(readFileSync(file, 'utf8'))
  const result = probeParser(
    Buffer.from(report.input.data, 'base64').toString(),
  )
  if (result.outcome !== 'SyntaxError') {
    throw new Error('The malformed selector must be rejected.')
  }
  report.verification = {
    ...provenance(),
    ...result,
    timeoutMs: 3000,
    method:
      'One select call after engine creation in a fresh Node process. The process limit includes startup. selectMs measures only the selector call.',
    command: 'node scripts/repo/bench/parser-stall.mts',
  }
  report.notes = [
    'The earlier before/after entries preserve the initial timeout observations.',
    'The verification entry measures the current build with an external process limit.',
    'This regression is also checked by the unit suite. One input does not establish a bound for every selector.',
  ]
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
  console.log(
    `Captured malformed selector rejected in ${result.selectMs.toFixed(3)}ms.`,
  )
}
