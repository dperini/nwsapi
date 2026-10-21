import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import manifest from '../../../../package.json' with { type: 'json' }
import { afterEach, expect, test, vi } from 'vitest'
import { runJsdomCommand } from '../../../../scripts/repo/cli/jsdom.mts'
import { installWithExecutor } from '../../../../scripts/repo/cli/jsdom/manager.mts'
import type { PackageCommandExecutor } from '../../../../scripts/repo/cli/jsdom/manager.mts'

type TestPackage = Record<string, unknown> & {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  overrides?: Record<string, string>
  nwsapi?: {
    jsdomOverride: {
      manager: string
      override: { owned: boolean }
      dependencies: Array<{ owned: boolean }>
      createdWorkspaceYaml?: { value: string }
    }
  }
}

const roots: string[] = []
const alias = `npm:nwsapi@${manifest.version}`
const env = {
  npm_config_user_agent: 'npm/12.2.0 node/v26.12.1',
  npm_execpath: '/tools/npm/bin/npm-cli.js',
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

test('help and dry-run do not change files or install packages', async () => {
  const root = makeProject()
  const before = readFileSync(path.join(root, 'package.json'), 'utf8')
  const install = vi.fn()

  expect(await runJsdomCommand(['--help'])).toContain('Usage: nwsapi jsdom')
  const output = await runJsdomCommand(['add', '--dry-run'], {
    cwd: root,
    env,
    install,
  })

  expect(output).toContain('Would run npm install')
  expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before)
  expect(install).not.toHaveBeenCalled()
})

test('add records owned npm changes and remove preserves later user edits', async () => {
  const root = makeProject({
    name: 'consumer',
    packageManager: 'npm@12.2.0',
    dependencies: { jsdom: '^30.0.1', keep: '1.0.0' },
    overrides: { 'unrelated-package': '2.0.0' },
  })
  const install = vi.fn()

  await runJsdomCommand(['add'], { cwd: root, env, install })
  const added = readPackage(root)
  expect(added.overrides).toEqual({
    'unrelated-package': '2.0.0',
    '@asamuzakjp/dom-selector': alias,
  })
  expect(added.dependencies).toEqual({
    jsdom: '^30.0.1',
    keep: '1.0.0',
    'css-tree': '^3.2.1',
  })
  expect(added.nwsapi?.jsdomOverride.override.owned).toBe(true)
  expect(added.nwsapi?.jsdomOverride.dependencies[0]?.owned).toBe(true)

  added.dependencies!['keep'] = '2.0.0'
  added.dependencies!['css-tree'] = '~3.2.1'
  writePackage(root, added)
  await runJsdomCommand(['remove'], { cwd: root, env, install })

  const removed = readPackage(root)
  expect(removed.overrides).toEqual({ 'unrelated-package': '2.0.0' })
  expect(removed.dependencies?.['keep']).toBe('2.0.0')
  expect(removed.dependencies?.['css-tree']).toBe('~3.2.1')
  expect(removed.nwsapi).toBeUndefined()
  expect(install).toHaveBeenCalledTimes(2)
})

test('remove keeps matching pre-existing override and css-tree declarations', async () => {
  const root = makeProject({
    name: 'consumer',
    packageManager: 'npm@12.2.0',
    dependencies: { jsdom: '^30.0.1', 'css-tree': '^3.2.1' },
    overrides: { '@asamuzakjp/dom-selector': alias },
    nwsapi: { otherFeature: { enabled: true } },
  })
  const install = vi.fn()

  await runJsdomCommand(['add'], { cwd: root, env, install })
  const added = readPackage(root)
  expect(added.nwsapi?.jsdomOverride.override.owned).toBe(false)
  expect(added.nwsapi?.jsdomOverride.dependencies[0]?.owned).toBe(false)
  await runJsdomCommand(['remove'], { cwd: root, env, install })

  const removed = readPackage(root)
  expect(removed.overrides?.['@asamuzakjp/dom-selector']).toBe(alias)
  expect(removed.dependencies?.['css-tree']).toBe('^3.2.1')
  expect(removed.nwsapi).toEqual({ otherFeature: { enabled: true } })
})

test('remove without provenance leaves existing overrides alone', async () => {
  const root = makeProject({
    name: 'consumer',
    dependencies: { jsdom: '^30.0.1' },
    overrides: { '@asamuzakjp/dom-selector': 'npm:nwsapi@1.0.0' },
  })
  const before = readFileSync(path.join(root, 'package.json'), 'utf8')
  const install = vi.fn()

  await runJsdomCommand(['remove'], { cwd: root, env, install })

  expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before)
  expect(install).not.toHaveBeenCalled()
})

test('malformed package nwsapi metadata is preserved and rejected', async () => {
  const root = makeProject({
    name: 'consumer',
    dependencies: { jsdom: '^30.0.1' },
    nwsapi: 'user setting',
  })
  const before = readFileSync(path.join(root, 'package.json'), 'utf8')

  await expect(
    runJsdomCommand(['add', '--dry-run'], { cwd: root, env }),
  ).rejects.toThrow('nwsapi metadata must be a mapping')
  expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before)
})

test('npm direct dependency conflicts fail before changing configuration', async () => {
  const root = makeProject({
    name: 'consumer',
    dependencies: {
      jsdom: '^30.0.1',
      '@asamuzakjp/dom-selector': '^9.2.4',
    },
  })
  const before = readFileSync(path.join(root, 'package.json'), 'utf8')
  const install = vi.fn()

  await expect(
    runJsdomCommand(['add'], { cwd: root, env, install }),
  ).rejects.toThrow('EOVERRIDE')
  expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before)
  expect(install).not.toHaveBeenCalled()
})

test('incompatible jsdom versions fail before changing configuration', async () => {
  const root = makeProject({
    name: 'consumer',
    dependencies: { jsdom: '^29.0.0' },
  })
  const before = readFileSync(path.join(root, 'package.json'), 'utf8')
  const install = vi.fn()

  await expect(
    runJsdomCommand(['add'], { cwd: root, env, install }),
  ).rejects.toThrow('not restricted to nwsapi')
  expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before)
  expect(install).not.toHaveBeenCalled()
})

test('a failed install restores only unchanged configuration files', async () => {
  const root = makeProject({
    name: 'consumer',
    dependencies: { jsdom: '^30.0.1' },
  })
  const before = readFileSync(path.join(root, 'package.json'), 'utf8')

  await expect(
    runJsdomCommand(['add'], {
      cwd: root,
      env,
      install: () => {
        throw new Error('fixture install failure')
      },
    }),
  ).rejects.toThrow('lockfile or node_modules may need repair')
  expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before)
})

test('adding twice keeps one ownership record and remains removable', async () => {
  const root = makeProject({
    name: 'consumer',
    dependencies: { jsdom: '^30.0.1' },
  })
  const install = vi.fn()

  await runJsdomCommand(['add'], { cwd: root, env, install })
  const first = readFileSync(path.join(root, 'package.json'), 'utf8')
  await runJsdomCommand(['add'], { cwd: root, env, install })

  expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(first)
  expect(install).toHaveBeenCalledTimes(2)
  await runJsdomCommand(['remove'], { cwd: root, env, install })
  expect(readPackage(root).overrides).toBeUndefined()
  expect(install).toHaveBeenCalledTimes(3)
})

test('a changed owned override stops remove before any file changes', async () => {
  const root = makeProject({
    name: 'consumer',
    dependencies: { jsdom: '^30.0.1' },
  })
  const install = vi.fn()
  await runJsdomCommand(['add'], { cwd: root, env, install })
  const changed = readPackage(root)
  changed.overrides!['@asamuzakjp/dom-selector'] = 'npm:other-package@1.0.0'
  writePackage(root, changed)
  const beforeRemove = readFileSync(path.join(root, 'package.json'), 'utf8')

  await expect(
    runJsdomCommand(['remove'], { cwd: root, env, install }),
  ).rejects.toThrow('changed after it was added')
  expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(
    beforeRemove,
  )
  expect(install).toHaveBeenCalledTimes(1)
})

test.each([
  {
    name: 'version-qualified override',
    overrides: { '@asamuzakjp/dom-selector@^9': alias },
  },
  {
    name: 'nested override',
    overrides: { parent: { '@asamuzakjp/dom-selector': alias } },
  },
])('$name conflicts are rejected before writes', async ({ overrides }) => {
  const root = makeProject({
    name: 'consumer',
    dependencies: { jsdom: '^30.0.1' },
    overrides,
  })
  const before = readFileSync(path.join(root, 'package.json'), 'utf8')
  const install = vi.fn()

  await expect(
    runJsdomCommand(['add'], { cwd: root, env, install }),
  ).rejects.toThrow('override')
  expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before)
  expect(install).not.toHaveBeenCalled()
})

test('legacy pnpm overrides and mixed lockfiles are rejected', async () => {
  const legacy = makeProject(
    {
      name: 'consumer',
      packageManager: 'pnpm@12.14.0',
      dependencies: { jsdom: '^30.0.1' },
      pnpm: { overrides: { '@asamuzakjp/dom-selector': alias } },
    },
    'pnpm',
  )
  const legacyBefore = readFileSync(path.join(legacy, 'package.json'), 'utf8')
  await expect(
    runJsdomCommand(['add'], {
      cwd: legacy,
      env: { npm_config_user_agent: 'pnpm/12.14.0' },
      install: vi.fn(),
    }),
  ).rejects.toThrow('pnpm.overrides')
  expect(readFileSync(path.join(legacy, 'package.json'), 'utf8')).toBe(
    legacyBefore,
  )

  const mixed = makeProject({
    name: 'consumer',
    dependencies: { jsdom: '^30.0.1' },
  })
  writeFileSync(path.join(mixed, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
  const install = vi.fn()
  await expect(
    runJsdomCommand(['add'], { cwd: mixed, env, install }),
  ).rejects.toThrow('both npm and pnpm lockfiles')
  expect(install).not.toHaveBeenCalled()
})

test('an installer failure does not overwrite a concurrent config edit', async () => {
  const root = makeProject({
    name: 'consumer',
    dependencies: { jsdom: '^30.0.1' },
  })

  await expect(
    runJsdomCommand(['add'], {
      cwd: root,
      env,
      install: () => {
        const current = readPackage(root)
        current['added-by-user'] = true
        writePackage(root, current)
        throw new Error('fixture install failure')
      },
    }),
  ).rejects.toThrow('concurrently changed files')
  expect(readPackage(root)['added-by-user']).toBe(true)
  expect(readPackage(root).overrides?.['@asamuzakjp/dom-selector']).toBe(alias)
})

test('Windows manager calls pass paths as separate arguments', () => {
  const calls: Array<{
    command: string
    args: string[]
    cwd: string
    shell: boolean
  }> = []
  const execute: PackageCommandExecutor = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, shell: options.shell })
    return { status: 0, signal: null }
  }
  const projectPath = 'C:\\Users\\Test User\\my project'

  installWithExecutor(
    {
      manager: 'npm',
      cwd: projectPath,
      env: {
        npm_config_user_agent: 'npm/12.2.0 node/v26.12.1',
        npm_execpath: 'C:\\Program Files\\npm\\npm-cli.js',
      },
      platform: 'win32',
    },
    execute,
  )

  expect(calls).toEqual([
    {
      command: process.execPath,
      args: ['C:\\Program Files\\npm\\npm-cli.js', 'install'],
      cwd: projectPath,
      shell: false,
    },
  ])

  installWithExecutor(
    {
      manager: 'pnpm',
      cwd: projectPath,
      env: {},
      platform: 'win32',
    },
    execute,
  )
  expect(calls[1]).toEqual({
    command: 'pnpm',
    args: ['install', '--no-frozen-lockfile'],
    cwd: projectPath,
    shell: true,
  })
})

function makeProject(
  packageJson: Record<string, unknown> = {
    name: 'consumer',
    dependencies: { jsdom: '^30.0.1' },
  },
  manager: 'npm' | 'pnpm' = 'npm',
): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-jsdom-cli-test-'))
  roots.push(root)
  writePackage(root, packageJson)
  if (manager === 'npm') {
    writeFileSync(path.join(root, 'package-lock.json'), '{}\n')
  } else {
    writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
  }
  return root
}

function readPackage(root: string): TestPackage {
  return JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as TestPackage
}

function writePackage(root: string, packageJson: TestPackage): void {
  writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  )
}
