import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { packageFiles } from '../../../.config/build.config.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'

export const packageMetadata = ['LICENSE', 'README.md', 'package.json']

export type PackageExport = string | { types: string; default: string }

export function packageLayout(layout: 'output' | 'published') {
  const exports: Record<string, PackageExport> = {
    '.': '',
    './package.json': './package.json',
  }
  for (const file of packageFiles) {
    const target = './' + file[layout]
    const declaration = packageFiles.find(
      entry => entry.published === file.published.replace(/\.js$/, '.d.ts'),
    )
    const value =
      file.published.endsWith('.js') && declaration
        ? { types: './' + declaration[layout], default: target }
        : target
    exports['./' + file.published] = value
    if (file.published.endsWith('.js')) {
      exports['./' + file.published.slice(0, -3)] = value
    }
  }
  exports['.'] = exports['./src/nwsapi.js']!
  return {
    main: exports['.'],
    bin: { nwsapi: exports['./bin/nwsapi.js']! },
    files: [...packageMetadata, ...packageFiles.map(file => file[layout])],
    exports,
  }
}

export function assertPackageManifest(manifest: Record<string, unknown>) {
  for (const [key, expected] of Object.entries(packageLayout('output'))) {
    if (!isDeepStrictEqual(manifest[key], expected)) {
      throw new Error(
        `package.json ${key} differs from the build file mapping.`,
      )
    }
  }
  if (manifest['type'] !== undefined && manifest['type'] !== 'commonjs') {
    throw new Error('The published JavaScript requires CommonJS semantics.')
  }
}

export function checkPackageManifest(root = REPO_ROOT) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as Record<string, unknown>
  assertPackageManifest(manifest)
  return manifest
}

export function publishedManifest(manifest: Record<string, unknown>) {
  assertPackageManifest(manifest)
  const published: Record<string, unknown> = {
    ...manifest,
    ...packageLayout('published'),
  }
  for (const key of [
    'scripts',
    'devDependencies',
    'devEngines',
    'allowScripts',
  ]) {
    delete published[key]
  }
  return published
}

export function assertPackageFiles(files: readonly string[]) {
  const expected = packageLayout('published').files.toSorted()
  if (!isDeepStrictEqual(files.toSorted(), expected)) {
    const unexpected = files.filter(file => !expected.includes(file))
    const missing = expected.filter(file => !files.includes(file))
    throw new Error(
      `Packed files differ from the allowlist. Unexpected: ${unexpected.join(', ') || 'none'}. Missing: ${missing.join(', ') || 'none'}. Duplicate entries are forbidden.`,
    )
  }
}

if (isMainModule(import.meta.url)) {
  checkPackageManifest()
  console.log('Package files and exports match the build mapping.')
}
