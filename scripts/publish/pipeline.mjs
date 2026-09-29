import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { root } from './setup.mjs'
import {
  assertDigest, assertTrustedEnvironment, checkRegistryTarget, gh, git,
  nextVersion, npm, packManifest, packRelease, parseStage, readJson, registryJson, repository,
  run, updateVersions, validateReceipt, validateStageId, validateTag,
  validateVersion, versionFiles, workflow, writeJson,
} from './lib.mjs'

export function testTarball(tarball, directory, inspect = () => {}) {
  const extracted = path.join(directory, 'extracted')
  mkdirSync(extracted)
  // Inspect paths before extracting an artifact fetched from a release.
  const entries = run('tar', ['-tzf', tarball]).split('\n')
  const allowed = ['package/LICENSE', 'package/README.md', 'package/package.json', 'package/src/nwsapi.js']
  if (JSON.stringify(entries.sort()) !== JSON.stringify(allowed.sort())) throw new Error('Unexpected tarball entries.')
  if (run('tar', ['-tvzf', tarball]).split('\n').some(line => !line.startsWith('-'))) throw new Error('The tarball must contain only regular files.')
  run('tar', ['-xzf', tarball, '-C', extracted])
  const manifest = readJson(path.join(extracted, 'package/package.json'))
  if (manifest.name !== 'nwsapi' || manifest.scripts || manifest.dependencies || manifest.devDependencies) throw new Error('Unexpected package manifest or lifecycle scripts.')
  validateVersion(manifest.version)
  inspect(path.join(extracted, 'package'), manifest)
  const tests = readdirSync(path.join(root, 'test/repo/integration')).filter(file => file.endsWith('.test.mjs'))
  if (tests.length === 0) throw new Error('No integration tests found for the release tarball.')
  run(process.execPath, ['--test', ...tests.map(file => path.join(root, 'test/repo/integration', file))], {
    interactive: true,
    env: { ...process.env, NWSAPI_TEST_SOURCE: path.join(extracted, 'package/src/nwsapi.js') },
  })
}

export async function stageRelease({ releaseAs = 'patch', tag = 'latest', dryRun = false } = {}) {
  validateTag(tag)
  if (!dryRun) assertTrustedEnvironment()
  if (!dryRun && git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Commit tracked changes before preparing a release.')
  const base = git(['rev-parse', 'HEAD'])
  if (!dryRun && base !== process.env.GITHUB_SHA) throw new Error('The workflow checkout must equal its dispatched source SHA.')
  const version = nextVersion(readJson(path.join(root, 'package.json')).version, releaseAs)
  checkRegistryTarget(await registryJson(''), version, tag)
  if (git(['ls-remote', '--tags', 'origin', `refs/tags/v${version}`])) throw new Error(`v${version} is already reserved. Choose a new version.`)
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-release-'))
  const output = path.join(root, '.release', `${dryRun ? 'dry-run-' : ''}${version}`)
  mkdirSync(output, { recursive: true })
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  try {
    for (const file of [...versionFiles, 'README.md', 'LICENSE']) {
      mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true })
      cpSync(path.join(root, file), path.join(temporary, file))
    }
    updateVersions(temporary, version, date)
    const artifact = packRelease(temporary, output)
    testTarball(artifact.tarball, temporary)
    if (dryRun) {
      console.log(`Dry run passed: ${artifact.tarball}\nSHA-512: ${artifact.integrity}\nNo version reserved or package uploaded.`)
      return { version, tag, ...artifact }
    }
    // A normal fast-forward push refuses concurrent changes to master. Bump
    // before staging: failed/rejected uploads must never recycle a version.
    const remote = git(['ls-remote', 'origin', 'refs/heads/master']).split(/\s+/)[0]
    if (remote !== base) throw new Error('master advanced during qualification; dispatch a fresh run.')
    updateVersions(root, version, date)
    git(['add', '--', ...versionFiles])
    git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `Release ${version}`])
    const source = git(['rev-parse', 'HEAD'])
    git(['tag', `v${version}`, source])
    git(['push', '--atomic', 'origin', 'HEAD:refs/heads/master', `refs/tags/v${version}`])
    const receipt = {
      schema: 1, repository, package: 'nwsapi', version, tag, source, base,
      runId: process.env.GITHUB_RUN_ID, filename: path.basename(artifact.tarball),
      shasum: artifact.shasum, integrity: artifact.integrity,
    }
    writeJson(path.join(output, 'release.json'), validateReceipt(receipt, version))
    const notes = path.join(output, 'notes.md')
    writeFileSync(notes, `Reserved nwsapi ${version}.\n\nSource: ${source}\nSHA-512: ${receipt.integrity}\n\nThis version is consumed even if npm staging fails or is rejected. Approval verifies the saved bytes before making the npm package public.\n`)
    gh(['release', 'create', `v${version}`, artifact.tarball, path.join(output, 'release.json'), '--verify-tag', '--draft', '--title', `nwsapi ${version}`, '--notes-file', notes])
    const result = JSON.parse(npm(['stage', 'publish', artifact.tarball, '--tag', tag, '--access', 'public', '--provenance', '--ignore-scripts', '--json'], { trusted: true }))
    const stageId = validateStageId(result.nwsapi?.stageId)
    writeJson(path.join(output, 'stage.json'), { version, stageId, shasum: receipt.shasum })
    gh(['release', 'upload', `v${version}`, path.join(output, 'stage.json')])
    const summary = `Staged nwsapi@${version} as ${stageId}.\n\nVerify: \`npm run npm:verify -- ${version} --stage ${stageId}\`\n\nApprove: \`npm run npm:approve -- ${version} --stage ${stageId}\`\n`
    console.log(summary)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
    return { ...receipt, stageId }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

export function npmRead(args) {
  try {
    return npm(args)
  } catch (error) {
    if (!/\bEOTP\b|one-time pass/i.test(error.message)) throw error
    npm(args, { interactive: true })
    return npm(args)
  }
}

export function loadReservation(version, directory, requireSuccessfulRun = true) {
  validateVersion(version)
  gh(['release', 'download', `v${version}`, '--dir', directory, '--pattern', 'release.json', '--pattern', `nwsapi-${version}.tgz`])
  const receipt = validateReceipt(readJson(path.join(directory, 'release.json')), version)
  assertDigest(path.join(directory, receipt.filename), receipt)
  git(['fetch', '--no-tags', 'origin', `refs/tags/v${version}`, 'refs/heads/master'])
  const refs = git(['ls-remote', 'origin', `refs/tags/v${version}`, `refs/tags/v${version}^{}`]).split('\n').map(line => line.split(/\s+/))
  const source = (refs.find(row => row[1]?.endsWith('^{}')) || refs.find(row => row[1] === `refs/tags/v${version}`))?.[0]
  if (source !== receipt.source) throw new Error('The release tag and artifact source differ.')
  if (git(['rev-parse', `${source}^`]) !== receipt.base) throw new Error('The reservation is not a direct child of the tested source.')
  const master = git(['ls-remote', 'origin', 'refs/heads/master']).split(/\s+/)[0]
  git(['merge-base', '--is-ancestor', receipt.source, master])
  const sourceManifest = JSON.parse(git(['show', `${receipt.source}:package.json`]))
  if (sourceManifest.name !== 'nwsapi' || sourceManifest.version !== version) throw new Error('The tagged source does not declare this release.')
  // Binding the receipt to the original workflow prevents an unrelated run
  // from being used as evidence. A failed upload can still be inspected, but
  // approval requires the staging run to have completed successfully.
  const status = JSON.parse(run('gh', ['api', `repos/${repository}/actions/runs/${receipt.runId}`]))
  if ((requireSuccessfulRun && status.conclusion !== 'success') || status.event !== 'workflow_dispatch' || status.path !== `.github/workflows/${workflow}` || status.head_branch !== 'master' || status.head_sha !== receipt.base) {
    throw new Error('The reserved release does not have a successful v2 staging run. Inspect the run before taking further action.')
  }
  return receipt
}

export async function verifyRelease(version, stageId) {
  validateVersion(version)
  validateStageId(stageId)
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-verify-'))
  try {
    const receipt = loadReservation(version, directory)
    parseStage(JSON.parse(npmRead(['stage', 'view', stageId, '--json'])), receipt, stageId)
    const staged = path.join(directory, 'staged')
    mkdirSync(staged)
    npm(['stage', 'download', stageId], { cwd: staged })
    const files = readdirSync(staged)
    if (files.length !== 1 || !files[0].endsWith('.tgz')) throw new Error('npm did not download exactly one staged tarball.')
    const tarball = path.join(staged, files[0])
    assertDigest(tarball, receipt)
    testTarball(tarball, directory, (payload, manifest) => {
      if (manifest.version !== version) throw new Error('The staged manifest has the wrong version.')
      const sourceManifest = JSON.parse(git(['show', `${receipt.source}:package.json`]))
      if (JSON.stringify(manifest) !== JSON.stringify(packManifest(sourceManifest))) throw new Error('The staged manifest differs from the tagged source.')
      for (const file of ['src/nwsapi.js', 'README.md', 'LICENSE']) {
        const expected = run('git', ['show', `${receipt.source}:${file}`], { encoding: 'buffer' })
        if (!readFileSync(path.join(payload, file)).equals(expected)) throw new Error(`Staged ${file} differs from the tagged source.`)
      }
    })
    console.log(`Verified nwsapi@${version}: staged bytes match the reserved tarball and passed regression tests.`)
    return receipt
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export async function finalizeRelease(version) {
  validateVersion(version)
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-finalize-'))
  try {
    const receipt = loadReservation(version, directory)
    let published
    for (let attempt = 0; attempt < 6; attempt += 1) {
      published = await registryJson(`/${version}`)
      if (published) break
      await setTimeout(2000)
    }
    if (published?.name !== 'nwsapi' || published.version !== version ||
        published.dist?.integrity !== receipt.integrity || published.dist?.shasum !== receipt.shasum) {
      throw new Error(`The public registry has not confirmed the reserved bytes. Retry npm run npm:finalize -- ${version} after propagation.`)
    }
    gh(['release', 'edit', `v${version}`, '--draft=false', '--latest=false', '--notes', `Published nwsapi ${version}.\n\nSource: ${receipt.source}\nSHA-512: ${receipt.integrity}`])
    console.log(`Published and verified nwsapi@${version}: https://github.com/${repository}/releases/tag/v${version}`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export async function approveRelease(version, stageId, dryRun, operations = { verifyRelease, registryJson, npmRead, npm, finalizeRelease }) {
  if (process.env.CI || process.env.GITHUB_ACTIONS) throw new Error('Approve from a maintainer terminal with npm proof of presence.')
  const receipt = await operations.verifyRelease(version, stageId)
  checkRegistryTarget(await operations.registryJson(''), version, receipt.tag)
  if (dryRun) return
  // Re-read immediately before approval, including the target dist-tag.
  parseStage(JSON.parse(operations.npmRead(['stage', 'view', stageId, '--json'])), receipt, stageId)
  operations.npm(['stage', 'approve', stageId], { interactive: true })
  await operations.finalizeRelease(version)
}

export async function rejectRelease(version, stageId) {
  validateVersion(version)
  validateStageId(stageId)
  if (await registryJson(`/${version}`)) throw new Error('Public versions cannot be rejected or reused.')
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-reject-'))
  try {
    const receipt = loadReservation(version, directory, false)
    parseStage(JSON.parse(npmRead(['stage', 'view', stageId, '--json'])), receipt, stageId)
    npm(['stage', 'reject', stageId], { interactive: true })
    console.log(`Rejected nwsapi@${version}. Its version, tag, and draft release remain reserved; choose a new version.`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export function dispatchRelease({ releaseAs = 'patch', tag = 'latest', dryRun = false } = {}) {
  if (!['patch', 'minor'].includes(releaseAs)) validateVersion(releaseAs)
  validateTag(tag)
  const args = ['workflow', 'run', workflow, '--ref', 'master', '-f', `release-as=${releaseAs}`, '-f', `dist-tag=${tag}`, '-f', `dry-run=${dryRun}`]
  console.log(gh(args) || `Dispatched ${dryRun ? 'qualification only' : 'staged release'} on master. Follow https://github.com/${repository}/actions/workflows/${workflow}`)
}
