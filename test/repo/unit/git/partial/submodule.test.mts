import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import type { Entry } from '../../../../../scripts/repo/git/partial/submodule.mts'
const state = vi.hoisted(() => ({
  exists: vi.fn(),
  execute: vi.fn(),
  parse: vi.fn(),
  select: vi.fn(),
  clone: vi.fn(),
  sparse: vi.fn(),
  clean: vi.fn(),
  repo: true,
  head: 'a'.repeat(40) as string | null,
  entries: [] as Entry[],
}))
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal()),
  existsSync: state.exists,
}))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
vi.mock('../../../../../scripts/repo/git/partial/checkout.mts', () => ({
  parseGitmodules: state.parse,
  selectEntries: state.select,
  cloneEntry: state.clone,
  applySparse: state.sparse,
  requireCleanCheckout: state.clean,
  checkoutDir: (entry: Entry) => `/fixture/repo/${entry.path}`,
  headOf: () => state.head,
  isGitRepo: () => state.repo,
}))
const pin = 'a'.repeat(40)
const directory = '/fixture/repo/upstream/wpt'
const entry: Entry = {
  name: 'fixture',
  path: 'upstream/wpt',
  url: 'https://example.invalid/wpt',
  ref: pin,
  branch: 'main',
  shallow: true,
  sparsePatterns: ['resources', 'css'],
  label: 'wpt',
  sha256: createHash('sha256').update('objects').digest('hex'),
  verifyCommand: 'fixture-validator --check',
}
const originalArgs = process.argv
const originalExit = process.exitCode
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.repo = true
  state.head = pin
  state.entries = [{ ...entry, sparsePatterns: [...entry.sparsePatterns] }]
  state.parse.mockImplementation(() => state.entries)
  state.select.mockImplementation((entries: Entry[]) => entries)
  state.exists.mockImplementation(
    (file: string) =>
      file === '/fixture/repo/.gitmodules' ||
      file === directory ||
      file === `${directory}/.git/shallow`,
  )
  state.execute.mockImplementation((command: string, args: string[]) => {
    if (command !== 'git') {
      return Buffer.from('verified')
    }
    if (args.includes('--is-shallow-repository')) {
      return Buffer.from('true')
    }
    if (args.includes('remote.origin.fetch')) {
      return Buffer.from('+refs/heads/main:refs/remotes/origin/main')
    }
    if (args.includes('--absolute-git-dir')) {
      return Buffer.from(`${directory}/.git`)
    }
    if (args.includes('sparse-checkout')) {
      return Buffer.from('css\nresources')
    }
    if (args.includes('status')) {
      return Buffer.from('')
    }
    if (args.includes('ls-tree')) {
      return Buffer.from('objects')
    }
    return Buffer.from('fixture')
  })
  process.argv = ['node', 'submodule.mts', 'verify']
  process.exitCode = undefined
  vi.spyOn(process, 'cwd').mockReturnValue('/fixture/repo/subdir')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = originalArgs
  process.exitCode = originalExit
})
const load = () =>
  import('../../../../../scripts/repo/git/partial/submodule.mts')

test('verification finds the root from subdirectories and checks the pinned object manifest', async () => {
  await load()
  expect(process.exitCode).toBeUndefined()
  expect(state.parse).toHaveBeenCalledWith('/fixture/repo/.gitmodules')
  expect(
    state.execute.mock.calls.some(call => call[1].includes('ls-tree')),
  ).toBe(true)
})
test('clone selects requested entries and delegates without changing checkout validation', async () => {
  process.argv = ['node', 'submodule.mts', 'clone', 'upstream/wpt']
  await load()
  expect(state.select).toHaveBeenCalledWith(state.entries, ['upstream/wpt'])
  expect(state.clone).toHaveBeenCalledWith(state.entries[0])
})
test.each([{ args: [] }, { args: ['--help'] }, { args: ['-h'] }])(
  'help arguments %j return without inspecting checkouts',
  async ({ args }) => {
    process.argv = ['node', 'submodule.mts', ...args]
    await load()
    expect(process.exitCode).toBe(args.length ? 0 : 1)
    expect(state.parse).not.toHaveBeenCalled()
  },
)
test.each(['unknown', '--invalid'])(
  'unsupported command %s fails',
  async command => {
    process.argv = ['node', 'submodule.mts', command]
    await load()
    expect(process.exitCode).toBe(1)
  },
)
test('missing root terminates without traversing above the filesystem root', async () => {
  state.exists.mockReturnValue(false)
  await load()
  expect(process.exitCode).toBe(1)
  expect(state.parse).not.toHaveBeenCalled()
})
test.each([false, true])(
  'missing checkout reports failed invariants with shallow=%s',
  async shallow => {
    state.entries[0]!.shallow = shallow
    state.exists.mockImplementation(
      (file: string) => file === '/fixture/repo/.gitmodules',
    )
    await load()
    expect(process.exitCode).toBe(1)
  },
)
test('a directory belonging to a surrounding repository is rejected', async () => {
  state.repo = false
  await load()
  expect(process.exitCode).toBe(1)
})
test.each([null, 'b'.repeat(40)])(
  'wrong or unborn HEAD %s fails the pin check',
  async head => {
    state.head = head
    await load()
    expect(process.exitCode).toBe(1)
  },
)
test('optional branch and shallow checks are skipped for full unlabelled clones', async () => {
  Object.assign(state.entries[0]!, {
    branch: null,
    shallow: false,
    label: null,
  })
  await load()
  expect(process.exitCode).toBeUndefined()
})
test.each([
  '--is-shallow-repository',
  'remote.origin.fetch',
  'sparse-checkout',
  'status',
  '--absolute-git-dir',
  'ls-tree',
])('failed Git query %s cannot count as verified', async query => {
  const original = state.execute.getMockImplementation()!
  state.execute.mockImplementation((command, args) => {
    if (args.includes(query)) {
      throw new Error('fixture')
    }
    return original(command, args)
  })
  await load()
  expect(process.exitCode).toBe(1)
})
test('incorrect sparse directories and dirty files fail structural verification', async () => {
  const original = state.execute.getMockImplementation()!
  state.execute.mockImplementation((command, args) => {
    if (args.includes('sparse-checkout')) {
      return Buffer.from('wrong')
    }
    if (args.includes('status')) {
      return Buffer.from(' M changed\n?? extra')
    }
    return original(command, args)
  })
  await load()
  expect(process.exitCode).toBe(1)
})
test('missing shallow marker and missing manifest hash fail verification', async () => {
  state.entries[0]!.sha256 = null
  state.exists.mockImplementation(
    (file: string) =>
      file === '/fixture/repo/.gitmodules' || file === directory,
  )
  await load()
  expect(process.exitCode).toBe(1)
})
test('mismatching manifest content fails even when the worktree is clean', async () => {
  state.entries[0]!.sha256 = 'b'.repeat(64)
  await load()
  expect(process.exitCode).toBe(1)
})
test('deep verification runs a plain command only after structural checks pass', async () => {
  process.argv.push('--deep')
  await load()
  expect(state.execute).toHaveBeenCalledWith(
    'fixture-validator',
    ['--check'],
    expect.objectContaining({
      cwd: '/fixture/repo',
      stdio: ['ignore', 'inherit', 'inherit'],
    }),
  )
})
test('deep verification skips entries without a validation command', async () => {
  state.entries[0]!.verifyCommand = null
  process.argv.push('--deep')
  await load()
  expect(state.execute.mock.calls.every(call => call[0] === 'git')).toBe(true)
})
test('failed deep commands propagate unsuccessful verification status', async () => {
  const original = state.execute.getMockImplementation()!
  state.execute.mockImplementation((command, args) => {
    if (command !== 'git') {
      throw new Error('fixture')
    }
    return original(command, args)
  })
  process.argv.push('--deep')
  await load()
  expect(process.exitCode).toBe(1)
})
test('restoring sparse rules requires a clean independent checkout', async () => {
  process.argv = ['node', 'submodule.mts', 'restore-sparse']
  await load()
  expect(state.clean).toHaveBeenCalledWith(directory, state.entries[0])
  expect(state.sparse).toHaveBeenCalledWith(directory, state.entries[0])
})
test.each([true, false])(
  'restore rejects missing or non-Git checkouts repo=%s',
  async repo => {
    process.argv = ['node', 'submodule.mts', 'restore-sparse']
    state.repo = repo
    state.exists.mockImplementation(
      (file: string) =>
        file === '/fixture/repo/.gitmodules' || (!repo && file === directory),
    )
    await load()
    expect(process.exitCode).toBe(1)
    expect(state.sparse).not.toHaveBeenCalled()
  },
)
test('non-Error failures still terminate the CLI unsuccessfully', async () => {
  process.argv = ['node', 'submodule.mts', 'clone']
  state.clone.mockImplementationOnce(() => {
    throw 'fixture'
  })
  await load()
  expect(process.exitCode).toBe(1)
})
test('Git wrappers preserve capture options and trim query output', async () => {
  process.argv = ['node', 'submodule.mts', '--help']
  const module = await load()
  module.git('/fixture', ['status'])
  expect(state.execute.mock.calls.at(-1)![2].stdio).toEqual([
    'ignore',
    'pipe',
    'inherit',
  ])
  module.git('/fixture', ['status'], { capture: false })
  expect(state.execute.mock.calls.at(-1)![2].stdio).toEqual([
    'ignore',
    'inherit',
    'inherit',
  ])
  state.execute.mockReturnValueOnce(Buffer.from(' fixture \n'))
  expect(module.tryGitText('/fixture', ['query'])).toBe('fixture')
  state.execute.mockImplementationOnce(() => {
    throw new Error('fixture')
  })
  expect(module.tryGitText('/fixture', ['query'])).toBeNull()
})
