import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bootstrap } from '../../../scripts/setup.mjs'
import { managedEnvironment } from '../../../scripts/lib/tools/setup.mjs'
import {
  manifest,
  toolPlan,
  toolVersion,
  toolchainState,
} from '../../../scripts/lib/external-tools.mjs'

const tools = { node: '/pinned/node', npm: '/pinned/npm-cli.js' }

test('setup installs with npm before completing repository preparation', async () => {
  const calls = []
  const run = (command, args, options) => {
    calls.push({ command, args, options })
    return { status: 0, signal: null }
  }
  const result = await bootstrap({}, async () => tools, run)
  assert.equal(result.status, 0)
  assert.deepEqual(calls[0].args, [tools.npm, 'ci', '--ignore-scripts'])
  assert.equal(calls[0].command, tools.node)
  assert.equal(calls[1].command, tools.node)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].options.env.npm_lifecycle_event, undefined)
})

test('prepare hooks do not start another dependency installation', async () => {
  const calls = []
  await bootstrap(
    { prepare: true },
    async () => tools,
    (command, args) => {
      calls.push({ command, args })
      return { status: 0, signal: null }
    },
  )
  assert.equal(calls.length, 1)
  assert.notEqual(calls[0].args[0], tools.npm)
})

test('tools-only setup does not execute the package manager', async () => {
  const result = await bootstrap(
    { toolsOnly: true },
    async () => tools,
    () => assert.fail('unexpected installation'),
  )
  assert.equal(result.status, 0)
})

test('failed installations and signals prevent repository preparation', async () => {
  const outcomes = [
    { status: 7, signal: null },
    { status: null, signal: 'SIGINT' },
  ]
  for (let i = 0, length = outcomes.length; i < length; i += 1) {
    let calls = 0
    const result = await bootstrap(
      {},
      async () => tools,
      () => {
        calls += 1
        return outcomes[i]
      },
    )
    assert.equal(result, outcomes[i])
    assert.equal(calls, 1)
  }
})

test('spawn errors retain their error code', async () => {
  const error = Object.assign(new Error('missing executable'), {
    code: 'ENOENT',
  })
  await assert.rejects(
    bootstrap(
      {},
      async () => tools,
      () => ({ error }),
    ),
    { code: 'ENOENT' },
  )
})

test('managed environment preserves custom settings and removes parent identity', () => {
  const env = managedEnvironment({
    PATH: '/system',
    npm_config_user_agent: 'pnpm/12',
    npm_lifecycle_event: 'setup',
    NODE_OPTIONS: '--inspect',
    CUSTOM: 'keep',
  })
  assert.equal(env.CUSTOM, 'keep')
  assert.equal(env.npm_config_user_agent, undefined)
  assert.equal(env.npm_lifecycle_event, undefined)
  assert.equal(env.NODE_OPTIONS, undefined)
})

test('all committed assets produce HTTPS plans and exact tool versions', () => {
  const names = ['npm', 'pnpm', 'nub']
  for (let i = 0, length = names.length; i < length; i += 1) {
    const name = names[i]
    const platforms = Object.keys(
      manifest.tools[name].platforms ?? { universal: true },
    )
    for (let j = 0, count = platforms.length; j < count; j += 1) {
      const plan = toolPlan(name, platforms[j])
      assert.equal(new URL(plan.url).protocol, 'https:')
      assert.equal(plan.version, toolVersion(name))
    }
  }
})

test('invalid versions and traversal paths report a stable error code', () => {
  assert.throws(
    () => toolVersion('npm', { tools: { npm: { version: 'latest' } } }),
    { code: 'ERR_TOOL_PIN' },
  )
  const data = structuredClone(manifest)
  data.tools.npm.binary = '../escaped'
  assert.throws(() => toolPlan('npm', 'universal', data), {
    code: 'ERR_TOOL_PIN',
  })
})

test('toolchain state identifies this branch and its complete pinned assets', () => {
  const state = JSON.parse(toolchainState())
  assert.equal(state.manager, 'npm')
  assert.equal(state.node, toolVersion('node'))
  assert.deepEqual(
    state.tools.map(tool => tool.name),
    ['nub', 'npm', 'pnpm', 'mise'],
  )
  assert.ok(state.tools.every(tool => tool.integrity && tool.version))
})
