import { beforeEach, expect, test, vi } from 'vitest'
import type { Entry } from '../../../../../scripts/repo/git/partial/submodule.mts'
const state = vi.hoisted(() => ({
  read: vi.fn(),
  exists: vi.fn(),
  stat: vi.fn(),
  real: vi.fn(),
  list: vi.fn(),
  git: vi.fn(),
  text: vi.fn(),
}))
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal()),
  readFileSync: state.read,
  existsSync: state.exists,
  lstatSync: state.stat,
  realpathSync: state.real,
  readdirSync: state.list,
}))
vi.mock('../../../../../scripts/repo/git/partial/submodule.mts', () => ({
  ROOT: '/fixture/repo',
  git: state.git,
  tryGitText: state.text,
}))
import {
  parseGitmodules,
  selectEntries,
  checkoutDir,
  requireCleanCheckout,
  isGitRepo,
  headOf,
  applySparse,
  cloneEntry,
} from '../../../../../scripts/repo/git/partial/checkout.mts'
const pin = 'a'.repeat(40)
const entry: Entry = {
  name: 'fixture',
  path: 'upstream/wpt',
  url: 'https://example.invalid/wpt',
  ref: pin,
  branch: 'main',
  shallow: true,
  sparsePatterns: ['css', 'resources'],
  label: null,
  sha256: null,
  verifyCommand: null,
}
const directory = '/fixture/repo/upstream/wpt'
beforeEach(() => {
  vi.clearAllMocks()
  state.exists.mockReturnValue(false)
  state.stat.mockReturnValue({})
  state.real.mockImplementation((file: string) => file)
  state.list.mockReturnValue([])
  state.text.mockImplementation((_cwd: string, args: string[]) => {
    if (args.includes('--show-toplevel')) {
      return directory
    }
    if (args.includes('status')) {
      return ''
    }
    if (args.includes('HEAD')) {
      return pin
    }
    return null
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
function modules(values: Record<string, string> = {}) {
  return `[submodule "fixture"]\n${Object.entries({
    url: entry.url,
    ref: pin,
    ...values,
  })
    .map(([key, value]) => `${key} = ${value}`)
    .join('\n')}`
}
test('Git config parsing respects metadata, quotes, boolean keys and sparse paths', () => {
  state.read.mockReturnValue(
    `orphan = ignored\n\n; fixture sha256:${'A'.repeat(64)}\n[submodule "fixture"]\nurl = "${entry.url}"\nref = ${pin}\nshallow\nbranch = main\nsparse-checkout = css resources\nverify = npm test\ninvalid!text`,
  )
  expect(parseGitmodules('/fixture/.gitmodules')).toEqual([
    {
      ...entry,
      path: 'fixture',
      label: 'fixture',
      sha256: 'a'.repeat(64),
      verifyCommand: 'npm test',
    },
  ])
})
test('ordinary comments clear metadata and omitted optional fields have safe defaults', () => {
  state.read.mockReturnValue(
    `# fixture sha256:${'a'.repeat(64)}\n# unrelated\n${modules()}`,
  )
  expect(parseGitmodules('/fixture/.gitmodules')[0]).toMatchObject({
    label: null,
    sha256: null,
    branch: null,
    shallow: false,
    sparsePatterns: [],
    verifyCommand: null,
  })
})
test.each([
  { ref: '' },
  { url: '' },
  { ref: '--upload-pack=bad' },
  { url: 'http://example.invalid' },
  { path: '/outside' },
  { path: '..' },
  { path: '../outside' },
  { path: '.' },
  { 'sparse-checkout': '-bad' },
])('unsafe config %j is rejected before Git runs', values => {
  state.read.mockReturnValue(modules(values))
  expect(() => parseGitmodules('/fixture/.gitmodules')).toThrow(Error)
  expect(state.git).not.toHaveBeenCalled()
})
test('selection supports names and normalized checkout paths and rejects missing entries', () => {
  expect(selectEntries([entry], [])).toEqual([entry])
  expect(selectEntries([entry], ['fixture', 'upstream/wpt/'])).toEqual([
    entry,
    entry,
  ])
  expect(() => selectEntries([entry], ['unknown'])).toThrow(Error)
})
test('checkout containment checks the nearest existing ancestor', () => {
  state.stat.mockImplementationOnce(() => {
    throw Object.assign(new Error('missing'), { code: 'ENOENT' })
  })
  expect(checkoutDir(entry)).toBe(directory)
  expect(state.stat).toHaveBeenCalledWith('/fixture/repo/upstream')
})
test('non-missing filesystem errors propagate rather than climbing ancestors', () => {
  const error = Object.assign(new Error('fixture'), { code: 'EACCES' })
  state.stat.mockImplementationOnce(() => {
    throw error
  })
  expect(() => checkoutDir(entry)).toThrow(
    expect.objectContaining({ code: 'EACCES' }),
  )
})
test.each(['/outside', '/fixture', '/fixture/repo'])(
  'symlink destination %s cannot escape or replace the root',
  target => {
    state.real.mockImplementation((file: string) =>
      file === directory ? target : file,
    )
    expect(() => checkoutDir(entry)).toThrow(Error)
  },
)
test('only clean readable checkouts can be updated', () => {
  requireCleanCheckout(directory, entry)
  state.text.mockReturnValueOnce('dirty')
  expect(() => requireCleanCheckout(directory, entry)).toThrow(Error)
  state.text.mockReturnValueOnce(null)
  expect(() => requireCleanCheckout(directory, entry)).toThrow(Error)
})
test('repository identity and pinned HEAD use the checkout itself', () => {
  expect(isGitRepo(directory)).toBe(true)
  expect(headOf(directory)).toBe(pin)
  state.text.mockReturnValueOnce(null)
  expect(isGitRepo(directory)).toBe(false)
  state.text.mockReturnValueOnce('/fixture/repo')
  expect(isGitRepo(directory)).toBe(false)
  state.real.mockImplementationOnce(() => {
    throw new Error('missing')
  })
  expect(isGitRepo(directory)).toBe(false)
})
test('sparse setup retains one branch and protects option boundaries', () => {
  applySparse(directory, entry)
  expect(state.git.mock.calls.map(call => call[1])).toEqual([
    [
      '-C',
      directory,
      'config',
      '--replace-all',
      'remote.origin.fetch',
      '+refs/heads/main:refs/remotes/origin/main',
    ],
    ['-C', directory, 'sparse-checkout', 'init', '--cone'],
    ['-C', directory, 'sparse-checkout', 'set', '--', 'css', 'resources'],
  ])
  state.git.mockClear()
  applySparse(directory, { ...entry, branch: null, sparsePatterns: [] })
  expect(state.git).not.toHaveBeenCalled()
})
test('new partial clones are shallow and detach at the pinned commit', () => {
  cloneEntry(entry)
  expect(state.git.mock.calls[0]![1]).toEqual([
    'clone',
    '--no-checkout',
    '--filter=blob:none',
    '--single-branch',
    '--depth=1',
    '--branch',
    'main',
    '--',
    entry.url,
    directory,
  ])
  expect(state.git.mock.calls.at(-2)![1]).toEqual([
    '-C',
    directory,
    'fetch',
    '--depth',
    '1',
    '--filter=blob:none',
    'origin',
    pin,
  ])
  expect(state.git.mock.calls.at(-1)![1]).toEqual([
    '-C',
    directory,
    'checkout',
    '--detach',
    'FETCH_HEAD',
    '--',
  ])
})
test('matching existing pins require no clone or fetch', () => {
  state.exists.mockReturnValue(true)
  cloneEntry(entry)
  expect(state.git).not.toHaveBeenCalled()
})
test('changed pins reapply sparse patterns before fetching', () => {
  state.exists.mockReturnValue(true)
  state.text.mockImplementation((_cwd: string, args: string[]) =>
    args.includes('--show-toplevel')
      ? directory
      : args.includes('status')
        ? ''
        : 'b'.repeat(40),
  )
  cloneEntry(entry)
  expect(state.git.mock.calls[0]![1]).toContain('config')
  expect(state.git.mock.calls.at(-1)![1]).toContain('--detach')
})
test('nonempty unrelated directories are never overwritten', () => {
  state.exists.mockReturnValue(true)
  state.text.mockReturnValue(null)
  state.list.mockReturnValue(['unrelated.txt'])
  expect(() => cloneEntry(entry)).toThrow(Error)
  expect(state.git).not.toHaveBeenCalled()
})
test('empty checkout directories support full-history branchless clones', () => {
  state.exists.mockReturnValue(true)
  state.text.mockReturnValue(null)
  cloneEntry({ ...entry, shallow: false, branch: null, sparsePatterns: [] })
  expect(state.git.mock.calls[0]![1]).not.toContain('--branch')
  expect(state.git.mock.calls[0]![1]).not.toContain('--depth=1')
  expect(state.git.mock.calls[1]![1]).not.toContain('--depth')
})

test.each([`url = ${entry.url}`, `ref = ${pin}`])(
  'absent required config fields fail before cloning',
  field => {
    state.read.mockReturnValue(`[submodule "fixture"]\n${field}`)
    expect(() => parseGitmodules('/fixture/.gitmodules')).toThrow(Error)
    expect(state.git).not.toHaveBeenCalled()
  },
)
