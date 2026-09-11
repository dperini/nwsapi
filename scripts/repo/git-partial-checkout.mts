import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  type PathOrFileDescriptor,
} from 'node:fs'
import path from 'node:path'
import type { Entry, RawEntry } from './git-partial-submodule.mts'
import { ROOT, git, tryGitText } from './git-partial-submodule.mts'

/**
 * Parse .gitmodules, tolerating comment lines and tab/space indentation.
 * A comment directly above a [submodule "..."] section in the form.
 *
 * # <label> sha256:<64 hex>
 *
 * Supplies the entry's label and expected manifest hash. Other comments
 * (e.g. trailing "# no-release-tag: ..." notes) are ignored.
 */
export function parseGitmodules(filePath: PathOrFileDescriptor) {
  const entries: RawEntry[] = []
  let pendingHeader: { label: string; sha256: string } | null = null
  let current: RawEntry | null = null
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '') {
      continue
    }
    if (line.startsWith('#') || line.startsWith(';')) {
      const match = line.match(/^[#;]\s*(\S+)\s+sha256:([0-9a-fA-F]{64})\b/)
      pendingHeader = match
        ? { label: match[1]!, sha256: match[2]!.toLowerCase() }
        : null
      continue
    }
    const section = line.match(/^\[submodule\s+"(.+)"\]$/)
    if (section) {
      current = {
        name: section[1]!,
        label: pendingHeader ? pendingHeader.label : null,
        sha256: pendingHeader ? pendingHeader.sha256 : null,
        keys: {},
      }
      entries.push(current)
      pendingHeader = null
      continue
    }
    // git-config semantics: a valueless key means boolean true, and a
    // value may be wrapped in double quotes.
    const kv = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/)
    if (kv && current) {
      let value = kv[2] === undefined ? 'true' : kv[2].trim()
      const quoted = value.match(/^"(.*)"$/)
      if (quoted) {
        value = quoted[1]!
      }
      current.keys[kv[1]!.toLowerCase()] = value
    }
  }
  return entries.map(entry => {
    const { keys } = entry
    const normalized: Entry = {
      name: entry.name,
      label: entry.label,
      sha256: entry.sha256,
      path: keys['path'] ?? entry.name,
      url: keys['url'] ?? '',
      ref: keys['ref'] ?? '',
      branch: keys['branch'] ?? null,
      shallow: keys['shallow'] === 'true',
      sparsePatterns: (keys['sparse-checkout'] ?? '')
        .split(/\s+/)
        .filter(Boolean),
      verifyCommand: keys['verify'] ?? null,
    }
    for (const required of ['url', 'ref'] as const) {
      if (!normalized[required]) {
        throw new Error(
          `.gitmodules entry "${entry.name}" is missing required key "${required}"`,
        )
      }
    }
    validateEntry(normalized)
    return normalized
  })
}

/**
 * Reject .gitmodules values that could smuggle options or paths into git
 * command lines (e.g. a ref of "--upload-pack=<cmd>" executes code) or
 * escape the repository root. Called for every entry before any value is
 * used; a violation throws, which prints the message and exits 1.
 */
function validateEntry(entry: Entry) {
  const fail = (message: string) => {
    throw new Error(`.gitmodules entry "${entry.name}": ${message}`)
  }
  if (!/^[0-9a-f]{40}$/.test(entry.ref)) {
    fail(
      `ref must be a 40-character lowercase hex commit id, got "${entry.ref}"`,
    )
  }
  if (!entry.url.startsWith('https://')) {
    fail(`url must start with "https://", got "${entry.url}"`)
  }
  if (path.isAbsolute(entry.path)) {
    fail(`path must be relative to the repository root, got "${entry.path}"`)
  }
  const relative = path.relative(ROOT, path.resolve(ROOT, entry.path))
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail(
      `path must resolve strictly inside the repository root, got "${entry.path}"`,
    )
  }
  for (const pattern of entry.sparsePatterns) {
    if (pattern.startsWith('-')) {
      fail(`sparse-checkout pattern must not start with "-", got "${pattern}"`)
    }
  }
}

export function selectEntries(entries: Entry[], requestedPaths: string[]) {
  if (requestedPaths.length === 0) {
    return entries
  }
  const normalize = (p: string) => p.replace(/\/+$/, '')
  const selected = []
  for (const requested of requestedPaths) {
    const want = normalize(requested)
    const found = entries.find(
      entry => normalize(entry.path) === want || entry.name === want,
    )
    if (!found) {
      throw new Error(`no .gitmodules entry matches path "${requested}"`)
    }
    selected.push(found)
  }
  return selected
}

export function checkoutDir(entry: { path: string }) {
  const dir = path.join(ROOT, entry.path)
  let ancestor = dir
  for (;;) {
    try {
      lstatSync(ancestor)
      break
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      ) {
        throw error
      }
      ancestor = path.dirname(ancestor)
    }
  }
  // Check the nearest existing ancestor too: a new checkout can otherwise
  // escape through a symlink in its parent directory. lstat also catches
  // dangling symlinks, which realpath rejects rather than treating as absent.
  const resolved = path.resolve(
    realpathSync(ancestor),
    path.relative(ancestor, dir),
  )
  const relative = path.relative(realpathSync(ROOT), resolved)
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `${entry.path}: checkout resolves outside the repository root; refusing symlink escape`,
    )
  }
  return dir
}

export function requireCleanCheckout(dir: string, entry: Entry) {
  if (
    tryGitText(dir, [
      '-C',
      dir,
      'status',
      '--porcelain',
      '--untracked-files=all',
    ]) !== ''
  ) {
    throw new Error(
      `${entry.path}: checkout is dirty or unreadable; refusing to change it`,
    )
  }
}

/**
 * True only when `dir` is itself the top level of a git work tree. A bare
 * `rev-parse` check is not enough: for a directory without its own .git,
 * git walks up and finds the surrounding repository, which must never be
 * mistaken for (or fetched into as) the upstream checkout.
 */
export function isGitRepo(dir: string) {
  const toplevel = tryGitText(dir, ['-C', dir, 'rev-parse', '--show-toplevel'])
  if (toplevel === null) {
    return false
  }
  try {
    return realpathSync(toplevel) === realpathSync(dir)
  } catch {
    return false
  }
}

export function headOf(dir: string) {
  return tryGitText(dir, ['-C', dir, 'rev-parse', 'HEAD'])
}

export function applySparse(dir: string, entry: Entry) {
  // Keep later fetches confined to the declared branch as well as the pin.
  if (entry.branch) {
    git(
      dir,
      [
        '-C',
        dir,
        'config',
        '--replace-all',
        'remote.origin.fetch',
        `+refs/heads/${entry.branch}:refs/remotes/origin/${entry.branch}`,
      ],
      { capture: false },
    )
  }
  if (entry.sparsePatterns.length === 0) {
    return
  }
  git(dir, ['-C', dir, 'sparse-checkout', 'init', '--cone'], { capture: false })
  git(
    dir,
    ['-C', dir, 'sparse-checkout', 'set', '--', ...entry.sparsePatterns],
    {
      capture: false,
    },
  )
}

function fetchAndDetach(dir: string, entry: Entry) {
  const fetchArgs = ['-C', dir, 'fetch']
  if (entry.shallow) {
    fetchArgs.push('--depth', '1')
  }
  fetchArgs.push('--filter=blob:none', 'origin', entry.ref)
  git(dir, fetchArgs, { capture: false })
  git(dir, ['-C', dir, 'checkout', '--detach', 'FETCH_HEAD', '--'], {
    capture: false,
  })
}

export function cloneEntry(entry: Entry) {
  const dir = checkoutDir(entry)
  if (existsSync(dir)) {
    if (isGitRepo(dir)) {
      requireCleanCheckout(dir, entry)
      if (headOf(dir) === entry.ref) {
        console.log(
          `${entry.path}: up to date (HEAD ${entry.ref.slice(0, 12)})`,
        )
        return
      }
      console.log(`${entry.path}: HEAD differs from pin; fetching ${entry.ref}`)
      // Re-apply sparse patterns first so a pin bump that also changes
      // sparse-checkout takes effect on the re-checked-out tree.
      applySparse(dir, entry)
      fetchAndDetach(dir, entry)
      console.log(`${entry.path}: re-checked out at ${entry.ref.slice(0, 12)}`)
      return
    }
    if (readdirSync(dir).length > 0) {
      throw new Error(
        `${entry.path}: exists, is not a git repository, and is not empty — ` +
          'refusing to overwrite; move it aside and re-run clone',
      )
    }
  }
  console.log(`${entry.path}: cloning ${entry.url} @ ${entry.ref.slice(0, 12)}`)
  const cloneArgs = [
    'clone',
    '--no-checkout',
    '--filter=blob:none',
    '--single-branch',
  ]
  if (entry.shallow) {
    cloneArgs.push('--depth=1')
  }
  if (entry.branch) {
    cloneArgs.push('--branch', entry.branch)
  }
  cloneArgs.push('--', entry.url, dir)
  git(ROOT, cloneArgs, { capture: false })
  applySparse(dir, entry)
  fetchAndDetach(dir, entry)
  console.log(`${entry.path}: checked out at ${entry.ref.slice(0, 12)}`)
}
