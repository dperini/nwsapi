import { expect, test, vi } from 'vitest'
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
import { parse, stringify } from 'yaml'
import {
  dependencyReadiness,
  taskReadiness,
} from '../../../../scripts/repo/setup/readiness.mts'

const tools = vi.hoisted(() => ({ ready: true }))
vi.mock('../../../../scripts/repo/setup/diagnostics.mts', () => ({
  managedReady: () => tools.ready,
  managedVersions: () => ({ node: '26.6.0', npm: '12.2.0', pnpm: '12.12.0' }),
}))

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-readiness-'))
  const nodeModules = path.join(root, 'node_modules')
  mkdirSync(nodeModules)
  writeFileSync(path.join(nodeModules, '.modules.yaml'), 'layoutVersion: 9\n')
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      dependencies: { alpha: '^1.2.0', local: 'workspace:*' },
      devDependencies: { vite: 'catalog:' },
      peerDependencies: { 'css-tree': '^3.2.1' },
      peerDependenciesMeta: { 'css-tree': { optional: true } },
    }),
  )
  const lock = {
    lockfileVersion: '9.0',
    importers: {
      '.': {
        dependencies: {
          alpha: { specifier: '^1.2.0', version: '1.2.3' },
          local: { specifier: 'workspace:*', version: 'link:packages/local' },
          'css-tree': { specifier: '^3.2.1', version: '3.2.1' },
        },
        devDependencies: {
          vite: { specifier: '^8.2.0', version: '8.2.2' },
        },
      },
    },
    catalogs: {
      default: {
        vite: { specifier: '^8.2.0', version: '8.2.2' },
      },
    },
  }
  const workspaceYaml = stringify({ catalog: { vite: '^8.2.0' } })
  writeFileSync(path.join(root, 'pnpm-lock.yaml'), stringify(lock))
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), workspaceYaml)
  writePackage(nodeModules, 'alpha', '1.2.3')
  writePackage(nodeModules, 'vite', '8.2.2')
  writePackage(nodeModules, 'css-tree', '3.2.1')
  const workspacePath = path.join(root, 'packages/local')
  mkdirSync(workspacePath, { recursive: true })
  writeFileSync(
    path.join(workspacePath, 'package.json'),
    JSON.stringify({ name: 'local', version: '0.1.0' }),
  )
  symlinkSync(workspacePath, path.join(nodeModules, 'local'), 'junction')
  return root
}

function writePackage(nodeModules: string, name: string, version: string) {
  const directory = path.join(nodeModules, name)
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name, version }),
  )
}

function clean(root: string) {
  rmSync(root, { recursive: true, force: true })
}

test('reports uninstalled dependencies without loading a package parser', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-readiness-empty-'))
  try {
    const report = await dependencyReadiness(root)
    expect(report.ready).toBe(false)
    expect(report.issues).toContain(
      'Dependencies are not installed. Run setup.',
    )
  } finally {
    clean(root)
  }
})

test('resolves named workspace catalogs', async () => {
  const root = fixture()
  try {
    const manifestPath = path.join(root, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      devDependencies: Record<string, string>
    }
    manifest.devDependencies['vite'] = 'catalog:tools'
    writeFileSync(manifestPath, JSON.stringify(manifest))

    const lockPath = path.join(root, 'pnpm-lock.yaml')
    const lock = parse(readFileSync(lockPath, 'utf8')) as {
      importers: Record<
        string,
        Record<string, Record<string, { specifier: string }>>
      >
      catalogs: Record<
        string,
        Record<string, { specifier: string; version: string }>
      >
    }
    lock.importers['.']!['devDependencies']!['vite']!.specifier =
      'catalog:tools'
    lock.catalogs['tools'] = { vite: lock.catalogs['default']!['vite']! }
    delete lock.catalogs['default']!['vite']
    writeFileSync(lockPath, stringify(lock))

    const workspacePath = path.join(root, 'pnpm-workspace.yaml')
    writeFileSync(
      workspacePath,
      stringify({ catalog: {}, catalogs: { tools: { vite: '^8.2.0' } } }),
    )
    expect(await dependencyReadiness(root)).toEqual({ ready: true, issues: [] })
  } finally {
    clean(root)
  }
})

test('checks root importer ranges, catalog resolutions, and exact workspace links', async () => {
  const root = fixture()
  try {
    expect(await dependencyReadiness(root)).toEqual({ ready: true, issues: [] })
  } finally {
    clean(root)
  }
})

test('accepts a coherent native npm lock without pnpm metadata', async () => {
  const root = fixture()
  try {
    rmSync(path.join(root, 'node_modules/.modules.yaml'))
    const manifestPath = path.join(root, 'package.json')
    writeFileSync(
      manifestPath,
      JSON.stringify({ devDependencies: { vite: '8.2.2' } }),
    )
    writeFileSync(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { devDependencies: { vite: '8.2.2' } },
          'node_modules/vite': {
            version: '8.2.2',
            integrity: 'sha512-fixture',
          },
        },
      }),
    )
    expect(await dependencyReadiness(root)).toEqual({ ready: true, issues: [] })
    writePackage(path.join(root, 'node_modules'), 'vite', '8.2.1')
    expect((await dependencyReadiness(root)).issues).toContain(
      'vite: expected 8.2.2, found 8.2.1.',
    )
  } finally {
    clean(root)
  }
})

test('merges pnpm lockfile documents without losing importer groups', async () => {
  const root = fixture()
  try {
    const lockPath = path.join(root, 'pnpm-lock.yaml')
    const lock = parse(readFileSync(lockPath, 'utf8')) as {
      importers: Record<string, Record<string, unknown>>
      catalogs: Record<string, Record<string, unknown>>
    }
    const importer = lock.importers['.']!
    const source = [
      stringify({
        importers: { '.': { dependencies: importer['dependencies'] } },
      }),
      stringify({ catalogs: lock.catalogs }),
      stringify({
        importers: { '.': { devDependencies: importer['devDependencies'] } },
      }),
    ].join('---\n')
    writeFileSync(lockPath, source)
    expect(await dependencyReadiness(root)).toEqual({ ready: true, issues: [] })
  } finally {
    clean(root)
  }
})

test('checks optional peer dependencies installed by the root importer', async () => {
  const root = fixture()
  try {
    rmSync(path.join(root, 'node_modules/css-tree'), { recursive: true })
    const report = await dependencyReadiness(root)
    expect(report.ready).toBe(false)
    expect(report.issues.join('\n')).toContain(
      'css-tree: package is missing or unreadable.',
    )
  } finally {
    clean(root)
  }
})

test('reports stale direct packages and incorrect workspace links', async () => {
  const root = fixture()
  try {
    writePackage(path.join(root, 'node_modules'), 'alpha', '1.2.2')
    const incorrect = path.join(root, 'packages/other')
    mkdirSync(incorrect, { recursive: true })
    writeFileSync(
      path.join(incorrect, 'package.json'),
      JSON.stringify({ name: 'local', version: '0.1.0' }),
    )
    rmSync(path.join(root, 'node_modules/local'))
    symlinkSync(incorrect, path.join(root, 'node_modules/local'), 'junction')
    const report = await dependencyReadiness(root)
    expect(report.ready).toBe(false)
    expect(report.issues.join('\n')).toContain(
      'alpha: expected 1.2.3, found 1.2.2.',
    )
    expect(report.issues.join('\n')).toContain(
      'workspace link differs from lockfile.',
    )
  } finally {
    clean(root)
  }
})

test('rejects stale catalog specifiers and importer resolutions', async () => {
  const root = fixture()
  try {
    const lockPath = path.join(root, 'pnpm-lock.yaml')
    const lock = parse(readFileSync(lockPath, 'utf8')) as {
      importers: Record<
        string,
        Record<string, Record<string, { version: string }>>
      >
      catalogs: Record<
        string,
        Record<string, { specifier: string; version: string }>
      >
    }
    lock.catalogs['default']!['vite']!.specifier = '^8.3.0'
    writeFileSync(lockPath, stringify(lock))
    let report = await dependencyReadiness(root)
    expect(report.issues.join('\n')).toContain(
      'vite: pnpm lockfile does not match the workspace catalog.',
    )
    lock.catalogs['default']!['vite']!.specifier = '^8.2.0'
    lock.importers['.']!['devDependencies']!['vite']!.version = '8.2.1'
    writeFileSync(lockPath, stringify(lock))
    report = await dependencyReadiness(root)
    expect(report.issues.join('\n')).toContain(
      'vite: pnpm lockfile does not match the workspace catalog.',
    )
  } finally {
    clean(root)
  }
})

test('guide and review require tools and dependencies, while review rebuilds dist', async () => {
  const root = fixture()
  try {
    expect(await taskReadiness('guide', root)).toMatchObject({ ready: true })
    expect(await taskReadiness('review', root)).toMatchObject({ ready: true })
    expect(existsSync(path.join(root, 'dist/nwsapi.js'))).toBe(false)
    tools.ready = false
    expect(await taskReadiness('guide', root)).toMatchObject({ ready: false })
    expect(await taskReadiness('setup', root)).toMatchObject({ ready: true })
  } finally {
    tools.ready = true
    clean(root)
  }
})
