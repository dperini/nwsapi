import { randomUUID } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

export type PreferenceNode =
  | { kind: 'missing'; path: string }
  | { kind: 'file'; path: string; mode: number; content: string }
  | { kind: 'symlink'; path: string; target: string; mode: number }

export interface PreferenceSnapshot {
  schemaVersion: 1
  id: string
  createdAt: string
  root: string
  home: string
  release: string
  nodes: PreferenceNode[]
}

export interface SnapshotOptions {
  home: string
  release: string
  backupRoot: string
  id?: string
}

export interface SnapshotIdentity {
  home: string
  release: string
}

const portableNames = [
  'com.apple.VoiceOver4.portable.scrd',
  'com.apple.VoiceOver4.portable.scrd.vou',
  'com.apple.VoiceOver4.portable.scro',
  'com.apple.VoiceOver4.portable.scui',
]

export function preferencePaths(home: string, release: string) {
  const major = Number.parseInt(release.split('.')[0] ?? '', 10)
  if (!Number.isFinite(major)) {
    throw new Error('Could not determine the macOS preference directory.')
  }
  const directory =
    major >= 24
      ? path.join(
          home,
          'Library/Group Containers/group.com.apple.VoiceOver/Library/Preferences',
        )
      : path.join(home, 'Library/Preferences')
  return [
    path.join(directory, 'com.apple.VoiceOver4.local.plist'),
    ...portableNames.map(name => path.join(directory, name)),
  ]
}

export async function createPreferenceSnapshot(
  options: SnapshotOptions,
): Promise<PreferenceSnapshot> {
  const id = options.id ?? randomUUID()
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) {
    throw new Error('The VoiceOver session identifier is invalid.')
  }
  const backupRoot = path.resolve(options.backupRoot)
  const root = path.resolve(backupRoot, id)
  if (path.dirname(root) !== backupRoot) {
    throw new Error('The VoiceOver snapshot path is outside its backup root.')
  }
  await mkdir(root, { recursive: false, mode: 0o700 })
  try {
    const paths = preferencePaths(options.home, options.release)
    const nodes: PreferenceNode[] = []
    for (const [index, file] of paths.entries()) {
      nodes.push(await readNode(file, index === 0))
    }
    const snapshot: PreferenceSnapshot = {
      schemaVersion: 1,
      id,
      createdAt: new Date().toISOString(),
      root,
      home: options.home,
      release: options.release,
      nodes,
    }
    await writeManifest(root, snapshot)
    return snapshot
  } catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

export async function loadPreferenceSnapshot(
  root: string,
  identity: SnapshotIdentity,
): Promise<PreferenceSnapshot> {
  const file = path.join(root, 'snapshot.json')
  const value = JSON.parse(await readFile(file, 'utf8')) as PreferenceSnapshot
  validateSnapshot(value, root, identity)
  return value
}

export async function restorePreferenceSnapshot(
  snapshot: PreferenceSnapshot,
  identity: SnapshotIdentity,
): Promise<void> {
  validateSnapshot(snapshot, snapshot.root, identity)
  for (const node of snapshot.nodes) {
    await restoreNode(node)
  }
  for (const node of snapshot.nodes) {
    await verifyNode(node)
  }
}

async function readNode(file: string, local: boolean): Promise<PreferenceNode> {
  let info
  try {
    info = await lstat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'missing', path: file }
    }
    throw error
  }
  if (info.isSymbolicLink()) {
    if (local) {
      throw new Error(
        `Local VoiceOver preferences cannot be a symlink: ${file}`,
      )
    }
    return {
      kind: 'symlink',
      path: file,
      target: await readlink(file),
      mode: info.mode & 0o777,
    }
  }
  if (!info.isFile()) {
    throw new Error(`VoiceOver preference is not a regular file: ${file}`)
  }
  return {
    kind: 'file',
    path: file,
    mode: info.mode & 0o777,
    content: (await readFile(file)).toString('base64'),
  }
}

async function restoreNode(node: PreferenceNode) {
  if (node.kind === 'missing') {
    await rm(node.path, { recursive: false, force: true })
    return
  }
  await mkdir(path.dirname(node.path), { recursive: true })
  if (node.kind === 'symlink') {
    const temporary = `${node.path}.voiceover-restore-${randomUUID()}`
    await symlink(node.target, temporary)
    await rename(temporary, node.path)
    return
  }
  const temporary = `${node.path}.voiceover-restore-${randomUUID()}`
  await writeFile(temporary, Buffer.from(node.content, 'base64'), {
    mode: node.mode,
    flag: 'wx',
  })
  await chmod(temporary, node.mode)
  await rename(temporary, node.path)
}

async function verifyNode(node: PreferenceNode) {
  const current = await readNode(node.path, false)
  if (JSON.stringify(current) !== JSON.stringify(node)) {
    throw new Error(
      `Restored VoiceOver preference does not match: ${node.path}`,
    )
  }
}

async function writeManifest(root: string, snapshot: PreferenceSnapshot) {
  const file = path.join(root, 'snapshot.json')
  const temporary = path.join(root, `snapshot-${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(snapshot), {
    mode: 0o600,
    flag: 'wx',
  })
  await rename(temporary, file)
}

function validateSnapshot(
  snapshot: PreferenceSnapshot,
  expectedRoot: string,
  identity: SnapshotIdentity,
) {
  if (
    snapshot.schemaVersion !== 1 ||
    !/^[a-zA-Z0-9-]{1,64}$/.test(snapshot.id) ||
    snapshot.root !== path.resolve(expectedRoot) ||
    path.basename(snapshot.root) !== snapshot.id ||
    snapshot.home !== identity.home ||
    snapshot.release !== identity.release ||
    !Array.isArray(snapshot.nodes) ||
    snapshot.nodes.length !== 5
  ) {
    throw new Error('The VoiceOver recovery snapshot is incomplete or invalid.')
  }
  const expectedPaths = preferencePaths(identity.home, identity.release)
  for (const [index, node] of snapshot.nodes.entries()) {
    validateNode(node, expectedPaths[index]!, index === 0)
  }
}

function validateNode(
  node: PreferenceNode,
  expectedPath: string,
  local: boolean,
) {
  if (!node || node.path !== expectedPath) {
    throw new Error('The VoiceOver recovery snapshot paths are invalid.')
  }
  if (node.kind === 'missing') {
    return
  }
  if (
    (node.kind !== 'file' && node.kind !== 'symlink') ||
    !Number.isInteger(node.mode) ||
    node.mode < 0 ||
    node.mode > 0o777 ||
    (local && node.kind === 'symlink')
  ) {
    throw new Error('The VoiceOver recovery snapshot node is invalid.')
  }
  if (node.kind === 'file') {
    const bytes = Buffer.from(node.content, 'base64')
    if (bytes.toString('base64') !== node.content) {
      throw new Error('The VoiceOver recovery snapshot file is invalid.')
    }
  } else if (!node.target) {
    throw new Error('The VoiceOver recovery symlink is invalid.')
  }
}
