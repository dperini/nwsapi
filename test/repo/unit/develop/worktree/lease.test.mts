import { expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os, { hostname } from 'node:os'
import path from 'node:path'
import {
  claimWorktree,
  inspectPulse,
} from '../../../../../scripts/repo/develop/worktree/lease.mts'

function metadata(root: string) {
  return {
    schemaVersion: 1 as const,
    repository: root,
    path: path.join(root, 'checkout'),
    version: 'v3' as const,
    sourceBranch: 'agent/v3-test',
    sourceHead: 'abc123',
    targetBranch: 'prerelease/3.0.0',
    owner: 'test',
  }
}

test('claims pulse exclusively, persists worktree metadata, and releases only its token', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-lease-test-'))
  const pulse = path.join(root, 'pulse.json')
  try {
    const lease = await claimWorktree(metadata(root), pulse)
    const original = JSON.parse(readFileSync(pulse, 'utf8')) as {
      token: string
    }
    expect(
      JSON.parse(
        readFileSync(path.join(root, '.nwsapi-worktree.json'), 'utf8'),
      ),
    ).toMatchObject(metadata(root))
    await expect(claimWorktree(metadata(root), pulse)).rejects.toThrow()
    writeFileSync(pulse, JSON.stringify({ ...original, token: 'replacement' }))
    await lease.release()
    expect(JSON.parse(readFileSync(pulse, 'utf8')).token).toBe('replacement')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reports live expired pulses as active and malformed pulses as uncertain', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-pulse-test-'))
  const pulse = path.join(root, 'pulse.json')
  try {
    writeFileSync(
      pulse,
      JSON.stringify({
        pid: process.pid,
        token: 'alive',
        hostname: hostname(),
        refreshedAt: 1,
      }),
    )
    expect(await inspectPulse(pulse, 10)).toMatchObject({
      active: true,
      expired: true,
    })
    writeFileSync(pulse, '{broken')
    expect(await inspectPulse(pulse)).toMatchObject({
      active: false,
      reason: 'invalid',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refreshes a live pulse and leaves a matching clean release marker', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-pulse-refresh-'))
  const pulse = path.join(root, 'pulse.json')
  let lease: Awaited<ReturnType<typeof claimWorktree>> | undefined
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  try {
    lease = await claimWorktree(metadata(root), pulse)
    const first = JSON.parse(readFileSync(pulse, 'utf8')).refreshedAt as number
    await vi.advanceTimersByTimeAsync(3100)
    await vi.waitFor(() => {
      const refreshed = JSON.parse(readFileSync(pulse, 'utf8'))
        .refreshedAt as number
      expect(refreshed).toBeGreaterThan(first)
    })
    await lease.release()
    const released = JSON.parse(
      readFileSync(path.join(root, '.nwsapi-worktree.json'), 'utf8'),
    )
    expect(released).toMatchObject({
      leaseToken: lease.token,
      releasedToken: lease.token,
    })
    expect(() => readFileSync(pulse, 'utf8')).toThrow()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(3100)
    expect(() => readFileSync(pulse, 'utf8')).toThrow()
  } finally {
    await lease?.release()
    vi.useRealTimers()
    rmSync(root, { recursive: true, force: true })
  }
})
