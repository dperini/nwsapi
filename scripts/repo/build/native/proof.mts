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
import { isMainModule } from '../../lib/run-node.mts'

const UPSTREAM_REVISION = '46c3c9fa2672151168c855ae643763c5cf31b3af'

type NativeRun = (
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
) => string

type ProofPaths = {
  root: string
  cache: string
  upstream: string
  carrier: string
  payload: string
  directCarrier: string
  nestedCarrier: string
  upstreamTarget: string
  payloadTarget: string
  carrierTarget: string
}

type BuiltAssets = {
  digest: string
  libraryBytes: Buffer
  coldTui: TuiResult
  warmTui: TuiResult
  carrierBytes: Buffer
  coldLoad: CarrierLoad
  warmLoad: CarrierLoad
  libraryCacheSize: ReturnType<typeof nativeCacheSize>
  nestedCacheSize: ReturnType<typeof nativeCacheSize>
  coldResolveRenderLibMs: number
  warmResolveRenderLibMs: number
}

type TuiResult = {
  exitCode: number
  firstOutputMs: number
  terminalBytes: number
}

type CarrierLoad = {
  libraryPath: string
  elapsedMs: number
}

export async function runNativeProof() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('This proof builds only on darwin-arm64.')
  }

  const paths = createProofPaths()
  mkdirSync(paths.cache, { recursive: true })
  const hostTemp = mkdtempSync(path.join(paths.cache, 'host-temp-'))
  chmodSync(hostTemp, 0o700)
  const hostEnv = { TMPDIR: hostTemp, TMP: hostTemp, TEMP: hostTemp }
  const run: NativeRun = (command, args, cwd, env = {}) =>
    runNativeCommand(command, args, cwd, { ...hostEnv, ...env }, spawnSync)

  try {
    const assets = await buildNativeAssets(paths, run, hostTemp)
    const proof = createProofReport(paths, assets, run)
    writeFileSync(
      path.join(paths.cache, 'host-proof.json'),
      `${JSON.stringify(proof, null, 2)}\n`,
    )
    console.log(JSON.stringify(proof, null, 2))
    return proof
  } finally {
    rmSync(hostTemp, { recursive: true, force: true })
  }
}

export function runTuiProof(
  filename: string,
  temporaryDirectory: string,
  root: string,
) {
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
  const output = runNativeCommand(
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
    spawnSync,
  )
  return JSON.parse(output) as TuiResult
}

function createProofPaths(): ProofPaths {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  )
  const cache = path.join(root, '.cache', 'hybrid')
  return {
    root,
    cache,
    upstream: path.join(cache, 'abitious'),
    carrier: path.join(root, 'scripts/repo/build/native/carrier'),
    payload: path.join(root, 'scripts/repo/build/native/payload'),
    directCarrier: path.join(cache, 'opentui-carrier.node'),
    nestedCarrier: path.join(cache, 'opentui-carrier-nested.node'),
    upstreamTarget: path.join(cache, 'abitious-target'),
    payloadTarget: path.join(cache, 'payload-target'),
    carrierTarget: path.join(cache, 'carrier-target'),
  }
}

async function buildNativeAssets(
  paths: ProofPaths,
  run: NativeRun,
  hostTemp: string,
): Promise<BuiltAssets> {
  ensureUpstream(paths, run)
  const libraryPath = await resolveHostLibrary()
  const libraryBytes = readFileSync(libraryPath)
  const digest = createHash('sha512').update(libraryBytes).digest('hex')
  const pressedPath = path.join(paths.cache, 'opentui.pressed')
  const digestPath = path.join(paths.cache, 'opentui.sha512')
  buildPinnedUpstream(paths, run)
  buildCompressedPayload(paths, run, libraryPath, pressedPath, digestPath)
  const stub = path.join(paths.upstreamTarget, 'release/libabitious_stub.dylib')
  const producer = path.join(paths.upstreamTarget, 'release/abitious-producer')
  const carrierDylib = path.join(
    paths.carrierTarget,
    'release/libnwsapi_opentui_carrier.dylib',
  )
  buildCarrier(paths, run, pressedPath, digestPath)
  copyFileSync(carrierDylib, paths.directCarrier)
  chmodSync(paths.directCarrier, 0o755)
  run(
    producer,
    [paths.directCarrier, stub, '-o', paths.nestedCarrier],
    paths.cache,
  )
  const tuiTemp = createTuiTemp(hostTemp)
  const coldTui = runTuiProof(paths.directCarrier, tuiTemp, paths.root)
  const warmTui = runTuiProof(paths.directCarrier, tuiTemp, paths.root)
  assertTuiOutput(coldTui)
  assertTuiOutput(warmTui)
  const carrierBytes = readFileSync(paths.directCarrier)
  const coldLoad = loadCarrier(paths.directCarrier, paths, run)
  const warmLoad = loadCarrier(paths.directCarrier, paths, run)
  const libraryCacheSize = verifyCarrierCache(
    coldLoad,
    warmLoad,
    digest,
    paths,
    run,
  )
  const nestedCacheSize = verifyNestedCarrier(paths, run, coldLoad, hostTemp)
  const [coldResolveRenderLibMs, warmResolveRenderLibMs] =
    await measureRenderLib(coldLoad.libraryPath)
  return {
    digest,
    libraryBytes,
    coldTui,
    warmTui,
    carrierBytes,
    coldLoad,
    warmLoad,
    libraryCacheSize,
    nestedCacheSize,
    coldResolveRenderLibMs,
    warmResolveRenderLibMs,
  }
}

function buildPinnedUpstream(paths: ProofPaths, run: NativeRun) {
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
    paths.upstream,
    { CARGO_TARGET_DIR: paths.upstreamTarget },
  )
}

function buildCompressedPayload(
  paths: ProofPaths,
  run: NativeRun,
  libraryPath: string,
  pressedPath: string,
  digestPath: string,
) {
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
      path.join(paths.payload, 'Cargo.toml'),
    ],
    paths.root,
    {
      CARGO_TARGET_DIR: paths.payloadTarget,
      OPENTUI_LIBRARY: libraryPath,
      OPENTUI_PRESSED: pressedPath,
      OPENTUI_SHA512_FILE: digestPath,
    },
  )
}

function buildCarrier(
  paths: ProofPaths,
  run: NativeRun,
  pressedPath: string,
  digestPath: string,
) {
  run(
    'rustup',
    ['run', '1.97.0', 'cargo', 'build', '--release', '--locked'],
    paths.carrier,
    {
      CARGO_TARGET_DIR: paths.carrierTarget,
      OPENTUI_PRESSED: pressedPath,
      OPENTUI_SHA512_FILE: digestPath,
      RUSTFLAGS: '-C link-arg=-undefined -C link-arg=dynamic_lookup',
    },
  )
}

function createTuiTemp(hostTemp: string) {
  const directory = path.join(hostTemp, 'tui')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  return directory
}

function assertTuiOutput(result: TuiResult) {
  if (result.exitCode !== 130 || result.terminalBytes === 0) {
    throw new Error(
      `OpenTUI PTY initialization failed: ${JSON.stringify(result)}`,
    )
  }
}

function loadCarrier(
  filename: string,
  paths: ProofPaths,
  run: NativeRun,
): CarrierLoad {
  const output = run(
    process.execPath,
    [
      '-e',
      `const started=performance.now();const m=require(${JSON.stringify(filename)});process.stdout.write(JSON.stringify({libraryPath:m.libraryPath,elapsedMs:performance.now()-started}))`,
    ],
    paths.root,
  )
  return JSON.parse(output) as CarrierLoad
}

function verifyCarrierCache(
  coldLoad: CarrierLoad,
  warmLoad: CarrierLoad,
  digest: string,
  paths: ProofPaths,
  run: NativeRun,
) {
  if (coldLoad.libraryPath !== warmLoad.libraryPath) {
    throw new Error(
      'Cold and warm carrier loads selected different cache paths.',
    )
  }
  const cacheBytes = readFileSync(coldLoad.libraryPath)
  if (createHash('sha512').update(cacheBytes).digest('hex') !== digest) {
    throw new Error(
      'Extracted OpenTUI library SHA-512 does not match the source asset.',
    )
  }
  writeFileSync(coldLoad.libraryPath, Buffer.alloc(cacheBytes.length, 0x41))
  chmodSync(coldLoad.libraryPath, 0o600)
  loadCarrier(paths.directCarrier, paths, run)
  if (
    createHash('sha512')
      .update(readFileSync(coldLoad.libraryPath))
      .digest('hex') !== digest
  ) {
    throw new Error('Poisoned cache entry was not replaced.')
  }
  return nativeCacheSize(coldLoad.libraryPath)
}

function verifyNestedCarrier(
  paths: ProofPaths,
  run: NativeRun,
  directLoad: CarrierLoad,
  hostTemp: string,
) {
  const nestedLoadPath = run(
    process.execPath,
    [
      '-e',
      `process.stdout.write(require(${JSON.stringify(paths.nestedCarrier)}).libraryPath)`,
    ],
    paths.root,
  )
  if (nestedLoadPath !== directLoad.libraryPath) {
    throw new Error(
      'The upstream generic wrapper did not load the direct NAPI carrier.',
    )
  }
  const uid = String(process.getuid?.() ?? 0)
  const nestedCacheDir = path.join(hostTemp, 'abitious-cache', uid)
  const nestedCacheName = readdirSync(nestedCacheDir).find(name =>
    name.startsWith('opentui-carrier-nested-'),
  )
  if (!nestedCacheName) {
    throw new Error(
      'The generic wrapper did not produce its comparison cache entry.',
    )
  }
  return nativeCacheSize(path.join(nestedCacheDir, nestedCacheName))
}

function measureRenderLib(libraryPath: string) {
  return import('@opentui/core').then(opentuiCore => {
    opentuiCore.setRenderLibPath(libraryPath)
    const started = performance.now()
    opentuiCore.resolveRenderLib()
    const cold = performance.now() - started
    const warmStarted = performance.now()
    opentuiCore.resolveRenderLib()
    return [cold, performance.now() - warmStarted] as const
  })
}

function createProofReport(
  paths: ProofPaths,
  assets: BuiltAssets,
  run: NativeRun,
) {
  const nestedBytes = readFileSync(paths.nestedCarrier)
  return {
    target: `${process.platform}-${process.arch}`,
    node: process.version,
    zlib: process.versions.zlib,
    upstreamRevision: run('git', ['rev-parse', 'HEAD'], paths.upstream),
    carrierFormat:
      'NAPI addon with abitious pressed-data bytes embedded in rodata',
    libraryInput:
      'installed node_modules asset; archive provenance not independently checked',
    npmRuntimeDependencies: [],
    timingNote: 'Single-run operation timings; not a benchmark speedup claim.',
    libraryBytes: assets.libraryBytes.length,
    libraryGzip9Bytes: gzipSync(assets.libraryBytes, { level: 9 }).length,
    librarySha512: assets.digest,
    directCarrierBytes: assets.carrierBytes.length,
    directCarrierGzip9Bytes: gzipSync(assets.carrierBytes, { level: 9 }).length,
    nestedGenericWrapperBytes: statSync(paths.nestedCarrier).size,
    nestedGenericWrapperGzip9Bytes: gzipSync(nestedBytes, { level: 9 }).length,
    coldCarrierRequireMs: Number(assets.coldLoad.elapsedMs.toFixed(3)),
    warmCarrierRequireMs: Number(assets.warmLoad.elapsedMs.toFixed(3)),
    coldResolveRenderLibMs: Number(assets.coldResolveRenderLibMs.toFixed(3)),
    warmResolveRenderLibSingletonLookupMs: Number(
      assets.warmResolveRenderLibMs.toFixed(3),
    ),
    coldTuiProcessToFirstTerminalOutputMs: assets.coldTui.firstOutputMs,
    warmTuiProcessToFirstTerminalOutputMs: assets.warmTui.firstOutputMs,
    tuiExitCodeAfterCtrlC: assets.coldTui.exitCode,
    extractedLibraryCacheLogicalBytes: assets.libraryCacheSize.logicalBytes,
    extractedLibraryCachePhysicalBytes: assets.libraryCacheSize.physicalBytes,
    nestedWrapperAdditionalCacheLogicalBytes:
      assets.nestedCacheSize.logicalBytes,
    nestedWrapperAdditionalCachePhysicalBytes:
      assets.nestedCacheSize.physicalBytes,
    poisonedCacheReplaced: true,
    plainNoninteractiveCliUsage: run(
      process.execPath,
      ['src/bin/nwsapi.mts'],
      paths.root,
    ).startsWith('Usage: nwsapi'),
  }
}

async function resolveHostLibrary() {
  const { getNodeAssets } = await import('@opentui/core/node-assets')
  const assets = getNodeAssets({ platform: 'darwin', arch: 'arm64' })
  const nativeAsset = assets.find(({ key }) =>
    key.startsWith('@opentui/core-darwin-arm64/'),
  )
  if (!nativeAsset) {
    throw new Error('OpenTUI did not resolve its Darwin ARM64 library.')
  }
  return nativeAsset.source
}

function ensureUpstream(paths: ProofPaths, run: NativeRun) {
  if (!existsSync(path.join(paths.upstream, '.git'))) {
    mkdirSync(paths.cache, { recursive: true })
    run(
      'git',
      [
        'clone',
        '--filter=blob:none',
        'https://github.com/SocketDev/abitious.git',
        paths.upstream,
      ],
      paths.root,
    )
  }
  const initialStatus = run(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    paths.upstream,
  )
  if (initialStatus !== '') {
    throw new Error(
      'Refusing to change an upstream checkout with tracked edits.',
    )
  }
  run('git', ['checkout', '--detach', UPSTREAM_REVISION], paths.upstream)
  const revision = run('git', ['rev-parse', 'HEAD'], paths.upstream)
  if (revision !== UPSTREAM_REVISION) {
    throw new Error(`Unexpected upstream source revision: ${revision}`)
  }
  const status = run(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    paths.upstream,
  )
  if (status !== '') {
    throw new Error(`Pinned upstream checkout has tracked edits: ${status}`)
  }
}

if (isMainModule(import.meta.url)) {
  await runNativeProof()
}
