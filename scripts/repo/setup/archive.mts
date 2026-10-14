import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  mkdtempSync,
} from 'node:fs'
import type { Stats } from 'node:fs'
import path from 'node:path'
import { resolvePowerShell } from './prerequisites.mts'

export function extractArchive(asset: string, directory: string) {
  if (!asset.endsWith('.zip')) {
    execFileSync('tar', ['-xf', asset], { cwd: directory, stdio: 'inherit' })
  } else if (process.platform === 'win32') {
    execFileSync(
      resolvePowerShell(),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Expand-Archive -LiteralPath $env:NWSAPI_TOOL_ARCHIVE -DestinationPath $env:NWSAPI_TOOL_DIRECTORY -Force',
      ],
      {
        cwd: directory,
        stdio: 'inherit',
        env: {
          ...process.env,
          NWSAPI_TOOL_ARCHIVE: path.join(directory, asset),
          NWSAPI_TOOL_DIRECTORY: directory,
        },
      },
    )
  } else {
    execFileSync('unzip', ['-q', asset, '-d', directory], {
      cwd: directory,
      stdio: 'inherit',
    })
  }
}

export function treeDigest(
  directory: string,
  platform = process.platform,
): string {
  const hash = createHash('sha256')
  for (const name of readdirSync(directory).toSorted()) {
    const file = path.join(directory, name)
    const stat = lstatSync(file)
    const kind = stat.isSymbolicLink()
      ? 'link'
      : stat.isDirectory()
        ? 'directory'
        : stat.isFile()
          ? 'file'
          : 'special'
    const value = stat.isSymbolicLink()
      ? readlinkSync(file)
      : stat.isDirectory()
        ? treeDigest(file, platform)
        : stat.isFile()
          ? readFileSync(file)
          : String(stat.mode)
    hash.update(name + '\0' + kind + '\0')
    if (platform !== 'win32') {
      hash.update(stat.mode + '\0')
    }
    // A fixed-length digest prevents file content from imitating another entry.
    hash.update(createHash('sha256').update(value).digest())
  }
  return hash.digest('hex')
}

export function matchesArchive(
  directory: string,
  extracted: string,
  platform = process.platform,
) {
  if (!existsSync(directory)) {
    return false
  }
  const stat = lstatSync(directory)
  return (
    !stat.isSymbolicLink() &&
    stat.isDirectory() &&
    treeDigest(directory, platform) === treeDigest(extracted, platform)
  )
}

export interface TreeMismatch {
  path: string
  kind: 'missing' | 'extra' | 'type' | 'content' | 'mode' | 'link'
  expected?: string
  actual?: string
}

function entryKind(stat: Stats) {
  if (stat.isSymbolicLink()) {
    return 'link'
  }
  if (stat.isDirectory()) {
    return 'directory'
  }
  if (stat.isFile()) {
    return 'file'
  }
  return 'special'
}

function fileSummary(file: string) {
  const bytes = readFileSync(file)
  return `${bytes.length}B sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function modeSummary(stat: Stats) {
  return (stat.mode & 0o7777).toString(8)
}

function compareEntry(
  current: string,
  wanted: string,
  itemPath: string,
  actual: Stats | undefined,
  expected: Stats | undefined,
  platform: string,
  compare: (actualRoot: string, expectedRoot: string, relative: string) => void,
  mismatches: TreeMismatch[],
) {
  if (!actual) {
    mismatches.push({ path: itemPath, kind: 'missing' })
    return
  }
  if (!expected) {
    mismatches.push({ path: itemPath, kind: 'extra' })
    return
  }
  const actualKind = entryKind(actual)
  const expectedKind = entryKind(expected)
  if (actualKind !== expectedKind) {
    mismatches.push({
      path: itemPath,
      kind: 'type',
      expected: expectedKind,
      actual: actualKind,
    })
    return
  }
  if (actualKind === 'directory') {
    compare(current, wanted, itemPath)
  } else if (actualKind === 'file') {
    const actualFile = fileSummary(current)
    const expectedFile = fileSummary(wanted)
    if (actualFile !== expectedFile) {
      mismatches.push({
        path: itemPath,
        kind: 'content',
        expected: expectedFile,
        actual: actualFile,
      })
      return
    }
  } else if (actualKind === 'link') {
    const actualLink = readlinkSync(current)
    const expectedLink = readlinkSync(wanted)
    if (actualLink !== expectedLink) {
      mismatches.push({
        path: itemPath,
        kind: 'link',
        expected: expectedLink,
        actual: actualLink,
      })
      return
    }
  } else {
    mismatches.push({
      path: itemPath,
      kind: 'type',
      expected: expectedKind,
      actual: actualKind,
    })
    return
  }
  if (platform !== 'win32' && actual.mode !== expected.mode) {
    mismatches.push({
      path: itemPath,
      kind: 'mode',
      expected: modeSummary(expected),
      actual: modeSummary(actual),
    })
  }
}

export function compareTrees(
  directory: string,
  extracted: string,
  platform = process.platform,
): TreeMismatch[] {
  const mismatches: TreeMismatch[] = []
  function compare(actualRoot: string, expectedRoot: string, relative = '') {
    const actualNames = existsSync(actualRoot)
      ? readdirSync(actualRoot).toSorted()
      : []
    const expectedNames = readdirSync(expectedRoot).toSorted()
    for (const name of [
      ...new Set([...actualNames, ...expectedNames]),
    ].toSorted((left, right) => left.localeCompare(right))) {
      const current = path.join(actualRoot, name)
      const wanted = path.join(expectedRoot, name)
      const itemPath = relative ? `${relative}/${name}` : name
      const actual = actualNames.includes(name) ? lstatSync(current) : undefined
      const expected = expectedNames.includes(name)
        ? lstatSync(wanted)
        : undefined
      compareEntry(
        current,
        wanted,
        itemPath,
        actual,
        expected,
        platform,
        compare,
        mismatches,
      )
    }
  }
  if (
    !existsSync(directory) ||
    lstatSync(directory).isSymbolicLink() ||
    !lstatSync(directory).isDirectory()
  ) {
    return [
      {
        path: '.',
        kind: 'type',
        expected: 'directory',
        actual: 'missing or non-directory',
      },
    ]
  }
  compare(directory, extracted)
  return mismatches
}

export function formatTreeMismatches(mismatches: TreeMismatch[], limit = 5) {
  const details = mismatches.slice(0, limit).map(item => {
    const values = [item.expected, item.actual].filter(Boolean).join(' -> ')
    return `  ${item.path}: ${item.kind}${values ? ` (${values})` : ''}`
  })
  const remaining = mismatches.length - details.length
  if (remaining > 0) {
    details.push(
      `  ... ${remaining} more mismatch${remaining === 1 ? '' : 'es'}`,
    )
  }
  return details.join('\n')
}

function replaceFile(source: string, destination: string) {
  const staging = mkdtempSync(path.join(path.dirname(destination), '.repair-'))
  try {
    const stagedFile = path.join(staging, 'entry')
    copyFileSync(source, stagedFile)
    chmodSync(stagedFile, lstatSync(source).mode & 0o7777)
    renameSync(stagedFile, destination)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

function reconcileDirectoryEntry(
  actual: string,
  expected: string,
  wantedStat: Stats,
  currentStat: Stats | undefined,
  currentKind: string | undefined,
  itemPath: string,
  platform: string,
  reconcile: (
    actualRoot: string,
    expectedRoot: string,
    relative: string,
  ) => void,
) {
  if (currentKind !== 'directory') {
    if (currentStat) {
      rmSync(actual, { recursive: true, force: true })
    }
    mkdirSync(actual, { mode: wantedStat.mode & 0o7777 })
  } else if (platform !== 'win32') {
    chmodSync(actual, currentStat!.mode | 0o700)
  }
  reconcile(actual, expected, itemPath)
  if (platform !== 'win32') {
    chmodSync(actual, wantedStat.mode & 0o7777)
  }
}

function reconcileFileEntry(
  actual: string,
  expected: string,
  wantedStat: Stats,
  currentStat: Stats | undefined,
  currentKind: string | undefined,
  platform: string,
) {
  const equalContent =
    currentKind === 'file' && fileSummary(actual) === fileSummary(expected)
  const equalMode =
    platform === 'win32' ||
    (currentStat !== undefined && currentStat.mode === wantedStat.mode)
  if (equalContent && !equalMode) {
    chmodSync(actual, wantedStat.mode & 0o7777)
  } else if (!equalContent || !equalMode) {
    if (currentStat && currentKind !== 'file') {
      rmSync(actual, { recursive: true, force: true })
    }
    replaceFile(expected, actual)
    if (platform !== 'win32') {
      chmodSync(actual, wantedStat.mode & 0o7777)
    }
  }
}

function reconcileLinkEntry(
  actual: string,
  expected: string,
  wantedStat: Stats,
  currentStat: Stats | undefined,
  currentKind: string | undefined,
  platform: string,
) {
  const changed =
    currentKind !== 'link' ||
    readlinkSync(actual) !== readlinkSync(expected) ||
    (platform !== 'win32' && currentStat?.mode !== wantedStat.mode)
  if (changed) {
    if (currentStat) {
      rmSync(actual, { recursive: true, force: true })
    }
    symlinkSync(readlinkSync(expected), actual)
  }
}

function reconcileEntry(
  actual: string,
  expected: string,
  itemPath: string,
  currentStat: Stats | undefined,
  platform: string,
  reconcile: (
    actualRoot: string,
    expectedRoot: string,
    relative: string,
  ) => void,
) {
  const wantedStat = lstatSync(expected)
  const wantedKind = entryKind(wantedStat)
  const currentKind = currentStat && entryKind(currentStat)
  if (wantedKind === 'directory') {
    reconcileDirectoryEntry(
      actual,
      expected,
      wantedStat,
      currentStat,
      currentKind,
      itemPath,
      platform,
      reconcile,
    )
  } else if (wantedKind === 'file') {
    reconcileFileEntry(
      actual,
      expected,
      wantedStat,
      currentStat,
      currentKind,
      platform,
    )
  } else if (wantedKind === 'link') {
    reconcileLinkEntry(
      actual,
      expected,
      wantedStat,
      currentStat,
      currentKind,
      platform,
    )
  } else {
    throw new Error(
      `Unsupported special entry in verified archive: ${itemPath}`,
    )
  }
}

export function reconcileTree(
  directory: string,
  extracted: string,
  platform = process.platform,
) {
  function reconcile(actualRoot: string, expectedRoot: string, relative = '') {
    const expectedNames = readdirSync(expectedRoot).toSorted()
    const actualNames = readdirSync(actualRoot).toSorted()
    for (const name of expectedNames) {
      const actual = path.join(actualRoot, name)
      const expected = path.join(expectedRoot, name)
      const itemPath = relative ? `${relative}/${name}` : name
      const currentStat = actualNames.includes(name)
        ? lstatSync(actual)
        : undefined
      reconcileEntry(
        actual,
        expected,
        itemPath,
        currentStat,
        platform,
        reconcile,
      )
    }
    for (const name of actualNames) {
      if (!expectedNames.includes(name)) {
        rmSync(path.join(actualRoot, name), { recursive: true, force: true })
      }
    }
  }
  const actualStat = lstatSync(directory)
  if (actualStat.isSymbolicLink() || !actualStat.isDirectory()) {
    throw new Error(
      'Tool cache root is not a real directory and cannot be reconciled safely.',
    )
  }
  reconcile(directory, extracted)
  if (!matchesArchive(directory, extracted, platform)) {
    const mismatches = compareTrees(directory, extracted, platform)
    throw new Error(
      `Tool cache repair did not verify:\n${formatTreeMismatches(mismatches)}`,
    )
  }
}
