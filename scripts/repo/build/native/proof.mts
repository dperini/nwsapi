import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { nativeCacheSize, runNativeCommand } from './host.mts'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
)
const cache = path.join(root, '.cache', 'hybrid')
const upstream = path.join(cache, 'abitious')
const carrier = path.join(root, 'scripts/repo/build/native/carrier')
const payload = path.join(root, 'scripts/repo/build/native/payload')
const opentui = path.join(
  root,
  'node_modules/.pnpm/node_modules/@opentui/core-darwin-arm64/libopentui.dylib',
)
const directCarrier = path.join(cache, 'opentui-carrier.node')
const nestedCarrier = path.join(cache, 'opentui-carrier-nested.node')
mkdirSync(cache, { recursive: true })
const hostTemp = mkdtempSync(path.join(cache, 'host-temp-'))
const hostEnv = { TMPDIR: hostTemp, TMP: hostTemp, TEMP: hostTemp }

try {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('This proof builds only on darwin-arm64.')
  }
  mkdirSync(cache, { recursive: true })
  chmodSync(hostTemp, 0o700)
  ensureUpstream()

  const stub = path.join(upstream, 'target/release/libabitious_stub.dylib')
  const producer = path.join(upstream, 'target/release/abitious-producer')
  const library = readFileSync(opentui)
  const digest = createHash('sha512').update(library).digest('hex')
  const pressedPath = path.join(cache, 'opentui.pressed')
  const digestPath = path.join(cache, 'opentui.sha512')

  run(
    'rustup',
    [
      'run',
      '1.97.0',
      'cargo',
      'build',
      '-p',
      'abitious-stub',
      '-p',
      'abitious-producer',
      '--release',
      '--locked',
    ],
    upstream,
  )
  run(
    'rustup',
    [
      'run',
      '1.97.0',
      'cargo',
      'run',
      '--release',
      '--locked',
      '--manifest-path',
      path.join(payload, 'Cargo.toml'),
    ],
    root,
    {
      OPENTUI_LIBRARY: opentui,
      OPENTUI_PRESSED: pressedPath,
      OPENTUI_SHA512_FILE: digestPath,
    },
  )
  run(
    'rustup',
    ['run', '1.97.0', 'cargo', 'build', '--release', '--locked'],
    carrier,
    {
      OPENTUI_PRESSED: pressedPath,
      OPENTUI_SHA512_FILE: digestPath,
      RUSTFLAGS: '-C link-arg=-undefined -C link-arg=dynamic_lookup',
    },
  )
  copyFileSync(
    path.join(carrier, 'target/release/libnwsapi_opentui_carrier.dylib'),
    directCarrier,
  )
  chmodSync(directCarrier, 0o755)
  run(producer, [directCarrier, stub, '-o', nestedCarrier], cache)

  const tuiTemp = path.join(hostTemp, 'tui')
  mkdirSync(tuiTemp, { mode: 0o700 })
  chmodSync(tuiTemp, 0o700)
  const coldTui = runTui(directCarrier, tuiTemp)
  const warmTui = runTui(directCarrier, tuiTemp)
  for (const result of [coldTui, warmTui]) {
    if (result.exitCode !== 130 || result.terminalBytes === 0) {
      throw new Error(
        `OpenTUI PTY initialization failed: ${JSON.stringify(result)}`,
      )
    }
  }

  const carrierBytes = readFileSync(directCarrier)
  const cold = loadCarrier(directCarrier)
  const warm = loadCarrier(directCarrier)
  if (cold.libraryPath !== warm.libraryPath) {
    throw new Error(
      'Cold and warm carrier loads selected different cache paths.',
    )
  }
  const libraryCache = readFileSync(cold.libraryPath)
  if (createHash('sha512').update(libraryCache).digest('hex') !== digest) {
    throw new Error(
      'Extracted OpenTUI library SHA-512 does not match the source asset.',
    )
  }

  const nestedLoadPath = run(
    process.execPath,
    [
      '-e',
      `process.stdout.write(require(${JSON.stringify(nestedCarrier)}).libraryPath)`,
    ],
    root,
    hostEnv,
  )
  if (nestedLoadPath !== cold.libraryPath) {
    throw new Error(
      'The upstream generic wrapper did not load the direct NAPI carrier.',
    )
  }

  writeFileSync(cold.libraryPath, Buffer.alloc(libraryCache.length, 0x41))
  chmodSync(cold.libraryPath, 0o600)
  loadCarrier(directCarrier)
  if (
    createHash('sha512')
      .update(readFileSync(cold.libraryPath))
      .digest('hex') !== digest
  ) {
    throw new Error('Poisoned cache entry was not replaced.')
  }

  const opentuiCore = await import('@opentui/core')
  opentuiCore.setRenderLibPath(cold.libraryPath)
  const ffiStarted = performance.now()
  opentuiCore.resolveRenderLib()
  const coldFfiMs = performance.now() - ffiStarted
  const warmFfiStarted = performance.now()
  opentuiCore.resolveRenderLib()
  const warmFfiMs = performance.now() - warmFfiStarted

  const uid = String(process.getuid?.() ?? 0)
  const libraryCacheSize = nativeCacheSize(cold.libraryPath)
  const nestedCacheDir = path.join(hostTemp, 'abitious-cache', uid)
  const nestedCacheName = readdirSync(nestedCacheDir).find(name =>
    name.startsWith('opentui-carrier-nested-'),
  )
  if (!nestedCacheName) {
    throw new Error(
      'The generic wrapper did not produce its comparison cache entry.',
    )
  }
  const nestedCacheSize = nativeCacheSize(
    path.join(nestedCacheDir, nestedCacheName),
  )
  const proof = {
    target: `${process.platform}-${process.arch}`,
    node: process.version,
    zlib: process.versions.zlib,
    upstreamRevision: run('git', ['rev-parse', 'HEAD'], upstream),
    carrierFormat:
      'NAPI addon with abitious pressed-data bytes embedded in rodata',
    libraryInput:
      'installed node_modules asset; archive provenance not independently checked',
    npmRuntimeDependencies: [],
    timingNote: 'Single-run operation timings; not a benchmark speedup claim.',
    libraryBytes: library.length,
    libraryGzip9Bytes: gzipSync(library, { level: 9 }).length,
    librarySha512: digest,
    directCarrierBytes: carrierBytes.length,
    directCarrierGzip9Bytes: gzipSync(carrierBytes, { level: 9 }).length,
    nestedGenericWrapperBytes: statSync(nestedCarrier).size,
    nestedGenericWrapperGzip9Bytes: gzipSync(readFileSync(nestedCarrier), {
      level: 9,
    }).length,
    coldCarrierRequireMs: Number(cold.elapsedMs.toFixed(3)),
    warmCarrierRequireMs: Number(warm.elapsedMs.toFixed(3)),
    coldResolveRenderLibMs: Number(coldFfiMs.toFixed(3)),
    warmResolveRenderLibSingletonLookupMs: Number(warmFfiMs.toFixed(3)),
    coldTuiProcessToFirstTerminalOutputMs: coldTui.firstOutputMs,
    warmTuiProcessToFirstTerminalOutputMs: warmTui.firstOutputMs,
    tuiExitCodeAfterCtrlC: coldTui.exitCode,
    extractedLibraryCacheLogicalBytes: libraryCacheSize.logicalBytes,
    extractedLibraryCachePhysicalBytes: libraryCacheSize.physicalBytes,
    nestedWrapperAdditionalCacheLogicalBytes: nestedCacheSize.logicalBytes,
    nestedWrapperAdditionalCachePhysicalBytes: nestedCacheSize.physicalBytes,
    poisonedCacheReplaced: true,
    plainNoninteractiveCliUsage: run(
      process.execPath,
      ['src/bin/nwsapi.mts'],
      root,
      hostEnv,
    ).startsWith('Usage: nwsapi'),
  }
  writeFileSync(
    path.join(cache, 'host-proof.json'),
    `${JSON.stringify(proof, null, 2)}\n`,
  )
  console.log(JSON.stringify(proof, null, 2))
} finally {
  rmSync(hostTemp, { recursive: true, force: true })
}

function ensureUpstream() {
  if (!existsSync(path.join(upstream, '.git'))) {
    mkdirSync(cache, { recursive: true })
    run(
      'git',
      [
        'clone',
        '--filter=blob:none',
        'https://github.com/SocketDev/abitious.git',
        upstream,
      ],
      root,
    )
  }
  const initialStatus = run(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    upstream,
  )
  if (initialStatus !== '') {
    throw new Error(
      'Refusing to change an upstream checkout with tracked edits.',
    )
  }
  run(
    'git',
    ['checkout', '--detach', '46c3c9fa2672151168c855ae643763c5cf31b3af'],
    upstream,
  )
  const revision = run('git', ['rev-parse', 'HEAD'], upstream)
  if (revision !== '46c3c9fa2672151168c855ae643763c5cf31b3af') {
    throw new Error(`Unexpected upstream source revision: ${revision}`)
  }
  const status = run(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    upstream,
  )
  if (status !== '') {
    throw new Error(`Pinned upstream checkout has tracked edits: ${status}`)
  }
}

function loadCarrier(filename: string) {
  const response = JSON.parse(
    run(
      process.execPath,
      [
        '-e',
        `const started=performance.now();const m=require(${JSON.stringify(filename)});process.stdout.write(JSON.stringify({libraryPath:m.libraryPath,elapsedMs:performance.now()-started}))`,
      ],
      root,
      hostEnv,
    ),
  ) as { libraryPath: string; elapsedMs: number }
  return response
}

function runTui(filename: string, temporaryDirectory: string) {
  const ptyScript = [
    'import os, pty, select, subprocess, sys, time',
    'master, slave = pty.openpty()',
    'env = {**os.environ, "TERM": "xterm-256color"}',
    'child = subprocess.Popen([sys.argv[1], "--experimental-ffi", sys.argv[2], sys.argv[3]], cwd=sys.argv[4], env=env, stdin=slave, stdout=slave, stderr=slave)',
    'os.close(slave); started = time.perf_counter(); first = None; total = 0',
    'while child.poll() is None and time.perf_counter() - started < 8:',
    ' ready, _, _ = select.select([master], [], [], 0.1)',
    ' if ready:',
    '  try: data = os.read(master, 65536); total += len(data); first = first or (time.perf_counter() - started)',
    '  except OSError: break',
    ' if time.perf_counter() - started > 1.5 and child.poll() is None: os.write(master, b"\\x03"); time.sleep(0.2); break',
    'try: child.wait(timeout=3)',
    'except subprocess.TimeoutExpired: child.kill(); child.wait()',
    'print(__import__("json").dumps({"exitCode": child.returncode, "firstOutputMs": round((first or 0)*1000, 3), "terminalBytes": total}))',
  ].join('\n')
  return JSON.parse(
    run(
      'python3',
      [
        '-c',
        ptyScript,
        process.execPath,
        path.join(root, 'scripts/repo/build/native/run-tui-proof.mts'),
        filename,
        root,
      ],
      root,
      {
        TMPDIR: temporaryDirectory,
        TMP: temporaryDirectory,
        TEMP: temporaryDirectory,
      },
    ),
  ) as { exitCode: number; firstOutputMs: number; terminalBytes: number }
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
) {
  return runNativeCommand(command, args, cwd, { ...hostEnv, ...env }, spawnSync)
}
