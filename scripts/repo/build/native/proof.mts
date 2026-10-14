import { createHash } from 'node:crypto'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { nativeCacheSize, runNativeCommand } from './host.mts'
import { packNativeLibrary } from './pack.mts'
import type { NativePackReceipt, NativeRun } from './pack.mts'
import { nativeTarget } from './matrix.mts'
import { isMainModule } from '../../lib/run-node.mts'

export const EXPECTED_ABITIOUS_SOURCE_REVISION =
  'ddc11869f0b7a3a394b7a37258394e0be8e81ef6'

export type NativeProofOptions = {
  abiExecutable: string
  ffiTemplate: string
  root?: string
  run?: NativeRun
}

export type NativeProofPaths = {
  root: string
  cache: string
  abiExecutable: string
  ffiTemplate: string
  directCarrier: string
}

export type NativeProofAssets = {
  receipt: NativePackReceipt
  digest: string
  libraryBytes: Buffer
  coldTui: TuiResult
  warmTui: TuiResult
  carrierBytes: Buffer
  coldLoad: CarrierLoad
  warmLoad: CarrierLoad
  libraryCacheSize: ReturnType<typeof nativeCacheSize>
  coldResolveRenderLibMs: number
  warmResolveRenderLibMs: number
}

export type TuiResult = {
  exitCode: number
  firstOutputMs: number
  terminalBytes: number
}

export type CarrierLoad = {
  libraryPath: string
  elapsedMs: number
}

export type NativeProofArguments = Pick<
  NativeProofOptions,
  'abiExecutable' | 'ffiTemplate'
>

export function parseNativeProofArguments(
  args: string[],
): NativeProofArguments {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      'abi-executable': { type: 'string' },
      'ffi-template': { type: 'string' },
    },
    strict: true,
  })
  if (positionals.length > 0) {
    throw new Error('Native proof accepts named options only.')
  }
  if (!values['abi-executable'] || !values['ffi-template']) {
    throw new Error(
      'Pass --abi-executable <path> and --ffi-template <path> for the local abitious build.',
    )
  }
  return {
    abiExecutable: values['abi-executable'],
    ffiTemplate: values['ffi-template'],
  }
}

export async function runNativeProof(options: NativeProofOptions) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('This proof runs only on darwin-arm64.')
  }
  const paths = createProofPaths(options)
  mkdirSync(paths.cache, { recursive: true })
  const carrierTemp = createOwnedTemp(paths.cache, 'carrier-temp-')
  const tuiTemp = createOwnedTemp(paths.cache, 'tui-temp-')
  const baseRun = options.run ?? defaultNativeRun
  const run: NativeRun = (command, args, cwd, env = {}) =>
    baseRun(command, args, cwd, env)

  try {
    const assets = await buildNativeAssets(paths, run, carrierTemp, tuiTemp)
    const proof = createProofReport(paths, assets, run)
    writeFileSync(
      path.join(paths.cache, 'host-proof.json'),
      `${JSON.stringify(proof, null, 2)}\n`,
    )
    console.log(JSON.stringify(proof, null, 2))
    return proof
  } finally {
    rmSync(carrierTemp, { recursive: true, force: true })
    rmSync(tuiTemp, { recursive: true, force: true })
  }
}

export function runTuiProof(
  filename: string,
  temporaryDirectory: string,
  root: string,
  run: NativeRun = defaultNativeRun,
): TuiResult {
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
  const output = run(
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
  )
  return JSON.parse(output) as TuiResult
}

export function createProofPaths(
  options: NativeProofOptions,
): NativeProofPaths {
  const root = path.resolve(
    options.root ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
  )
  return {
    root,
    cache: path.join(root, '.cache', 'hybrid'),
    abiExecutable: path.resolve(root, options.abiExecutable),
    ffiTemplate: path.resolve(root, options.ffiTemplate),
    directCarrier: path.join(
      root,
      '.cache',
      'hybrid',
      'opentui-ffi-carrier.node',
    ),
  }
}

async function buildNativeAssets(
  paths: NativeProofPaths,
  run: NativeRun,
  carrierTemp: string,
  tuiTemp: string,
): Promise<NativeProofAssets> {
  const libraryPath = await resolveHostLibrary()
  const libraryBytes = readFileSync(libraryPath)
  const digest = createHash('sha512').update(libraryBytes).digest('hex')
  const target = nativeTarget('darwin-arm64')
  const receipt = packNativeLibrary(
    {
      root: paths.root,
      executable: paths.abiExecutable,
      template: paths.ffiTemplate,
      target: target.target,
      library: libraryPath,
      output: paths.directCarrier,
    },
    run,
  )
  if (receipt.rawSize !== libraryBytes.length || receipt.rawSha512 !== digest) {
    throw new Error('abi pack-ffi receipt does not match the OpenTUI library.')
  }
  const coldTui = runTuiProof(paths.directCarrier, tuiTemp, paths.root, run)
  const warmTui = runTuiProof(paths.directCarrier, tuiTemp, paths.root, run)
  assertTuiOutput(coldTui)
  assertTuiOutput(warmTui)
  const carrierBytes = readFileSync(paths.directCarrier)
  if (carrierBytes.length !== receipt.nativeSize) {
    throw new Error(
      'abi pack-ffi receipt does not match the carrier file size.',
    )
  }
  const coldLoad = loadCarrier(paths.directCarrier, paths, run, carrierTemp)
  const warmLoad = loadCarrier(paths.directCarrier, paths, run, carrierTemp)
  const libraryCacheSize = verifyCarrierCache(
    coldLoad,
    warmLoad,
    digest,
    paths,
    carrierTemp,
    run,
  )
  const [coldResolveRenderLibMs, warmResolveRenderLibMs] =
    await measureRenderLib(coldLoad.libraryPath)
  return {
    receipt,
    digest,
    libraryBytes,
    coldTui,
    warmTui,
    carrierBytes,
    coldLoad,
    warmLoad,
    libraryCacheSize,
    coldResolveRenderLibMs,
    warmResolveRenderLibMs,
  }
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
  paths: NativeProofPaths,
  run: NativeRun,
  temporaryDirectory: string,
): CarrierLoad {
  const output = run(
    process.execPath,
    [
      '-e',
      `const started=performance.now();const m=require(${JSON.stringify(filename)});process.stdout.write(JSON.stringify({libraryPath:m.libraryPath,elapsedMs:performance.now()-started}))`,
    ],
    paths.root,
    {
      TMPDIR: temporaryDirectory,
      TMP: temporaryDirectory,
      TEMP: temporaryDirectory,
    },
  )
  return JSON.parse(output) as CarrierLoad
}

export function verifyCarrierCache(
  coldLoad: CarrierLoad,
  warmLoad: CarrierLoad,
  digest: string,
  paths: NativeProofPaths,
  cacheRoot: string,
  run: NativeRun,
) {
  if (coldLoad.libraryPath !== warmLoad.libraryPath) {
    throw new Error(
      'Cold and warm carrier loads selected different cache paths.',
    )
  }
  const ownedCachePath = validateOwnedCachePath(coldLoad.libraryPath, cacheRoot)
  const cacheBytes = readFileSync(ownedCachePath)
  if (createHash('sha512').update(cacheBytes).digest('hex') !== digest) {
    throw new Error(
      'Extracted OpenTUI library SHA-512 does not match the source asset.',
    )
  }
  writeFileSync(ownedCachePath, Buffer.alloc(cacheBytes.length, 0x41))
  chmodSync(ownedCachePath, 0o600)
  loadCarrier(paths.directCarrier, paths, run, cacheRoot)
  if (
    createHash('sha512').update(readFileSync(ownedCachePath)).digest('hex') !==
    digest
  ) {
    throw new Error('Poisoned cache entry was not replaced.')
  }
  return nativeCacheSize(ownedCachePath)
}

function createOwnedTemp(parent: string, prefix: string) {
  const temporaryDirectory = mkdtempSync(path.join(parent, prefix))
  chmodSync(temporaryDirectory, 0o700)
  return temporaryDirectory
}

export function validateOwnedCachePath(filename: string, cacheRoot: string) {
  const requestedRoot = path.resolve(cacheRoot)
  const realRoot = realpathSync(cacheRoot)
  const requestedFile = path.resolve(filename)
  const relative = path.relative(requestedRoot, requestedFile)
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      'Carrier cache path is outside the owned temporary directory.',
    )
  }
  let current = requestedRoot
  const segments = relative.split(path.sep)
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment)
    const metadata = lstatSync(current)
    if (metadata.isSymbolicLink()) {
      throw new Error('Carrier cache path cannot contain symlinks.')
    }
    if (index < segments.length - 1 && !metadata.isDirectory()) {
      throw new Error('Carrier cache parent must be a regular directory.')
    }
  }
  const realFile = realpathSync(requestedFile)
  const realRelative = path.relative(realRoot, realFile)
  if (
    realRelative === '' ||
    realRelative === '..' ||
    realRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelative)
  ) {
    throw new Error(
      'Carrier cache path resolves outside the owned temporary directory.',
    )
  }
  const metadata = lstatSync(realFile)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('Carrier cache path must be a regular file.')
  }
  return realFile
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

export function createProofReport(
  paths: NativeProofPaths,
  assets: NativeProofAssets,
  run: NativeRun,
) {
  return {
    target: `${process.platform}-${process.arch}`,
    node: process.version,
    zlib: process.versions.zlib,
    abitiousToolInputs: {
      expectedSourceRevision: EXPECTED_ABITIOUS_SOURCE_REVISION,
      sourceRevisionAuthenticated: false,
      publicReleasePinStatus: 'pending publication',
      executablePath: paths.abiExecutable,
      executableSha512: sha512File(paths.abiExecutable),
      templatePath: paths.ffiTemplate,
      templateSha512: sha512File(paths.ffiTemplate),
    },
    carrierFormat:
      'N-API addon with the FFI library embedded in a native section',
    libraryInput:
      'installed node_modules asset; archive provenance not independently checked',
    npmRuntimeDependencies: [],
    timingNote: 'Single-run operation timings; not a benchmark speedup claim.',
    libraryBytes: assets.libraryBytes.length,
    libraryGzip9Bytes: gzipSync(assets.libraryBytes, { level: 9 }).length,
    librarySha512: assets.digest,
    packReceipt: assets.receipt,
    carrierBytes: assets.carrierBytes.length,
    carrierGzip9Bytes: gzipSync(assets.carrierBytes, { level: 9 }).length,
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
    poisonedCacheReplaced: true,
    plainNoninteractiveCliUsage: run(
      process.execPath,
      ['src/bin/nwsapi.mts'],
      paths.root,
    ).startsWith('Usage: nwsapi'),
  }
}

function sha512File(filename: string) {
  return createHash('sha512').update(readFileSync(filename)).digest('hex')
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

function defaultNativeRun(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
) {
  return runNativeCommand(command, args, cwd, env, spawnSync)
}

if (isMainModule(import.meta.url)) {
  const options = parseNativeProofArguments(process.argv.slice(2))
  await runNativeProof(options)
}
