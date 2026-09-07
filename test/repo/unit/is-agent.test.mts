import process from 'node:process'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const agentKeys = [
  'AI_AGENT',
  'AUGMENT_AGENT',
  'CLAUDE_CODE',
  'CLAUDECODE',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'CURSOR_AGENT',
  'GEMINI_CLI',
  'GOOSE_PROVIDER',
  'JUNIE_DATA',
  'JUNIE_SHIM_PATH',
  'OPENCODE',
  'REPL_ID',
]
const tty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')

beforeEach(() => {
  vi.resetModules()
  for (const key of [
    ...agentKeys,
    'EDITOR',
    'TERM_PROGRAM',
    'GITHUB_ACTIONS',
  ]) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('PATH', '/usr/bin')
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value: false,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  if (tty) {
    Object.defineProperty(process.stdout, 'isTTY', tty)
  } else {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  }
})

test('a normal terminal, CI, or empty agent flag does not imply an agent', async () => {
  vi.stubEnv('CI', 'true')
  for (const key of agentKeys) {
    vi.stubEnv(key, '')
  }
  const { isAgent } = await import('../../../scripts/repo/lib/is-agent.mts')
  expect(isAgent()).toBe(false)
})

for (const key of agentKeys) {
  test(`detects ${key}`, async () => {
    vi.stubEnv(key, '1')
    const { isAgent } = await import('../../../scripts/repo/lib/is-agent.mts')
    expect(isAgent()).toBe(true)
  })
}

for (const [key, value] of [
  ['PATH', '/home/user/.pi/agent/bin:/usr/bin'],
  ['PATH', 'C:\\Users\\dev\\.pi\\agent\\bin'],
  ['EDITOR', '/opt/devin/editor'],
  ['TERM_PROGRAM', 'kiro'],
]) {
  test(`detects the ${key} signature ${value}`, async () => {
    vi.stubEnv(key, value)
    const { isAgent } = await import('../../../scripts/repo/lib/is-agent.mts')
    expect(isAgent()).toBe(true)
  })
}

test('an interactive Kiro terminal alone is not an agent', async () => {
  vi.stubEnv('TERM_PROGRAM', 'kiro')
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value: true,
  })
  const { isAgent } = await import('../../../scripts/repo/lib/is-agent.mts')
  expect(isAgent()).toBe(false)
})

for (const initial of [false, true]) {
  test(`memoizes the initial ${initial} result`, async () => {
    vi.stubEnv('AI_AGENT', initial ? 'codex' : undefined)
    const { isAgent } = await import('../../../scripts/repo/lib/is-agent.mts')
    expect(isAgent()).toBe(initial)
    vi.stubEnv('AI_AGENT', initial ? undefined : 'codex')
    expect(isAgent()).toBe(initial)
  })
}

test('agent runs use minimal Node and dot WPT reporters', async () => {
  vi.stubEnv('CODEX_THREAD_ID', 'thread')
  const { default: node } = await import('../../../.config/vitest.config.mts')
  const { default: wpt } =
    await import('../../../.config/playwright.config.mts')
  expect(node.test.reporters).toEqual(['minimal'])
  expect(wpt.reporter).toBe('dot')
})

test('agent CI runs keep GitHub annotations', async () => {
  vi.stubEnv('AI_AGENT', 'codex')
  vi.stubEnv('GITHUB_ACTIONS', 'true')
  const { default: node } = await import('../../../.config/vitest.config.mts')
  expect(node.test.reporters).toEqual(['minimal', 'github-actions'])
})

test('non-agent runs keep the existing reporter choices', async () => {
  const { default: node } = await import('../../../.config/vitest.config.mts')
  const { default: wpt } =
    await import('../../../.config/playwright.config.mts')
  expect(node.test.reporters).toBeUndefined()
  expect(wpt.reporter).toBe('list')
})
