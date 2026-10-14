import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getNodeAssets } from '@opentui/core/node-assets'
import {
  assetFiles,
  hostAssetFiles,
  nativeAssetKey,
  nativeAssetPackages,
  nativeNoticeNames,
  OPENTUI_VERSION,
  sharedNoticePackages,
  packageTarballUrl,
  sharedAssetKeys,
} from './asset-manifest.mts'

export type PackageFile = { output: string; published: string }

export { assetFiles, hostAssetFiles }

export { currentOpenTuiTarget } from './target.mts'
export type { OpenTuiTarget } from './target.mts'
import { currentOpenTuiTarget } from './target.mts'

export async function copyOpenTuiAssets(
  root: string,
  target = currentOpenTuiTarget(),
  includeAllNative = false,
) {
  const assets = getNodeAssets(target as Parameters<typeof getNodeAssets>[0])
  const sourceByKey = new Map(assets.map(asset => [asset.key, asset.source]))
  const missingShared = sharedAssetKeys.filter(key => !sourceByKey.has(key))
  if (missingShared.length) {
    throw new Error(
      `OpenTUI is missing shared assets: ${missingShared.join(', ')}.`,
    )
  }
  const selectedKeys = new Set<string>(sharedAssetKeys)
  const hostNative = assets.find(({ key }) => key.startsWith('@opentui/core-'))
  if (!hostNative) {
    throw new Error('OpenTUI did not resolve a native library for this host.')
  }
  selectedKeys.add(hostNative.key)
  for (const key of selectedKeys) {
    await copyAsset(root, key, sourceByKey.get(key)!)
  }
  const coreRoot = path.dirname(
    fileURLToPath(import.meta.resolve('@opentui/core')),
  )
  assertSharedNoticeCoverage(coreRoot)
  const parserAsset = sourceByKey.get('web-tree-sitter/tree-sitter.wasm')
  if (!parserAsset) {
    throw new Error('OpenTUI did not resolve the tree-sitter runtime asset.')
  }
  for (const { packageName, license } of sharedNoticePackages) {
    const sourceRoot = findPackageRoot(packageName, coreRoot)
    await copyNotice(root, packageName, sourceRoot, license)
  }

  const downloaded = new Map<string, string>()
  if (includeAllNative) {
    for (const entry of nativeAssetPackages) {
      const key = nativeAssetKey(entry.packageName, entry.fileName)
      let source = sourceByKey.get(key)
      if (!source) {
        source = await cachedNativePackage(root, entry)
      }
      await copyAsset(root, key, source)
      downloaded.set(entry.packageName, path.dirname(source))
    }
    for (const { packageName } of nativeAssetPackages) {
      const sourceRoot = downloaded.get(packageName)
      if (!sourceRoot) {
        const entry = nativeAssetPackages.find(
          item => item.packageName === packageName,
        )!
        const key = nativeAssetKey(entry.packageName, entry.fileName)
        const source =
          sourceByKey.get(key) ?? (await cachedNativePackage(root, entry))
        await copyNoticeSet(root, packageName, path.dirname(source))
      } else {
        await copyNoticeSet(root, packageName, sourceRoot)
      }
    }
  } else {
    await copyNoticeSet(
      root,
      hostNative.key.slice(0, hostNative.key.lastIndexOf('/')),
      path.dirname(hostNative.source),
    )
  }
  const assetRoot = path.join(root, 'dist/bin/assets')
  await mkdir(assetRoot, { recursive: true })
  await writeIfChanged(
    path.join(assetRoot, 'package.json'),
    '{"type":"module"}\n',
  )
  return [...selectedKeys]
}

export function assetManifestKeys() {
  return [
    ...sharedAssetKeys,
    ...nativeAssetPackages.map(({ packageName, fileName }) =>
      nativeAssetKey(packageName, fileName),
    ),
  ]
}

async function copyAsset(root: string, key: string, source: string) {
  const target = path.join(root, 'dist/bin/assets', key)
  await mkdir(path.dirname(target), { recursive: true })
  await copyAssetIfChanged(source, target)
}

async function copyNoticeSet(
  root: string,
  packageName: string,
  sourceRoot: string,
) {
  for (const name of nativeNoticeNames) {
    await copyNotice(root, packageName, sourceRoot, name)
  }
}

async function copyNotice(
  root: string,
  packageName: string,
  sourceRoot: string,
  name: string,
) {
  const source = path.join(sourceRoot, name)
  const target = path.join(root, 'dist/bin/assets/notices', packageName, name)
  await mkdir(path.dirname(target), { recursive: true })
  await copyAssetIfChanged(source, target)
}

function findPackageRoot(packageName: string, coreRoot: string) {
  let directory = coreRoot
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = path.join(directory, 'node_modules', packageName)
    const manifestPath = path.join(candidate, 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name?: string
      }
      if (manifest.name === packageName) {
        return candidate
      }
    }
    directory = path.dirname(directory)
  }
  throw new Error(`Could not locate the ${packageName} package root.`)
}

function assertSharedNoticeCoverage(coreRoot: string) {
  const noticed = new Set<string>(
    sharedNoticePackages.map(({ packageName }) => packageName),
  )
  const visited = new Set<string>()
  const visit = (packageRoot: string) => {
    const manifest = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { name?: string; dependencies?: Record<string, string> }
    if (!manifest.name || visited.has(manifest.name)) {
      return
    }
    visited.add(manifest.name)
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (!noticed.has(dependency)) {
        throw new Error(`Missing bundled dependency notice for ${dependency}.`)
      }
      visit(findPackageRoot(dependency, packageRoot))
    }
  }
  visit(coreRoot)
}

export async function copyAssetIfChanged(source: string, target: string) {
  let sourceSize: number
  let targetSize: number
  try {
    ;[sourceSize, targetSize] = await Promise.all([
      stat(source).then(info => info.size),
      stat(target).then(info => info.size),
    ])
  } catch {
    await copyFile(source, target)
    return
  }
  if (sourceSize !== targetSize) {
    await copyFile(source, target)
    return
  }
  const [sourceBytes, targetBytes] = await Promise.all([
    readFile(source),
    readFile(target),
  ])
  if (!sourceBytes.equals(targetBytes)) {
    await copyFile(source, target)
  }
}

async function writeIfChanged(target: string, content: string) {
  try {
    if ((await readFile(target, 'utf8')) === content) {
      return
    }
  } catch {
    // The new asset directory has no metadata file yet.
  }
  await writeFile(target, content)
}

async function cachedNativePackage(
  root: string,
  entry: (typeof nativeAssetPackages)[number],
) {
  const pin = createHash('sha256')
    .update(entry.integrity)
    .digest('hex')
    .slice(0, 16)
  const cacheId = `${OPENTUI_VERSION}-${pin}`
  const cache = path.join(
    root,
    '.cache/repo/opentui',
    entry.packageName,
    cacheId,
  )
  const packageRoot = path.join(cache, 'package')
  const nativeFile = path.join(packageRoot, entry.fileName)
  await mkdir(cache, { recursive: true })
  const archive = path.join(cache, 'package.tgz')
  let bytes: Buffer
  try {
    bytes = await readFile(archive)
    assertAssetArchiveIntegrity(bytes, entry.integrity)
  } catch {
    const response = await fetch(packageTarballUrl(entry.packageName))
    if (!response.ok) {
      throw new Error(
        `Could not fetch ${entry.packageName}: HTTP ${response.status}.`,
      )
    }
    bytes = Buffer.from(await response.arrayBuffer())
    assertAssetArchiveIntegrity(bytes, entry.integrity)
    await writeFile(archive, bytes)
  }
  try {
    await stat(nativeFile)
    return nativeFile
  } catch {
    // The verified archive is available for restoring this extracted package.
  }
  const temporary = await mkdtemp(path.join(cache, 'extract-'))
  try {
    const result = spawnSync('tar', ['-xzf', archive, '-C', temporary], {
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      throw new Error(`Could not unpack ${entry.packageName}.`)
    }
    await rm(packageRoot, { recursive: true, force: true })
    await rename(path.join(temporary, 'package'), packageRoot)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  return nativeFile
}

export function assertAssetArchiveIntegrity(bytes: Buffer, expected: string) {
  const actual = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (actual !== expected) {
    throw new Error(`OpenTUI asset archive integrity mismatch: ${expected}.`)
  }
}
