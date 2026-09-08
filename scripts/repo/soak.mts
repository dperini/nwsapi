import { readFileSync, writeFileSync } from 'node:fs'
import { parse, parseDocument, isSeq, isScalar } from 'yaml'
import { WORKSPACE_PATH, REPO_ROOT } from './lib/paths.mts'
import { isMainModule } from './lib/run-node.mts'
import path from 'node:path'

const npmrcPath = path.join(REPO_ROOT, '.npmrc')
const exactSpec =
  /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/

export function soakPolicy(workspace: string) {
  const data = parse(workspace) as {
    minimumReleaseAge?: number
    minimumReleaseAgeExclude?: string[]
  } | null
  const minutes = data?.minimumReleaseAge
  if (!Number.isSafeInteger(minutes) || minutes! < 0) {
    throw new Error(
      'Set a nonnegative integer minimumReleaseAge in pnpm-workspace.yaml.',
    )
  }
  const excludes = data?.minimumReleaseAgeExclude ?? []
  if (
    !Array.isArray(excludes) ||
    excludes.some(spec => typeof spec !== 'string' || !exactSpec.test(spec))
  ) {
    throw new Error(
      'Soak exceptions must name an exact package@version, without wildcard patterns.',
    )
  }
  return { minutes: minutes!, days: Math.ceil(minutes! / 1440), excludes }
}

export function syncNpmSoak(workspace: string, npmrc: string) {
  const policy = soakPolicy(workspace)
  const lines = npmrc
    .trimEnd()
    .split('\n')
    .filter(line => !/^min-release-age(?:-exclude\[\])?=/.test(line))
  lines.push(
    `min-release-age=${policy.days}`,
    ...policy.excludes.map(spec => `min-release-age-exclude[]=${spec}`),
  )
  return lines.join('\n') + '\n'
}

function exceptionExpiry(
  annotation: string | null | undefined,
  minutes: number,
) {
  const dates = /published: (\S+) \| removable: (\S+)/.exec(annotation ?? '')
  const published = Date.parse(dates?.[1] ?? '')
  const removable = Date.parse(dates?.[2] ?? '')
  if (
    !Number.isFinite(published) ||
    !Number.isFinite(removable) ||
    removable !== published + minutes * 60_000
  ) {
    throw new Error(
      'Soak exceptions need valid published/removable timestamps for the configured delay.',
    )
  }
  return removable
}

export function cleanSoakExceptions(workspace: string, now = Date.now()) {
  const { minutes } = soakPolicy(workspace)
  const doc = parseDocument(workspace)
  const excludes = doc.get('minimumReleaseAgeExclude')
  if (excludes === undefined) {
    return workspace
  }
  if (!isSeq(excludes)) {
    throw new Error('minimumReleaseAgeExclude must be a sequence.')
  }
  let changed = false
  for (let i = excludes.items.length - 1; i >= 0; i--) {
    const entry = excludes.items[i]
    const annotation = isScalar(entry)
      ? (entry.commentBefore ?? (i === 0 ? excludes.commentBefore : ''))
      : ''
    const removable = exceptionExpiry(annotation, minutes)
    if (removable <= now) {
      excludes.items.splice(i, 1)
      if (i === 0) {
        excludes.commentBefore = null
      }
      changed = true
    }
  }
  if (!changed) {
    return workspace
  }
  if (!excludes.items.length) {
    doc.delete('minimumReleaseAgeExclude')
  }
  return doc.toString()
}

export function addSoakException(
  workspace: string,
  spec: string,
  published: string,
  now = Date.now(),
) {
  if (!exactSpec.test(spec)) {
    throw new Error('Use an exact package@version for a soak bypass.')
  }
  const policy = soakPolicy(workspace)
  const time = Date.parse(published)
  if (!Number.isFinite(time) || time > now) {
    throw new Error(
      'Registry publication timestamp is missing or in the future.',
    )
  }
  if (time + policy.minutes * 60_000 <= now || policy.excludes.includes(spec)) {
    return workspace
  }
  const doc = parseDocument(workspace)
  if (!doc.has('minimumReleaseAgeExclude')) {
    doc.set('minimumReleaseAgeExclude', doc.createNode([]))
  }
  const entries = doc.get('minimumReleaseAgeExclude')
  if (!isSeq(entries)) {
    throw new Error('minimumReleaseAgeExclude must be a sequence.')
  }
  const entry = doc.createNode(spec)
  entry.commentBefore = ` published: ${new Date(time).toISOString()} | removable: ${new Date(time + policy.minutes * 60_000).toISOString()}`
  entries.add(entry)
  return doc.toString()
}

export function checkSoak(
  workspace = readFileSync(WORKSPACE_PATH, 'utf8'),
  npmrc = readFileSync(npmrcPath, 'utf8'),
) {
  const policy = soakPolicy(workspace)
  const age = /^min-release-age=(\d+)$/m.exec(npmrc)?.[1]
  const excludes = [...npmrc.matchAll(/^min-release-age-exclude\[\]=(.*)$/gm)]
    .map(match => match[1]!)
    .toSorted()
  if (
    Number(age) !== policy.days ||
    JSON.stringify(excludes) !== JSON.stringify(policy.excludes.toSorted())
  ) {
    throw new Error(
      'npm and pnpm soak policies differ. Run pnpm run update to synchronize them.',
    )
  }
  if (cleanSoakExceptions(workspace) !== workspace) {
    throw new Error(
      'Soak exceptions have expired. Run pnpm run update to remove them.',
    )
  }
}

export function refreshSoak() {
  const before = readFileSync(WORKSPACE_PATH, 'utf8')
  const workspace = cleanSoakExceptions(before)
  const npmrc = readFileSync(npmrcPath, 'utf8')
  const synced = syncNpmSoak(workspace, npmrc)
  if (workspace !== before) {
    writeFileSync(WORKSPACE_PATH, workspace)
  }
  if (synced !== npmrc) {
    writeFileSync(npmrcPath, synced)
  }
}

async function main() {
  const [mode, spec, ...rest] = process.argv.slice(2)
  if (mode === '--check' && !spec) {
    checkSoak()
    return
  }
  if (mode !== '--bypass' || !spec || rest.length || !exactSpec.test(spec)) {
    throw new Error(
      'Usage: pnpm run soak:check | pnpm run soak:bypass <package>@<version>',
    )
  }
  const split = spec.lastIndexOf('@')
  const name = spec.slice(0, split)
  const version = spec.slice(split + 1)
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    { signal: AbortSignal.timeout(30_000) },
  )
  if (!response.ok) {
    throw new Error(
      `Publication lookup failed for ${spec}: HTTP ${response.status}`,
    )
  }
  const packument = (await response.json()) as { time?: Record<string, string> }
  const published = packument.time?.[version]
  if (!published) {
    throw new Error(`No publication timestamp for ${spec}.`)
  }
  const before = readFileSync(WORKSPACE_PATH, 'utf8')
  const workspace = addSoakException(
    cleanSoakExceptions(before),
    spec,
    published,
  )
  writeFileSync(WORKSPACE_PATH, workspace)
  writeFileSync(
    npmrcPath,
    syncNpmSoak(workspace, readFileSync(npmrcPath, 'utf8')),
  )
  console.log(
    `Soak policy updated for ${spec}. Run pnpm install to install dependencies.`,
  )
}

if (isMainModule(import.meta.url)) {
  await main()
}
