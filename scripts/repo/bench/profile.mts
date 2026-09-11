import { Session } from 'node:inspector/promises'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseProfileArgs } from './profile/options.mts'

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: node scripts/repo/bench/profile.mts [phase] [output.cpuprofile]
       node scripts/repo/bench/profile.mts --phase <name> --output <file>
Phases: select (default), first, first-class, match, cold, resolver.
Output defaults to a new private directory under os.tmpdir().
Requires a current dist build. Profile output records the measured build.
Options:
  -p, --phase <name>   Profile phase. The positional phase remains supported.
  -o, --output <file>  Destination .cpuprofile file. The positional file remains supported.
Example: node scripts/repo/run.mts scripts/repo/bench/profile.mts --phase first --output /tmp/first.cpuprofile
-h, --help displays this help without creating fixtures or starting a profile.`)
  process.exit(0)
}

const { output, phase } = parseProfileArgs(process.argv.slice(2), () =>
  path.join(
    mkdtempSync(path.join(os.tmpdir(), 'nwsapi-profile-')),
    'nwsapi.cpuprofile',
  ),
)
const [{ JSDOM }, { default: factory }, { DOCUMENTS }, { cases }] =
  await Promise.all([
    import('jsdom'),
    import('../../../dist/nwsapi.js'),
    import('./documents.mts'),
    import('./cases.mts'),
  ])
const { REPO_ROOT } = await import('../lib/paths.mts')
const worlds = Object.entries(cases)
  .filter(([name]) => phase !== 'first-class' || name === 'components')
  .map(([name, groups]) => {
    const { window } = new JSDOM(
      DOCUMENTS[name as keyof typeof DOCUMENTS].html(),
    )
    const engine = factory(window)
    const doc = window.document
    const nodes = [...doc.getElementsByTagName('*')]
    const queries = (
      phase === 'first-class'
        ? ['.card', 'button.primary', 'input.input', '.card > button.primary']
        : Object.values(groups).flat()
    ).map(selector => ({
      selector,
      resolve: engine.compile(selector, true),
    }))
    return { window, engine, doc, nodes, queries }
  })
let consumed = 0
function run(iterations: number) {
  for (const { engine, doc, nodes, queries } of worlds) {
    for (let i = 0; i < iterations; ++i) {
      for (const { selector, resolve } of queries) {
        switch (phase) {
          case 'cold':
            consumed +=
              engine.compile(selector + `:not(.profile-${i})`, true)?.toString()
                .length || 0
            break
          case 'match':
            consumed += Number(engine.match(selector, nodes[i % nodes.length]!))
            break
          case 'first-class':
          case 'first':
            consumed += Number(!!engine.first(selector, doc))
            break
          case 'resolver':
            consumed += resolve
              ? (resolve(nodes, null, doc, []) as Element[]).length
              : nodes.length
            break
          default:
            consumed += engine.select(selector, doc).length
        }
      }
    }
  }
}
const session = new Session()
session.connect()
try {
  if (phase !== 'cold') {
    run(30)
  }
  await session.post('Profiler.enable')
  if (phase === 'first-class') {
    await session.post('Profiler.setSamplingInterval', { interval: 50 })
  }
  await session.post('Profiler.start')
  const iterations =
    phase === 'first-class' ? 250_000 : phase === 'match' ? 100_000 : 1000
  run(iterations)
  const { profile } = await session.post('Profiler.stop')
  writeFileSync(output, JSON.stringify(profile))
  const counts = new Map<number, number>()
  for (const sample of profile.samples || []) {
    counts.set(sample, (counts.get(sample) || 0) + 1)
  }
  const top = profile.nodes
    .map(node => ({
      samples: counts.get(node.id) || 0,
      function: node.callFrame.functionName,
      url: node.callFrame.url.replace('file://' + REPO_ROOT + '/', ''),
      line: node.callFrame.lineNumber + 1,
    }))
    .toSorted((a, b) => b.samples - a.samples)
    .slice(0, 30)
  console.log(
    JSON.stringify(
      {
        phase,
        output,
        iterations,
        sourceSha256: createHash('sha256')
          .update(
            readFileSync(new URL('../../../dist/nwsapi.js', import.meta.url)),
          )
          .digest('hex'),
        consumed,
        node: process.version,
        v8: process.versions.v8,
        samples: profile.samples?.length,
        top,
      },
      null,
      2,
    ),
  )
} finally {
  session.disconnect()
  for (const { window } of worlds) {
    window.close()
  }
}
