import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import vm from 'node:vm'
import { parse } from 'acorn'
import type { Comment } from 'acorn'
import { format } from 'oxfmt'
import type { FormatConfig } from 'oxfmt'
import { outputFormat, outputs } from '../../../.config/build.config.mts'
import { packPackage } from '../build/package.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { fileSizes } from './filesize.mts'
import { provenance, require, sha256, summarize } from './footprint-shared.mts'

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: pnpm run report:build --baseline <revision> [options]
--baseline <revision>  Commit to compare with the current build.
--output <file>        JSON report path (default: assets/repo/bench/build-compression.json).
-h, --help  Show this help without creating a checkout or building either revision.`)
  process.exit(0)
}

async function measureFormatting(file: string) {
  const source = readFileSync(file, 'utf8')
  const variants = [
    { name: 'selected', options: {} },
    { name: 'two-space indentation', options: { useTabs: false } },
    { name: 'four-column tabs', options: { tabWidth: 4 } },
    { name: '120-column wrapping', options: { printWidth: 120 } },
    { name: 'double quotes', options: { singleQuote: false } },
    { name: 'property quotes as needed', options: { quoteProps: 'as-needed' } },
    { name: 'semicolons', options: { semi: true } },
    { name: 'CRLF newlines', options: { endOfLine: 'crlf' } },
  ] satisfies Array<{ name: string; options: FormatConfig }>
  const rows = []
  for (const { name, options } of variants) {
    const result = await format(file, source, { ...outputFormat, ...options })
    if (result.errors.length) {
      throw new Error(result.errors.map(error => error.message).join('\n'))
    }
    rows.push({ name, options, ...fileSizes(result.code) })
  }
  return {
    oxfmt: require('oxfmt/package.json').version as string,
    method:
      'Format the candidate core with the selected settings, then change one option per comparison. Measure UTF-8 bytes, gzip level 9, and Brotli quality 11. Each comparison includes the same code and comments.',
    sourceSha256: sha256(source),
    settings: outputFormat,
    rows,
  }
}

function measureInitialization(script: vm.Script, count: number) {
  const contexts = Array.from({ length: count }, () => {
    const module = { exports: {} }
    return vm.createContext({ module, exports: module.exports })
  })
  global.gc!()
  global.gc!()
  const before = process.memoryUsage().heapUsed
  const start = performance.now()
  for (const context of contexts) {
    script.runInContext(context)
  }
  const milliseconds = (performance.now() - start) / count
  global.gc!()
  global.gc!()
  const retainedBytes = (process.memoryUsage().heapUsed - before) / count
  for (const context of contexts) {
    if (typeof context['module'].exports !== 'function') {
      throw new Error('Module initialization did not export an engine factory')
    }
  }
  return { milliseconds, retainedBytes }
}

async function measurePackage(root: string, destination: string) {
  mkdirSync(destination)
  const staging = path.join(root, 'scripts/repo/build/package.mts')
  let packed
  if (existsSync(staging)) {
    const { packPackage: packBaseline } = (await import(
      pathToFileURL(staging).href
    )) as {
      packPackage: typeof packPackage
    }
    packed = await packBaseline(destination, root)
  } else {
    const cli = process.env['npm_execpath'] || 'pnpm'
    const javascript = /\.[cm]?js$/.test(cli)
    packed = JSON.parse(
      execFileSync(
        javascript ? process.execPath : cli,
        [
          ...(javascript ? [cli] : []),
          '--reporter=silent',
          '--config.ignore-scripts=true',
          'pack',
          '--json',
          '--pack-destination',
          destination,
        ],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    )
  }
  const result = (
    Array.isArray(packed) ? packed[0] : packed.nwsapi || packed
  ) as {
    filename: string
    size: number
    unpackedSize: number
    entryCount: number
    files: Array<{ size: number }>
  }
  const tarball = readFileSync(path.resolve(destination, result.filename))
  return {
    packedBytes: tarball.length,
    files: result.entryCount ?? result.files.length,
    sha256: sha256(tarball),
  }
}

// A temporary checkout resolves the shared node_modules symlink differently.
// Normalize generated region comments so that directory names do not count as
// byte savings. Parsed comment ranges leave code and string literals untouched.
function normalizeBundleComments(file: string) {
  const source = readFileSync(file, 'utf8')
  const comments: Comment[] = []
  parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    onComment: comments,
    allowHashBang: true,
  })
  let result = source
  for (const comment of comments.toReversed()) {
    const dependency = comment.value.indexOf('node_modules/')
    if (comment.value.startsWith('#region ') && dependency > 8) {
      result =
        result.slice(0, comment.start + 10) +
        result.slice(comment.start + 2 + dependency)
    }
  }
  if (result !== source) {
    writeFileSync(file, result)
  }
}

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    output: {
      type: 'string',
      default: 'assets/repo/bench/build-compression.json',
    },
  },
})
if (!values.baseline) {
  throw new Error('Pass --baseline with the commit before the build changes')
}
if (!global.gc) {
  execFileSync(
    process.execPath,
    ['--expose-gc', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
} else {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-build-size-'))
  try {
    const baselineRoot = path.join(temporary, 'baseline')
    mkdirSync(baselineRoot)
    const baseline = execFileSync(
      'git',
      [
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${values.baseline}^{commit}`,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    ).trim()
    const archive = execFileSync(
      'git',
      [
        'archive',
        baseline,
        '--',
        '.config',
        'bin',
        'src',
        'scripts/repo',
        'package.json',
        'pnpm-workspace.yaml',
        'pnpm-lock.yaml',
        'README.md',
        'LICENSE',
      ],
      { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 },
    )
    execFileSync('tar', ['-xf', '-', '-C', baselineRoot], { input: archive })
    symlinkSync(
      path.join(REPO_ROOT, 'node_modules'),
      path.join(baselineRoot, 'node_modules'),
      'dir',
    )
    const buildEntry = existsSync(
      path.join(baselineRoot, 'scripts/repo/build/run.mts'),
    )
      ? 'scripts/repo/build/run.mts'
      : 'scripts/repo/build.mts'
    execFileSync(process.execPath, [buildEntry], {
      cwd: baselineRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const baselineConfig = (await import(
      pathToFileURL(path.join(baselineRoot, '.config/build.config.mts')).href
    )) as { outputs: string[] }
    for (const file of baselineConfig.outputs) {
      if (file.endsWith('.js')) {
        normalizeBundleComments(path.join(baselineRoot, file))
      }
    }
    const files = [...new Set([...baselineConfig.outputs, ...outputs])]
      .toSorted()
      .map(file => {
        const before = path.join(baselineRoot, file)
        const after = path.join(REPO_ROOT, file)
        return {
          file,
          before: existsSync(before) ? fileSizes(readFileSync(before)) : null,
          after: existsSync(after) ? fileSizes(readFileSync(after)) : null,
        }
      })
    const coreFiles = [
      path.join(
        baselineRoot,
        baselineConfig.outputs.includes('dist/nwsapi.js')
          ? 'dist/nwsapi.js'
          : 'src/nwsapi.js',
      ),
      path.join(REPO_ROOT, 'dist/nwsapi.js'),
    ]
    const scripts = coreFiles.map(
      file => new vm.Script(readFileSync(file, 'utf8')),
    )
    for (const script of scripts) {
      measureInitialization(script, 8)
    }
    const count = 32
    const rounds = 7
    const samples: Array<Array<ReturnType<typeof measureInitialization>>> = [
      [],
      [],
    ]
    for (let round = 0; round < rounds; round++) {
      for (let turn = 0; turn < scripts.length; turn++) {
        const index = (round + turn) % scripts.length
        samples[index]!.push(measureInitialization(scripts[index]!, count))
      }
    }
    const candidate = await packPackage(path.join(temporary, 'after-pack'))
    const tarball = readFileSync(candidate.filename)
    const report = {
      metadata: {
        ...provenance(),
        baseline,
        v8: process.versions.v8,
        method:
          'Build both revisions with the same installed dependencies. Normalize generated dependency region comments in the temporary checkout. Measure readable files with gzip level 9 and Brotli quality 11. Stage packages in os.tmpdir() when the revision uses package staging. Package totals include every published file and its current layout.',
      },
      core: {
        before: fileSizes(readFileSync(coreFiles[0]!)),
        after: fileSizes(readFileSync(coreFiles[1]!)),
        legacyModule: fileSizes(
          readFileSync(path.join(REPO_ROOT, 'dist/modules/nwsapi-legacy.js')),
        ),
      },
      files,
      formatting: await measureFormatting(coreFiles[1]!),
      packages: {
        before: await measurePackage(
          baselineRoot,
          path.join(temporary, 'before-pack'),
        ),
        after: {
          packedBytes: tarball.length,
          files: candidate.files.length,
          sha256: sha256(tarball),
        },
      },
      initialization: {
        method:
          'Alternate revisions over fresh VM contexts. Compile scripts and create contexts before timing. Collect garbage outside timers. Retain contexts through the heap reading. Measure the module factory and shared data without creating DOMs or engine instances. Exclude process startup and JavaScript compilation.',
        contextsPerRound: count,
        rounds,
        rows: samples.map((observations, index) => ({
          revision: index === 0 ? 'before' : 'after',
          milliseconds: summarize(
            observations.map(value => value.milliseconds),
          ),
          retainedBytes: summarize(
            observations.map(value => value.retainedBytes),
          ),
        })),
      },
    }
    const output = path.resolve(REPO_ROOT, values.output)
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    console.log(`Wrote ${path.relative(REPO_ROOT, output)}`)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
