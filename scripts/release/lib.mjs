import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { npmCli, root } from './setup.mjs'

export const repository = 'dperini/nwsapi'
export const workflow = 'publish-npm.yml'
export const registry = 'https://registry.npmjs.org/'
export const versionFiles = ['package.json', 'bower.json', 'build/VERSION', 'build/HEADER', 'src/nwsapi.js']

export function run(command, args, options = {}) {
  const { interactive = false, ...rest } = options
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: interactive ? 'inherit' : 'pipe', ...rest,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed (${result.status}):\n${result.stderr || result.stdout || ''}`)
  return Buffer.isBuffer(result.stdout) ? result.stdout : result.stdout?.trim() || ''
}

export const git = (args, cwd = root) => run('git', args, { cwd })
export const gh = args => run('gh', [...args, '--repo', repository])
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
export const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n')

export function validateVersion(version) {
  if (typeof version !== 'string' || !/^2\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
      version.split('.').some(part => !Number.isSafeInteger(Number(part)))) {
    throw new Error('Only stable v2 versions (2.x.y) are allowed.')
  }
  return version
}

export function compareVersions(a, b) {
  const left = validateVersion(a).split('.').map(Number)
  const right = validateVersion(b).split('.').map(Number)
  return left[1] - right[1] || left[2] - right[2]
}

export function nextVersion(current, requested) {
  const [, minor, patch] = validateVersion(current).split('.').map(Number)
  const next = requested === 'patch' ? `2.${minor}.${patch + 1}` :
    requested === 'minor' ? `2.${minor + 1}.0` : validateVersion(requested)
  validateVersion(next)
  if (compareVersions(next, current) <= 0) throw new Error('A release must advance the reserved v2 version. Never reuse a staged version.')
  return next
}

export function validateTag(tag) {
  if (!['latest', 'v2'].includes(tag)) throw new Error('The v2 dist-tag must be latest or v2.')
  return tag
}

export function validateStageId(id) {
  if (typeof id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw new Error('Expected an npm stage UUID.')
  return id
}

export function assertTrustedEnvironment(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== repository ||
      env.GITHUB_REF !== 'refs/heads/master' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_WORKFLOW_REF !== `${repository}/.github/workflows/${workflow}@refs/heads/master` ||
      !env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ||
      !/^\d+$/.test(env.GITHUB_RUN_ID || '')) {
    throw new Error('Staging requires the v2 workflow dispatched from master with GitHub OIDC.')
  }
  if (env.NODE_AUTH_TOKEN || env.NPM_TOKEN) throw new Error('Remove npm tokens: CI staging uses only OIDC trusted publishing.')
}

// Run the pinned npm with no project npmrc. Trusted uploads cannot fall back
// to a maintainer token if the OIDC configuration is wrong.
export function npm(args, { trusted = false, cwd, interactive = false } = {}) {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-npm-'))
  const env = { ...process.env }
  try {
    if (trusted) {
      for (const key of Object.keys(env)) if (/^npm_config_/i.test(key) || /^(NODE_AUTH_TOKEN|NPM_TOKEN)$/.test(key)) delete env[key]
      env.NPM_CONFIG_USERCONFIG = path.join(temporary, 'user.npmrc')
      env.NPM_CONFIG_GLOBALCONFIG = path.join(temporary, 'global.npmrc')
      writeFileSync(env.NPM_CONFIG_USERCONFIG, '')
      writeFileSync(env.NPM_CONFIG_GLOBALCONFIG, '')
    }
    return run(process.execPath, [npmCli, ...args, '--registry', registry], { cwd: cwd || temporary, env, interactive })
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

export async function registryJson(suffix) {
  const response = await fetch(`${registry}nwsapi${suffix}`, { signal: AbortSignal.timeout(30_000), cache: 'no-store' })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`npm registry lookup failed: HTTP ${response.status}`)
  return response.json()
}

export function checkRegistryTarget(packument, version, tag) {
  validateVersion(version)
  validateTag(tag)
  if (!packument?.versions || !packument['dist-tags']?.latest) throw new Error('Cannot determine the current npm release state.')
  if (packument.versions[version]) throw new Error(`nwsapi@${version} is already public.`)
  const newer = Object.keys(packument.versions).filter(value => /^2\.\d+\.\d+$/.test(value)).some(value => compareVersions(value, version) >= 0)
  if (newer) throw new Error('The requested version must exceed every public stable v2 version.')
  if (tag === 'latest' && !/^2\./.test(packument['dist-tags'].latest)) {
    throw new Error('latest points outside v2; use --tag v2 to preserve it.')
  }
}

export function updateVersions(directory, version, date = new Date().toISOString().slice(0, 10).replaceAll('-', '')) {
  validateVersion(version)
  for (const name of ['package.json', 'bower.json']) {
    const file = path.join(directory, name)
    const manifest = readJson(file)
    manifest.version = version
    writeJson(file, manifest)
  }
  writeFileSync(path.join(directory, 'build/VERSION'), version + '\n')
  for (const [name, pattern, replacement] of [
    ['build/HEADER', /NWSAPI 2\.\d+\.\d+/, `NWSAPI ${version}`],
    ['src/nwsapi.js', /Version: 2\.\d+\.\d+/, `Version: ${version}`],
  ]) {
    const file = path.join(directory, name)
    const source = readFileSync(file, 'utf8')
    if (!pattern.test(source)) throw new Error(`Missing v2 version header in ${name}.`)
    writeFileSync(file, source.replace(pattern, replacement).replace(/Release: \d{8}/, `Release: ${date}`))
  }
}

export function digest(file) {
  const bytes = readFileSync(file)
  return {
    shasum: createHash('sha1').update(bytes).digest('hex'),
    integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
  }
}

export function assertDigest(file, expected) {
  const actual = digest(file)
  if (actual.shasum !== expected.shasum || actual.integrity !== expected.integrity) throw new Error('Release tarball does not match its recorded SHA-1 and SHA-512.')
}

export function packManifest(source) {
  const manifest = { ...source }
  for (const key of ['scripts', 'devDependencies', 'packageManager']) delete manifest[key]
  manifest.files = ['src/nwsapi.js', 'README.md', 'LICENSE']
  return manifest
}

export function packRelease(directory, output) {
  const manifest = packManifest(readJson(path.join(directory, 'package.json')))
  validateVersion(manifest.version)
  if (manifest.name !== 'nwsapi') throw new Error('Expected the nwsapi package.')
  mkdirSync(output, { recursive: true })
  const payload = mkdtempSync(path.join(output, 'pack-'))
  try {
    for (const file of ['src/nwsapi.js', 'README.md', 'LICENSE']) {
      mkdirSync(path.dirname(path.join(payload, file)), { recursive: true })
      cpSync(path.join(directory, file), path.join(payload, file))
    }
    // Repository setup must never run for consumers, including installs from a tarball.
    writeJson(path.join(payload, 'package.json'), manifest)
    const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', output], { cwd: payload })).nwsapi
    const expectedFiles = ['LICENSE', 'README.md', 'package.json', 'src/nwsapi.js']
    if (JSON.stringify(packed.files.map(file => file.path).sort()) !== JSON.stringify(expectedFiles)) throw new Error('Unexpected files in the release tarball.')
    const tarball = path.join(output, `nwsapi-${manifest.version}.tgz`)
    if (packed.filename !== path.basename(tarball)) throw new Error('Unexpected npm tarball filename.')
    assertDigest(tarball, packed)
    return { tarball, ...digest(tarball) }
  } finally {
    rmSync(payload, { recursive: true, force: true })
  }
}

export function parseStage(raw, receipt, id) {
  if (!raw || typeof raw !== 'object') throw new Error('Missing npm staging details.')
  const stageId = validateStageId(raw.id || raw.stageId)
  if (stageId !== id || (raw.packageName || raw.name) !== 'nwsapi' ||
      raw.version !== receipt.version || raw.tag !== receipt.tag ||
      (raw.shasum || raw.dist?.shasum) !== receipt.shasum) {
    throw new Error('npm stage identity, dist-tag, or tarball digest differs from the reserved release.')
  }
  return { ...raw, id: stageId }
}

export function validateReceipt(receipt, version) {
  validateVersion(version)
  if (receipt.schema !== 1 || receipt.package !== 'nwsapi' || receipt.version !== version ||
      receipt.repository !== repository || receipt.filename !== `nwsapi-${version}.tgz` ||
      !/^[a-f\d]{40}$/.test(receipt.source || '') || !/^[a-f\d]{40}$/.test(receipt.base || '') || !/^[a-f\d]{40}$/.test(receipt.shasum || '') ||
      !/^sha512-[A-Za-z\d+/]{86}==$/.test(receipt.integrity || '') || !/^\d+$/.test(receipt.runId || '')) {
    throw new Error('Invalid v2 release receipt.')
  }
  validateTag(receipt.tag)
  return receipt
}
