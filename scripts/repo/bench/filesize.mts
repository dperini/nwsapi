import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import { parseArgs } from 'node:util'
import path from 'node:path'
import { rolldown } from 'rolldown'
import {
  competitorEntry,
  engineNames,
  kib,
  provenance,
  require,
  sha256,
} from './footprint-shared.mts'
import { REPO_ROOT } from '../lib/paths.mts'

export function fileSizes(code: string | Buffer) {
  const bytes = Buffer.from(code)
  return {
    bytes: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
    sha256: sha256(bytes),
  }
}

export async function sizeReport() {
  const bundle = await rolldown({
    input: competitorEntry,
    platform: 'browser',
    treeshake: false,
  })
  let code: string
  let modules: Array<{ file: string; sha256: string }>
  try {
    const { output } = await bundle.generate({
      format: 'esm',
      codeSplitting: false,
    })
    if (
      output.length !== 1 ||
      output[0]!.type !== 'chunk' ||
      output[0]!.imports.length
    ) {
      throw new Error(
        'Expected a standalone competitor bundle with all runtime dependencies included.',
      )
    }
    code = output[0]!.code
    modules = Object.keys(output[0]!.modules)
      .filter(file => !file.startsWith('\0'))
      .toSorted()
      .map(file => ({
        file: file.replaceAll('\\', '/').split('/node_modules/').at(-1)!,
        sha256: sha256(readFileSync(file)),
      }))
  } finally {
    await bundle.close()
  }
  return {
    metadata: {
      ...provenance(),
      rolldown: require('rolldown/package.json').version as string,
      method:
        'Readable nwsapi core browser file versus a full readable dom-selector ESM bundle, including runtime dependencies; no minification; full competitor exports; gzip level 9; Brotli quality 11. Excludes jsdom, nwsapi CLI, adapter, optional legacy module and css-tree peer.',
    },
    rows: [
      {
        engine: engineNames[0],
        artifact: 'dist/nwsapi.js (readable core browser file)',
        ...fileSizes(readFileSync(path.join(REPO_ROOT, 'dist/nwsapi.js'))),
      },
      {
        engine: engineNames[1],
        artifact: 'Full readable runtime bundle',
        ...fileSizes(code),
      },
    ],
    competitorModules: modules,
  }
}

import { isMainModule } from '../lib/run-node.mts'
if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      output: { type: 'string', default: 'assets/repo/bench/file-size.json' },
      help: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log('Usage: pnpm run report:size [--output path]')
  } else {
    const result = await sizeReport()
    const output = path.resolve(values.output)
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
    for (const row of result.rows) {
      console.log(
        `${row.engine}: ${kib(row.bytes)} readable, ${kib(row.gzip)} gzip, ${kib(row.brotli)} Brotli`,
      )
    }
  }
}
