import { expect, test } from 'vitest'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }
import {
  checkExternalTools,
  toolPlan,
  toolPlatform,
  toolVersions,
  validAssetFormat,
  validateAsset,
} from '../../../scripts/repo/external-tools.mts'

test('every declared platform has a pinned release URL and integrity', () => {
  checkExternalTools()
  for (const name of ['pnpm', 'nub', 'sfw'] as const) {
    for (const platform of Object.keys(manifest.tools[name].platforms)) {
      const plan = toolPlan(name, platform)
      expect(plan.url).toBe(
        `https://github.com/${manifest.tools[name].repository.slice(7)}/releases/download/v${plan.version}/${plan.asset}`,
      )
      expect(plan.integrity).toMatch(/^sha256-/)
    }
  }
  expect(toolPlan('npm').url).toBe(
    'https://registry.npmjs.org/npm/-/npm-12.0.2.tgz',
  )
})

test('exact versions and valid sources are required', () => {
  expect(Object.getPrototypeOf(toolVersions())).toBeNull()
  for (const version of [
    '26',
    'latest',
    '26\nOTHER=value',
    '26; echo unsafe',
  ]) {
    const data = structuredClone(manifest)
    data.tools.node.version = version
    expect(() => toolVersions(data)).toThrow(
      'Invalid external tool configuration',
    )
  }
  const data = structuredClone(manifest)
  data.tools.pnpm.origin = 'system'
  expect(() => toolVersions(data)).toThrow(
    'Invalid external tool configuration',
  )
})

test('missing platforms and unsafe archive paths fail closed', () => {
  expect(() => toolPlan('nub', 'linux-riscv64')).toThrow('Missing or invalid')
  for (const binary of ['/tmp/nub', '../nub', 'bin/../../nub']) {
    const data = structuredClone(manifest)
    data.tools.nub.platforms['darwin-arm64'].binary = binary
    expect(() => toolPlan('nub', 'darwin-arm64', data)).toThrow(
      'Missing or invalid',
    )
  }
})

test('Linux libc and architecture select distinct assets', () => {
  expect(toolPlatform('linux', 'arm64', true)).toBe('linux-arm64-musl')
  expect(toolPlatform('linux', 'x64', false)).toBe('linux-x64')
  expect(toolPlatform('darwin', 'arm64', false)).toBe('darwin-arm64')
  expect(toolPlan('nub', 'linux-x64-musl').asset).toBe(
    'nub-linux-x64-musl.tar.gz',
  )
  expect(toolPlan('pnpm', 'win32-arm64').binary).toBe('pnpm.exe')
  expect(toolPlan('sfw', 'win32-arm64')).toMatchObject({
    asset: 'sfw-free-windows-arm64.exe',
    binary: 'sfw.exe',
    format: 'binary',
  })
})

test('bare releases require an explicit format and safe asset paths', () => {
  const pin = toolPlan('sfw', 'linux-x64')
  expect(validAssetFormat(pin)).toBe(true)
  expect(validAssetFormat({ ...pin, format: 'archive' })).toBe(false)
  expect(validAssetFormat({ ...pin, format: 'unknown' })).toBe(false)
  expect(() => validateAsset(pin)).not.toThrow()
  for (const asset of ['../sfw', '/tmp/sfw', '.', '..', 'sfw;command']) {
    expect(() => validateAsset({ ...pin, asset })).toThrow('Missing or invalid')
  }
})
