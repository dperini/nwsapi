import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Profiler } from 'node:inspector'
import { parse } from 'acorn'
import { convert } from 'ast-v8-to-istanbul'
import libCoverage from 'istanbul-lib-coverage'
import { normalizeCoverageLocations } from '../../lib/coverage/normalize.mts'

function source(file: string) {
  const original = readFileSync(file, 'utf8')
  const code = file.endsWith('.mts') ? stripTypeScriptTypes(original) : original
  return {
    code,
    ast: parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    }),
  }
}

export function nativeProcessMarker(name: string) {
  const match = /^coverage-(\d+)-\d+-(\d+)\.json$/.exec(name)
  return match ? `${match[1]}-${match[2]}.json` : undefined
}

export async function nativeScriptCoverage(
  root: string,
  raw: string,
  transformed: string,
) {
  const coverage = libCoverage.createCoverageMap({})
  const sources = new Map<string, ReturnType<typeof source>>()
  const scriptRoot = path.join(root, 'scripts') + path.sep
  const reports = readdirSync(raw).toSorted()
  for (let index = 0, length = reports.length; index < length; index += 1) {
    const name = reports[index]!
    const marker = nativeProcessMarker(name)
    if (marker === undefined || existsSync(path.join(transformed, marker))) {
      continue
    }
    const report = JSON.parse(readFileSync(path.join(raw, name), 'utf8')) as {
      result: Profiler.ScriptCoverage[]
    }
    for (let i = 0, size = report.result.length; i < size; i += 1) {
      const entry = report.result[i]!
      if (!entry.url.startsWith('file:')) {
        continue
      }
      const file = fileURLToPath(entry.url)
      if (
        !file.startsWith(scriptRoot) ||
        !['.mts', '.mjs', '.js'].includes(path.extname(file))
      ) {
        continue
      }
      const input = sources.get(file) ?? source(file)
      sources.set(file, input)
      coverage.merge(
        normalizeCoverageLocations(
          await convert({ ...input, coverage: entry, wrapperLength: 0 }),
        ),
      )
    }
  }
  return coverage
}

export async function unexecutedScriptCoverage(file: string) {
  const input = source(file)
  return normalizeCoverageLocations(
    await convert({
      ...input,
      coverage: {
        url: pathToFileURL(file).href,
        functions: [
          {
            functionName: '',
            isBlockCoverage: true,
            ranges: [
              { startOffset: 0, endOffset: input.code.length, count: 0 },
            ],
          },
        ],
      },
      wrapperLength: 0,
    }),
  )
}
