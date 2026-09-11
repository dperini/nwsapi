import { Session } from 'node:inspector/promises'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import factory from '../../../dist/nwsapi.js'
import DOMSelector from '../../../dist/adapter/dom-selector.js'
import { components } from './documents.mts'

// PRs 311, 335, 337 and 343: fixed existing attribute cases, public DOM only.
const rows = []
for (const route of ['core', 'adapter']) {
  const { window } = new JSDOM(components())
  const session = new Session()
  session.connect()
  try {
    const doc = window.document
    const engine = factory(window)
    const adapter = new DOMSelector(window)
    const root = doc.getElementById('root')!
    for (const [selector, context] of [
      ['[data-testid]', doc],
      ['[data-testid="btn-150"]', doc],
      ['[data-testid]', root],
    ] as const) {
      const expected = Array.from(context.querySelectorAll(selector))
      const beforeCollection = context.getElementsByTagName('*')
      root.setAttribute('data-unrelated', 'identity-probe')
      const afterCollection = context.getElementsByTagName('*')
      const collectionIdentity = {
        sameObject: beforeCollection === afterCollection,
        sameMembers:
          beforeCollection.length === afterCollection.length &&
          Array.from(beforeCollection).every(
            (node, i) => node === afterCollection[i],
          ),
      }
      const query = () =>
        route === 'core'
          ? engine.select(selector, context)
          : adapter.querySelectorAll(selector, context)
      const actual = query()
      if (
        actual.length !== expected.length ||
        expected.some((node, i) => actual[i] !== node)
      ) {
        throw new Error('Attribute fixture mismatch')
      }
      for (const queriesPerMutation of [0, 1, 4]) {
        let mutation = 0
        const queries = queriesPerMutation || 1
        const run = () => {
          if (queriesPerMutation) {
            root.setAttribute('data-unrelated', String(mutation++))
          }
          for (let i = 0; i < queries; ++i) {
            query()
          }
        }
        for (let i = 0; i < 100; ++i) {
          run()
        }
        const millisecondsPerCycle = []
        for (let round = 0; round < 5; ++round) {
          const start = performance.now()
          for (let i = 0; i < 100; ++i) {
            run()
          }
          millisecondsPerCycle.push((performance.now() - start) / 100)
        }
        await session.post('Profiler.enable')
        await session.post('Profiler.start')
        for (let i = 0; i < 200; ++i) {
          run()
        }
        const { profile } = await session.post('Profiler.stop')
        const samples = profile.samples?.length || 1
        const sites = profile.nodes
          .filter(node => node.hitCount)
          .map(node => ({
            function: node.callFrame.functionName,
            file: node.callFrame.url.replaceAll(process.cwd(), '<repo>'),
            line: node.callFrame.lineNumber + 1,
            percent: (100 * (node.hitCount || 0)) / samples,
          }))
          .toSorted((a, b) => b.percent - a.percent)
          .slice(0, 15)
        const after = query()
        if (
          after.length !== expected.length ||
          expected.some((node, i) => after[i] !== node)
        ) {
          throw new Error('Mutation changed attribute results')
        }
        rows.push({
          route,
          selector,
          context: context === doc ? 'document' : 'element',
          matches: expected.length,
          collectionIdentity,
          queriesPerMutation,
          millisecondsPerCycle,
          sites,
        })
        console.log(route, selector, queriesPerMutation)
      }
    }
  } finally {
    session.disconnect()
    window.close()
  }
}
writeFileSync(
  'assets/repo/bench/attribute-mutation.json',
  JSON.stringify(
    {
      node: process.version,
      hashes: ['dist/nwsapi.js', 'dist/adapter/dom-selector.js'].map(file => ({
        file,
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      })),
      methodology:
        'Existing 300-card component fixture. Core and public adapter measured separately. Zero means warm query without mutation; otherwise one unrelated root attribute mutation followed by one or four queries per cycle. 100 warmup cycles, five timed batches of 100 cycles, then 200 CPU-profiled cycles. Mutation cost is included. No private host access, no candidate implementation, no application-speedup claim.',
      rows,
    },
    null,
    2,
  ) + '\n',
)
