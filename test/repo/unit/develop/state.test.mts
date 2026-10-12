import { expect, test } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEVELOPER_STATE_MAX_AGE_MS,
  readDeveloperState,
  writeDeveloperState,
} from '../../../../scripts/repo/develop/state.mts'

function temporaryCheckout() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-menu-state-'))
  mkdirSync(path.join(root, '.cache'))
  return root
}

const identity = { checkout: '/checkout', revision: 'abc123' }

test('stores only versioned task metadata with private file permissions', () => {
  const root = temporaryCheckout()
  try {
    const state = writeDeveloperState(root, identity, {
      taskId: 'review',
      status: 'failed',
      exitCode: 1,
      signal: null,
      updatedAt: new Date(10_000).toISOString(),
    })
    const file = path.join(root, '.cache/developer-state.json')
    expect(state).toMatchObject({ schemaVersion: 1, ...identity })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(state)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(readDeveloperState(root, identity, ['review'], 10_000)).toEqual(
      state,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects state from another checkout, expired records, and unknown fields', () => {
  const root = temporaryCheckout()
  try {
    const updatedAt = new Date(10_000).toISOString()
    writeDeveloperState(root, identity, {
      taskId: 'review',
      status: 'completed',
      exitCode: 0,
      signal: null,
      updatedAt,
    })
    expect(
      readDeveloperState(
        root,
        { checkout: '/other', revision: 'abc123' },
        ['review'],
        10_000,
      ),
    ).toBeUndefined()
    expect(
      readDeveloperState(
        root,
        identity,
        ['review'],
        10_000 + DEVELOPER_STATE_MAX_AGE_MS + 1,
      ),
    ).toBeUndefined()
    const file = path.join(root, '.cache/developer-state.json')
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        ...identity,
        taskId: 'review',
        status: 'completed',
        exitCode: 0,
        signal: null,
        updatedAt,
        environment: { SECRET: 'private' },
      }),
    )
    expect(
      readDeveloperState(root, identity, ['review'], 10_000),
    ).toBeUndefined()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ignores malformed state and does not treat an old success as validation', () => {
  const root = temporaryCheckout()
  try {
    const file = path.join(root, '.cache/developer-state.json')
    writeFileSync(file, '{bad json')
    expect(readDeveloperState(root, identity, ['review'])).toBeUndefined()
    writeDeveloperState(root, identity, {
      taskId: 'review',
      status: 'completed',
      exitCode: 0,
      signal: null,
      updatedAt: new Date().toISOString(),
    })
    const restored = readDeveloperState(root, identity, ['review'])
    expect(restored?.status).toBe('completed')
    expect(restored?.revision).toBe('abc123')
    expect(restored).not.toHaveProperty('ready')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
