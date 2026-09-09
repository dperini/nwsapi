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
import { outputs } from '../../../.config/build.config.mts'
import { packPackage } from '../build/package.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { fileSizes } from './filesize.mts'
import { provenance, sha256, summarize } from './footprint-shared.mts'

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

function measurePackage(root: string, destination: string) {
  mkdirSync(destination)
  const cli = process.env['npm_execpath'] || 'pnpm'
  const javascript = /\.[cm]?js$/.test(cli)
  const packed = JSON.parse(
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
      path.join(baselineRoot, 'src/nwsapi.js'),
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
          'Build both revisions with the same installed dependencies. Normalize generated dependency region comments in the temporary checkout. Measure readable files with gzip level 9 and Brotli quality 11. Stage the candidate package in os.tmpdir(). Package totals also reflect removing the duplicate core and adding the optional legacy module.',
      },
      core: {
        before: fileSizes(readFileSync(coreFiles[0]!)),
        after: fileSizes(readFileSync(coreFiles[1]!)),
        legacyModule: fileSizes(
          readFileSync(path.join(REPO_ROOT, 'dist/modules/nwsapi-legacy.js')),
        ),
      },
      files,
      packages: {
        before: measurePackage(
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
