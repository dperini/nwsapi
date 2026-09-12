import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import type * as Jsdom from 'jsdom'
import { packPackage } from '../../build/package.mts'
import { cases } from '../cases.mts'
import { DOCUMENTS } from '../documents.mts'
import { compareTiming } from '../compare/timing.mts'
import { provenance, sha256 } from '../footprint/shared.mts'
import { writeJsdomBenchmark } from '../../gen/jsdom-benchmark.mts'
import type { Measurement } from '../charts.mts'

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: pnpm run bench:jsdom
Builds a package, creates isolated jsdom installations, compares public selector queries, and updates the tracked benchmark report.
This command has no workload options.
-h, --help  Show this help without packing or installing dependencies.`)
  process.exit(0)
}

const require = createRequire(import.meta.url)
const jsdomVersion = (require('jsdom/package.json') as { version: string })
  .version
const peerVersion = (require('css-tree/package.json') as { version: string })
  .version
const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-jsdom-benchmark-'))
const metadata = {
  ...provenance(),
  jsdomVersion,
  peerVersion,
  host: 'Public jsdom document.querySelectorAll()',
  rounds: 9,
  milliseconds: 50,
  batch: 16,
}
const rows: Array<
  Measurement & {
    matches: number
    rounds: Awaited<ReturnType<typeof compareTiming>>
  }
> = []
try {
  const packed = await packPackage(directory)
  const tarball = path.resolve(directory, packed.filename)
  const installations = ['override', 'comparison'].map(name => {
    const cwd = path.join(directory, name)
    mkdirSync(cwd)
    const packageJson = {
      name: 'nwsapi-benchmark-' + name,
      private: true,
      dependencies: { jsdom: jsdomVersion, 'css-tree': peerVersion },
      ...(name === 'override'
        ? { overrides: { '@asamuzakjp/dom-selector': 'file:' + tarball } }
        : {
            overrides: {
              '@asamuzakjp/dom-selector': metadata.competitorVersion,
            },
          }),
    }
    writeFileSync(
      path.join(cwd, 'package.json'),
      JSON.stringify(packageJson) + '\n',
    )
    execFileSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--allow-file=all',
      ],
      { cwd, stdio: 'pipe', encoding: 'utf8' },
    )
    const load = createRequire(path.join(cwd, 'package.json'))
    const hostLoad = createRequire(load.resolve('jsdom'))
    const selectorEntry = hostLoad.resolve('@asamuzakjp/dom-selector')
    const installed = JSON.parse(
      readFileSync(
        path.join(path.dirname(selectorEntry), '../package.json'),
        'utf8',
      ),
    ) as { name: string; version: string }
    assert.equal(
      installed.name,
      name === 'override' ? 'nwsapi' : '@asamuzakjp/dom-selector',
    )
    assert.equal(
      (load('jsdom/package.json') as { version: string }).version,
      jsdomVersion,
    )
    assert.equal(
      installed.version,
      name === 'override'
        ? metadata.candidateVersion
        : metadata.competitorVersion,
    )
    return {
      name,
      JSDOM: (load('jsdom') as typeof Jsdom).JSDOM,
      selector: installed.name,
      version: installed.version,
      entrySha256: sha256(readFileSync(selectorEntry, 'utf8')),
      lockSha256: sha256(
        readFileSync(path.join(cwd, 'package-lock.json'), 'utf8'),
      ),
    }
  })
  for (const [fixture, categories] of Object.entries(cases)) {
    const html = DOCUMENTS[fixture as keyof typeof DOCUMENTS].html()
    const contexts = installations.map(
      installation => new installation.JSDOM(html),
    )
    try {
      const indexes = contexts.map(
        context =>
          new Map(
            Array.from(
              context.window.document.getElementsByTagName('*'),
              (node, index) => [node, index],
            ),
          ),
      )
      for (const selector of Object.values(categories).flat()) {
        const queries = contexts.map(
          context => () => context.window.document.querySelectorAll(selector),
        )
        const positions = queries.map((query, index) =>
          Array.from(query(), node => indexes[index]!.get(node)),
        )
        assert.deepEqual(
          positions[0],
          positions[1],
          'Ordered results differ: ' + selector,
        )
        for (const query of queries) {
          for (let i = 0; i < 100; ++i) {
            query()
          }
        }
        const samples = await compareTiming(queries, metadata)
        assert.deepEqual(
          queries.map((query, index) =>
            Array.from(query(), node => indexes[index]!.get(node)),
          ),
          positions,
          'Results changed during timing: ' + selector,
        )
        rows.push({
          category: fixture,
          selector,
          matches: positions[0]!.length,
          errors: [null, null],
          milliseconds: samples.map(
            rounds =>
              rounds
                .map(round => round.p50Ns / 1e6)
                .toSorted((a, b) => a - b)[4]!,
          ),
          rounds: samples,
        })
      }
      console.log(`${fixture}: public jsdom queries measured`)
    } finally {
      for (const context of contexts) {
        context.window.close()
      }
    }
  }
  const report = {
    metadata: {
      ...metadata,
      tarballSha256: sha256(readFileSync(tarball)),
      installations: installations.map(
        ({ JSDOM: _JSDOM, ...installation }) => installation,
      ),
      fixtures: Object.entries(DOCUMENTS).map(([name, fixture]) => ({
        name,
        sha256: sha256(fixture.html()),
      })),
    },
    rows,
  }
  writeFileSync(
    'assets/repo/bench/jsdom-override.json',
    JSON.stringify(report) + '\n',
  )
  writeJsdomBenchmark()
} finally {
  rmSync(directory, { recursive: true })
}
