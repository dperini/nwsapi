import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  assertDigest, assertTrustedEnvironment, checkRegistryTarget, nextVersion,
  packManifest, packRelease, parseStage, readJson, repository, run, updateVersions,
  validateReceipt, validateStageId, validateVersion, versionFiles,
} from '../../../scripts/release/lib.mjs'
import { approveRelease, testTarball } from '../../../scripts/release/pipeline.mjs'
import { root } from '../../../scripts/release/setup.mjs'

const id = '12345678-1234-1234-1234-123456789abc'
const version = '2.2.29'
const receipt = {
  schema: 1, repository, package: 'nwsapi', version, tag: 'latest',
  filename: `nwsapi-${version}.tgz`, source: 'a'.repeat(40), base: 'd'.repeat(40),
  shasum: 'b'.repeat(40), integrity: 'sha512-' + Buffer.alloc(64).toString('base64'), runId: '123',
}
const staged = { id, packageName: 'nwsapi', version, tag: 'latest', shasum: receipt.shasum }
const packument = { 'dist-tags': { latest: '2.2.28' }, versions: { '2.2.28': {} } }

function temp(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-release-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('version selection advances only stable v2 releases', () => {
  assert.equal(nextVersion('2.2.28', 'patch'), version)
  assert.equal(nextVersion('2.2.28', 'minor'), '2.3.0')
  assert.equal(nextVersion('2.2.28', '2.4.5'), '2.4.5')
  for (const value of ['3.0.0', '2.3.0-prerelease', '2.02.1', '2.1', '--help', '2.1.9007199254740992', undefined]) {
    assert.throws(() => validateVersion(value), /stable v2/)
  }
  for (const value of ['2.2.28', '2.2.27']) assert.throws(() => nextVersion('2.2.28', value), /advance/)
})

test('registry gates reject public, older, and v3 latest targets', () => {
  assert.doesNotThrow(() => checkRegistryTarget(packument, version, 'latest'))
  assert.throws(() => checkRegistryTarget(packument, '2.2.28', 'latest'), /already public/)
  assert.throws(() => checkRegistryTarget(packument, '2.2.27', 'latest'), /exceed/)
  const v3 = { ...packument, 'dist-tags': { latest: '3.0.0' } }
  assert.throws(() => checkRegistryTarget(v3, version, 'latest'), /outside v2/)
  assert.doesNotThrow(() => checkRegistryTarget(v3, version, 'v2'))
  assert.throws(() => checkRegistryTarget(undefined, version, 'latest'), /determine/)
  assert.throws(() => checkRegistryTarget(packument, version, 'next'), /dist-tag/)
})

test('trusted staging requires the exact repository, branch, workflow, and OIDC credentials', () => {
  const env = {
    GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/master',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/publish-npm.yml@refs/heads/master`,
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.test', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture', GITHUB_RUN_ID: '123',
  }
  assert.doesNotThrow(() => assertTrustedEnvironment(env))
  for (const key of Object.keys(env)) assert.throws(() => assertTrustedEnvironment({ ...env, [key]: '' }), /workflow/)
  assert.throws(() => assertTrustedEnvironment({ ...env, GITHUB_REF: 'refs/heads/prerelease/3.0.0' }), /workflow/)
  for (const key of ['NODE_AUTH_TOKEN', 'NPM_TOKEN']) assert.throws(() => assertTrustedEnvironment({ ...env, [key]: 'fixture' }), /tokens/)
})

test('staging identity must bind the UUID, package, version, tag, and digest', () => {
  assert.equal(parseStage(staged, receipt, id).id, id)
  assert.equal(parseStage({ ...staged, shasum: undefined, dist: { shasum: receipt.shasum } }, receipt, id).id, id)
  for (const [key, value] of Object.entries({ id: '87654321-1234-1234-1234-123456789abc', packageName: 'other', version: '3.0.0', tag: 'next', shasum: 'c'.repeat(40) })) {
    assert.throws(() => parseStage({ ...staged, [key]: value }, receipt, id), /differs/)
  }
  assert.throws(() => parseStage({ ...staged, shasum: undefined }, receipt, id), /differs/)
  assert.throws(() => validateStageId('--help'), /UUID/)
})

test('release receipts reject malformed and cross-repository identities', () => {
  assert.equal(validateReceipt(receipt, version), receipt)
  for (const [key, value] of Object.entries({ repository: 'other/repo', version: '3.0.0', filename: '../payload.tgz', source: 'short', integrity: 'sha512-missing', runId: 'NaN', schema: 2 })) {
    assert.throws(() => validateReceipt({ ...receipt, [key]: value }, version), /receipt/)
  }
})

test('version reservation updates every legacy manifest and source header', t => {
  const directory = temp(t)
  for (const file of versionFiles) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    cpSync(path.join(root, file), path.join(directory, file))
  }
  updateVersions(directory, version, '20260927')
  for (const file of ['package.json', 'bower.json']) assert.equal(readJson(path.join(directory, file)).version, version)
  assert.equal(readFileSync(path.join(directory, 'build/VERSION'), 'utf8'), version + '\n')
  assert.match(readFileSync(path.join(directory, 'build/HEADER'), 'utf8'), /NWSAPI 2\.2\.29/)
  assert.match(readFileSync(path.join(directory, 'src/nwsapi.js'), 'utf8'), /Version: 2\.2\.29/)
  assert.match(readFileSync(path.join(directory, 'src/nwsapi.js'), 'utf8'), /Release: 20260927/)
})

test('tarballs contain only the public runtime and reproduce identical bytes', t => {
  const directory = temp(t)
  const first = packRelease(root, path.join(directory, 'first'))
  const second = packRelease(root, path.join(directory, 'second'))
  assert.equal(first.integrity, second.integrity)
  assertDigest(first.tarball, first)
  const manifest = JSON.parse(run('tar', ['-xOzf', first.tarball, 'package/package.json']))
  assert.equal(manifest.name, 'nwsapi')
  assert.equal(manifest.scripts, undefined)
  assert.equal(manifest.devDependencies, undefined)
  assert.equal(manifest.packageManager, undefined)
  assert.equal(manifest.main, './src/nwsapi')
  assert.deepEqual(manifest, packManifest(readJson(path.join(root, 'package.json'))))
  writeFileSync(first.tarball, 'corrupted')
  assert.throws(() => assertDigest(first.tarball, second), /does not match/)
})

test('a payload inspector runs before the packaged code can execute', t => {
  const directory = temp(t)
  const artifact = packRelease(root, path.join(directory, 'pack'))
  assert.throws(() => testTarball(artifact.tarball, directory, () => { throw new Error('source mismatch') }), /source mismatch/)
})

test('approval stops before npm mutation when verification fails', async () => {
  const originalCI = process.env.CI
  const originalActions = process.env.GITHUB_ACTIONS
  delete process.env.CI
  delete process.env.GITHUB_ACTIONS
  try {
    const calls = []
    const operations = {
      verifyRelease: async () => { calls.push('verify'); throw new Error('bad bytes') },
      npm: () => calls.push('approve'), finalizeRelease: async () => calls.push('finalize'),
    }
    await assert.rejects(approveRelease(version, id, false, operations), /bad bytes/)
    assert.deepEqual(calls, ['verify'])
  } finally {
    if (originalCI === undefined) delete process.env.CI; else process.env.CI = originalCI
    if (originalActions === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = originalActions
  }
})

test('approval dry runs verify without promotion; changed stages stop promotion', async () => {
  const originalCI = process.env.CI
  const originalActions = process.env.GITHUB_ACTIONS
  delete process.env.CI
  delete process.env.GITHUB_ACTIONS
  try {
    const calls = []
    const operations = {
      verifyRelease: async () => { calls.push('verify'); return receipt }, registryJson: async () => packument,
      npmRead: () => JSON.stringify(staged), npm: () => calls.push('approve'), finalizeRelease: async () => calls.push('finalize'),
    }
    await approveRelease(version, id, true, operations)
    assert.deepEqual(calls, ['verify'])
    calls.length = 0
    await assert.rejects(approveRelease(version, id, false, { ...operations, npmRead: () => JSON.stringify({ ...staged, tag: 'v2' }) }), /differs/)
    assert.deepEqual(calls, ['verify'])
    calls.length = 0
    await approveRelease(version, id, false, operations)
    assert.deepEqual(calls, ['verify', 'approve', 'finalize'])
  } finally {
    if (originalCI === undefined) delete process.env.CI; else process.env.CI = originalCI
    if (originalActions === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = originalActions
  }
})

test('approval cannot execute in GitHub Actions', async () => {
  const original = process.env.GITHUB_ACTIONS
  process.env.GITHUB_ACTIONS = 'true'
  try { await assert.rejects(approveRelease(version, id, false), /maintainer terminal/) }
  finally { if (original === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = original }
})
