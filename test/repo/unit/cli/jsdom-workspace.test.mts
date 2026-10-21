import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import manifest from '../../../../package.json' with { type: 'json' }
import { parse as parseYaml } from 'yaml'
import { afterEach, expect, test, vi } from 'vitest'
import { runJsdomCommand } from '../../../../scripts/repo/cli/jsdom.mts'

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

test('pnpm workspace configuration is edited at its included root', async () => {
  const root = makeProject(
    { name: 'workspace', packageManager: 'pnpm@12.14.0' },
    'pnpm',
  )
  const app = path.join(root, 'packages', 'app')
  mkdirSync(app, { recursive: true })
  writePackage(app, { name: 'app', dependencies: { jsdom: '^30.0.1' } })
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    [
      'packages:',
      '  - packages/*',
      'overrides:',
      '  # Keep this workspace setting.',
      "  keep-me: '1.0.0'",
      '',
    ].join('\n'),
  )
  const install = vi.fn()

  await runJsdomCommand(['add'], {
    cwd: app,
    env: { npm_config_user_agent: 'pnpm/12.14.0' },
    install,
  })

  const rootPackage = readPackage(root)
  const workspace = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
  expect(rootPackage.nwsapi?.jsdomOverride.manager).toBe('pnpm')
  expect(rootPackage.dependencies?.['css-tree']).toBe('^3.2.1')
  expect(workspace).toContain('# Keep this workspace setting.')
  expect(workspace).toContain('keep-me:')
  expect(parseYaml(workspace).overrides['@asamuzakjp/dom-selector']).toBe(alias)
  expect(existsSync(path.join(app, 'package.json'))).toBe(true)
  expect(install).toHaveBeenCalledWith(
    expect.objectContaining({ manager: 'pnpm', cwd: root }),
  )

  await runJsdomCommand(['remove'], {
    cwd: app,
    env: { npm_config_user_agent: 'pnpm/12.14.0' },
    install,
  })
  const removedWorkspace = readFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    'utf8',
  )
  expect(
    parseYaml(removedWorkspace).overrides['@asamuzakjp/dom-selector'],
  ).toBeUndefined()
  expect(removedWorkspace).toContain('# Keep this workspace setting.')
  expect(readPackage(root).dependencies?.['css-tree']).toBeUndefined()
  expect(install).toHaveBeenCalledTimes(2)
})

test('pnpm creates and removes its workspace override file when none exists', async () => {
  const root = makeProject(
    {
      name: 'consumer',
      packageManager: 'pnpm@12.14.0',
      dependencies: { jsdom: '^30.0.1' },
    },
    'pnpm',
  )
  const workspacePath = path.join(root, 'pnpm-workspace.yaml')
  rmSync(workspacePath)
  const install = vi.fn()

  await runJsdomCommand(['add'], {
    cwd: root,
    env: { npm_config_user_agent: 'pnpm/12.14.0' },
    install,
  })
  expect(existsSync(workspacePath)).toBe(true)
  expect(
    readPackage(root).nwsapi?.jsdomOverride.createdWorkspaceYaml?.value,
  ).toBe(readFileSync(workspacePath, 'utf8'))
  expect(
    parseYaml(readFileSync(workspacePath, 'utf8')).overrides[
      '@asamuzakjp/dom-selector'
    ],
  ).toBe(alias)

  await runJsdomCommand(['remove'], {
    cwd: root,
    env: { npm_config_user_agent: 'pnpm/12.14.0' },
    install,
  })
  expect(existsSync(workspacePath)).toBe(false)
  expect(install).toHaveBeenCalledTimes(2)
})

test('pnpm active yaml nested selector conflicts fail before writes', async () => {
  const root = makeProject(
    {
      name: 'consumer',
      packageManager: 'pnpm@12.14.0',
      dependencies: { jsdom: '^30.0.1' },
      overrides: { 'jsdom>@asamuzakjp/dom-selector': 'other' },
    },
    'pnpm',
  )
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    'overrides:\n  "jsdom>@asamuzakjp/dom-selector": other\n',
  )
  const before = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
  const install = vi.fn()

  await expect(
    runJsdomCommand(['add'], {
      cwd: root,
      env: { npm_config_user_agent: 'pnpm/12.14.0' },
      install,
    }),
  ).rejects.toThrow('nested or version-qualified')
  expect(readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(
    before,
  )
  expect(install).not.toHaveBeenCalled()
})

test('workspace exclusions keep the nested package as its own root', async () => {
  const root = makeProject(
    {
      name: 'workspace',
      packageManager: 'npm@12.2.0',
      workspaces: { packages: ['packages/*', '!packages/ignored'] },
    },
    'npm',
  )
  const ignored = path.join(root, 'packages', 'ignored')
  mkdirSync(ignored, { recursive: true })
  writePackage(ignored, {
    name: 'ignored',
    dependencies: { jsdom: '^30.0.1' },
  })
  const install = vi.fn()

  await runJsdomCommand(['add', '--dry-run'], {
    cwd: ignored,
    env,
    install,
  })

  expect(readPackage(root).overrides).toBeUndefined()
  expect(readPackage(ignored).overrides).toBeUndefined()
  expect(install).not.toHaveBeenCalled()
})

test('workspace patterns normalize leading dots and repeated separators', async () => {
  const root = makeProject(
    {
      name: 'workspace',
      packageManager: 'npm@12.2.0',
      workspaces: ['./packages//*/'],
    },
    'npm',
  )
  const app = path.join(root, 'packages', 'app')
  const hidden = path.join(root, 'packages', '.hidden')
  mkdirSync(app, { recursive: true })
  mkdirSync(hidden, { recursive: true })
  writePackage(app, { name: 'app', dependencies: { jsdom: '^30.0.1' } })
  writePackage(hidden, {
    name: 'hidden',
    dependencies: { jsdom: '^30.0.1' },
  })
  const install = vi.fn()

  await runJsdomCommand(['add', '--dry-run'], { cwd: app, env, install })
  await runJsdomCommand(['add', '--dry-run'], { cwd: hidden, env, install })

  expect(readPackage(root).overrides).toBeUndefined()
  expect(readPackage(app).overrides).toBeUndefined()
  expect(readPackage(hidden).overrides).toBeUndefined()
  expect(install).not.toHaveBeenCalled()
})

test('an unrelated unsupported parent workspace manager is ignored', async () => {
  const root = makeProject(
    {
      name: 'workspace',
      packageManager: 'yarn@4.0.0',
      workspaces: ['packages/*'],
    },
    'npm',
  )
  const child = path.join(root, 'examples', 'standalone')
  mkdirSync(child, { recursive: true })
  writePackage(child, {
    name: 'standalone',
    dependencies: { jsdom: '^30.0.1' },
  })

  await expect(
    runJsdomCommand(['add', '--dry-run'], { cwd: child, env }),
  ).resolves.toContain('Would run npm install')
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
