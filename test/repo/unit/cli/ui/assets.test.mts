import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseAllDocuments } from 'yaml'
import { expect, test } from 'vitest'
import {
  assetFiles,
  hostAssetFiles,
  nativeAssetPackages,
  nativeNoticeNames,
  OPENTUI_VERSION,
  sharedNoticePackages,
  sharedAssetKeys,
} from '../../../../../scripts/repo/cli/ui/asset-manifest.mts'
import {
  assertAssetArchiveIntegrity,
  copyAssetIfChanged,
} from '../../../../../scripts/repo/cli/ui/assets.mts'

test('native asset pins match the optional packages in pnpm-lock.yaml', async () => {
  const source = await readFile('pnpm-lock.yaml', 'utf8')
  const lock = parseAllDocuments(source)
    .map(document => document.toJSON())
    .find(
      document => document?.packages?.['@opentui/core-darwin-arm64@0.5.17'],
    ) as {
    packages: Record<string, { resolution?: { integrity?: string } }>
  }
  for (const entry of nativeAssetPackages) {
    const key = `${entry.packageName}@${OPENTUI_VERSION}`
    expect(lock.packages[key]?.resolution?.integrity).toBe(entry.integrity)
  }
})

test('the package allowlist covers shared assets, eight native libraries, and notices', () => {
  expect(sharedAssetKeys).toHaveLength(13)
  expect(nativeAssetPackages).toHaveLength(8)
  expect(nativeNoticeNames).toContain('PATENTS-LIBWEBP')
  expect(sharedNoticePackages.map(({ packageName }) => packageName)).toEqual(
    expect.arrayContaining([
      'string-width',
      'strip-ansi',
      'emoji-regex',
      'get-east-asian-width',
      'ansi-regex',
    ]),
  )
  expect(assetFiles).toContainEqual({
    output: 'dist/bin/assets/package.json',
    published: 'bin/assets/package.json',
  })
  expect(
    assetFiles.filter(
      file =>
        file.output.endsWith('libopentui.dylib') ||
        file.output.endsWith('libopentui.so') ||
        file.output.endsWith('opentui.dll'),
    ),
  ).toHaveLength(8)
})

test('host readiness rejects targets without a pinned native asset', () => {
  expect(() => hostAssetFiles({ platform: 'aix', arch: 'x64' })).toThrow(
    'OpenTUI has no native asset',
  )
  expect(
    hostAssetFiles({ platform: 'linux', arch: 'x64', libc: 'musl' }).map(
      file => file.output,
    ),
  ).toContain('dist/bin/assets/@opentui/core-linux-x64-musl/libopentui.so')
})

test('archive verification compares the pinned sha512 integrity', () => {
  const archive = Buffer.from('pinned package bytes')
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`
  expect(() => assertAssetArchiveIntegrity(archive, integrity)).not.toThrow()
  expect(() => assertAssetArchiveIntegrity(archive, 'sha512-wrong')).toThrow(
    'integrity mismatch',
  )
})

test('asset copies update changed content and skip identical files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nwsapi-assets-'))
  const source = path.join(directory, 'source.bin')
  const target = path.join(directory, 'target.bin')
  try {
    await writeFile(source, 'one')
    await copyAssetIfChanged(source, target)
    const firstTime = (await stat(target)).mtimeMs
    await copyAssetIfChanged(source, target)
    expect((await stat(target)).mtimeMs).toBe(firstTime)
    await writeFile(source, 'two')
    await copyAssetIfChanged(source, target)
    expect(await readFile(target, 'utf8')).toBe('two')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
