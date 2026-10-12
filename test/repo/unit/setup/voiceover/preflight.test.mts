import { expect, test, vi } from 'vitest'
import { preflightVoiceOver } from '../../../../../scripts/repo/setup/voiceover/preflight.mts'

test('preflight distinguishes ready setup, assets, and unverified permissions', () => {
  const result = preflightVoiceOver({
    platform: 'darwin',
    release: '24.0.0',
    home: '/home/test',
    root: '/repo',
    fileProbe: () => 'present',
    defaultsProbe: () => 'present',
    manifestProbe: () => ({
      screenReaders: [
        {
          id: 'voiceover',
          platforms: ['darwin'],
          assets: [
            {
              platformVersion: '24',
              version: '1',
              asset: 'asset.zip',
              sha256: 'hash',
            },
          ],
        },
      ],
    }),
    assetProbe: () => 'missing',
  })
  expect(result).toEqual({
    platform: 'darwin',
    supported: true,
    machineSetup: 'ready',
    assets: 'missing',
    permissions: 'unverified',
    localPreferences: 'present',
  })
})

test('permission probe uncertainty never counts as absent or ready', () => {
  const result = preflightVoiceOver({
    platform: 'darwin',
    release: '24.0.0',
    fileProbe: file =>
      file.includes('.VoiceOverAppleScriptEnabled') ? 'unknown' : 'present',
    defaultsProbe: () => 'present',
    manifestProbe: () => undefined,
  })
  expect(result.machineSetup).toBe('unknown')
  expect(result.permissions).toBe('unverified')
})

test('unsupported platforms are reported without probing the host', () => {
  const probe = vi.fn(() => 'present' as const)
  const result = preflightVoiceOver({ platform: 'linux', fileProbe: probe })
  expect(result).toMatchObject({
    supported: false,
    machineSetup: 'unsupported',
    assets: 'unsupported',
    localPreferences: 'unsupported',
  })
  expect(probe).not.toHaveBeenCalled()
})
