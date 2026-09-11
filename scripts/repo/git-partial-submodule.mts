import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import {
  applySparse,
  checkoutDir,
  cloneEntry,
  headOf,
  isGitRepo,
  parseGitmodules,
  requireCleanCheckout,
  selectEntries,
} from './git-partial-checkout.mts'

/**
 * The root is the nearest directory at or above cwd containing .gitmodules.
 * Checkout paths in .gitmodules are resolved against it. This lets the tool
 * run from repo subdirectories and against copies of .gitmodules elsewhere.
 */
function findRoot() {
  let dir = process.cwd()
  for (;;) {
    if (existsSync(path.join(dir, '.gitmodules'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(`no .gitmodules found at or above ${process.cwd()}`)
    }
    dir = parent
  }
}

export let ROOT: string

export interface Entry {
  name: string
  label: string | null
  sha256: string | null
  path: string
  url: string
  ref: string
  branch: string | null
  shallow: boolean
  sparsePatterns: string[]
  verifyCommand: string | null
}

export interface RawEntry {
  name: string
  label: string | null
  sha256: string | null
  keys: Record<string, string>
}

// 512 MiB; the ls-tree manifest of a large upstream can run to many MB.
const MAX_BUFFER = 512 * 1024 * 1024

const HELP = `git-partial-submodule.mts — pristine upstream checkouts pinned in .gitmodules

Usage:
  node scripts/repo/git-partial-submodule.mts <clone|verify|restore-sparse> [path...] [--deep] [--help]

Subcommands:
  clone [path...]           Materialize each entry as a sparse (cone),
                            blob:none partial clone detached at its pinned ref
                            (shallow when the entry sets "shallow = true").
                            Idempotent: an existing checkout already at the ref
                            is reported "up to date" and skipped; a checkout at
                            the wrong ref gets its sparse patterns re-applied,
                            then is re-fetched and re-checked out.
  verify [path...]          For each entry check: directory exists, HEAD equals
                            the pinned ref, sparse-checkout patterns match, the
                            working tree is clean (git status --porcelain is
                            empty), the repo is shallow (only when the entry
                            sets "shallow = true"), and the sha256 of the
                            "git ls-tree -r <ref>" manifest matches the hash in
                            the entry's header comment. Prints a PASS/FAIL
                            table; exits 1 on any failure.
                            With --deep, additionally runs the entry's "verify"
                            command after its structural checks pass. The
                            command is split on whitespace and executed
                            without a shell, so quoting and shell operators
                            are not supported.
  restore-sparse [path...]  Re-apply the declared sparse-checkout patterns to
                            an existing checkout.

Entries are validated before any value reaches git: "ref" must be a 40-char
lowercase hex commit id, "url" must start with https://, "path" must resolve
strictly inside the repository root, and sparse-checkout patterns must not
start with "-". A violation prints an error and exits 1.

With no paths, every entry in .gitmodules is processed. Paths are relative to
the repository root (e.g. "upstream/wpt").
`

export function git(cwd: string, args: string[], { capture = true } = {}) {
  return execFileSync('git', args, {
    cwd,
    maxBuffer: MAX_BUFFER,
    stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
  })
}

export function tryGitText(cwd: string, args: string[]) {
  try {
    return execFileSync('git', args, {
      cwd,
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim()
  } catch {
    return null
  }
}

function manifestSha256(dir: string, ref: string) {
  const stdout = git(dir, [
    '-C',
    dir,
    '-c',
    'core.quotePath=false',
    'ls-tree',
    '-r',
    ref,
  ])
  return crypto.createHash('sha256').update(stdout).digest('hex')
}

// oxlint-disable-next-line eslint/complexity -- Report each checkout invariant in one diagnostic result.
function verifyEntry(entry: Entry) {
  const dir = checkoutDir(entry)
  const checks: Array<{ name: string; ok: boolean; detail: string }> = []
  const record = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail })
    return ok
  }

  const repoOk = record(
    'checkout exists',
    existsSync(dir) && isGitRepo(dir),
    dir,
  )

  if (repoOk) {
    const head = headOf(dir)
    record(
      'HEAD == ref',
      head === entry.ref,
      head === entry.ref
        ? entry.ref
        : `HEAD is ${head ?? '(unborn)'}, want ${entry.ref}`,
    )

    if (entry.shallow) {
      record(
        'shallow checkout',
        tryGitText(dir, ['-C', dir, 'rev-parse', '--is-shallow-repository']) ===
          'true',
        'depth-one fetches',
      )
    }
    if (entry.branch) {
      const expected = `+refs/heads/${entry.branch}:refs/remotes/origin/${entry.branch}`
      record(
        'single branch',
        tryGitText(dir, [
          '-C',
          dir,
          'config',
          '--get-all',
          'remote.origin.fetch',
        ]) === expected,
        expected,
      )
    }
    const listed = (
      tryGitText(dir, ['-C', dir, 'sparse-checkout', 'list']) ?? ''
    )
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .toSorted()
    const declared = [...entry.sparsePatterns].toSorted(
      (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0),
    )
    const sparseOk =
      listed.length === declared.length &&
      listed.every((pattern, i) => pattern === declared[i])
    record(
      'sparse-checkout',
      sparseOk,
      sparseOk
        ? declared.join(' ')
        : `have [${listed.join(' ')}], want [${declared.join(' ')}]`,
    )

    // The manifest hash covers the object database only, so a tampered
    // working tree would still pass it; require a clean status too.
    const status = tryGitText(dir, ['-C', dir, 'status', '--porcelain'])
    const dirty = (status ?? '').split('\n').filter(Boolean)
    const cleanOk = status === ''
    record(
      'worktree clean',
      cleanOk,
      cleanOk
        ? 'git status --porcelain is empty'
        : status === null
          ? 'git status failed'
          : `${dirty.length} dirty path(s), e.g. ${dirty[0]}`,
    )

    if (entry.shallow) {
      const gitDir = tryGitText(dir, [
        '-C',
        dir,
        'rev-parse',
        '--absolute-git-dir',
      ])
      const shallowOk =
        gitDir !== null && existsSync(path.join(gitDir, 'shallow'))
      record(
        'shallow',
        shallowOk,
        shallowOk
          ? '.git/shallow present'
          : '.git/shallow missing (full clone?)',
      )
    }

    if (entry.sha256) {
      let actual = null
      try {
        actual = manifestSha256(dir, entry.ref)
      } catch {
        // ls-tree fails when the pinned ref's objects are absent.
      }
      record(
        'manifest sha256',
        actual === entry.sha256,
        actual === entry.sha256
          ? entry.sha256
          : `have ${actual ?? '(ls-tree failed)'}, want ${entry.sha256}`,
      )
    } else {
      record(
        'manifest sha256',
        false,
        'no sha256 header comment in .gitmodules',
      )
    }
  } else {
    const skipped = ['HEAD == ref', 'sparse-checkout', 'worktree clean']
    if (entry.shallow) {
      skipped.push('shallow')
    }
    skipped.push('manifest sha256')
    for (const name of skipped) {
      record(name, false, 'skipped: checkout missing')
    }
  }

  console.log(`${entry.path} (${entry.label ?? entry.name})`)
  for (const check of checks) {
    const status = check.ok ? 'PASS' : 'FAIL'
    console.log(`  ${status}  ${check.name.padEnd(16)} ${check.detail}`)
  }
  return checks.every(check => check.ok)
}

/**
 * Deep verification, opt-in via `verify --deep`: run the entry's `verify`
 * command after its structural checks pass. The command string is split on
 * whitespace and executed directly with no shell, so quoting, environment
 * assignments, and shell operators (&&, |, >, ...) are not supported —
 * keep the `verify` key a simple "<command> <arg>..." like
 * "pnpm run test:wpt".
 */
function deepVerifyEntry(entry: Entry) {
  const label = 'deep verify'.padEnd(16)
  if (!entry.verifyCommand) {
    console.log(`  SKIP  ${label} no "verify" key in .gitmodules`)
    return true
  }
  const [file, ...args] = entry.verifyCommand.split(/\s+/).filter(Boolean)
  console.log(`${entry.path}: deep verify: ${entry.verifyCommand}`)
  try {
    execFileSync(file!, args, {
      cwd: ROOT,
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
  } catch {
    console.log(`  FAIL  ${label} ${entry.verifyCommand}`)
    return false
  }
  console.log(`  PASS  ${label} ${entry.verifyCommand}`)
  return true
}

function restoreSparseEntry(entry: Entry) {
  const dir = checkoutDir(entry)
  if (!existsSync(dir) || !isGitRepo(dir)) {
    throw new Error(`${entry.path}: no checkout to restore; run clone first`)
  }
  requireCleanCheckout(dir, entry)
  applySparse(dir, entry)
  console.log(
    `${entry.path}: sparse-checkout set to: ${entry.sparsePatterns.join(' ')}`,
  )
}

function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: 'boolean', short: 'h' },
      deep: { type: 'boolean' },
    },
    allowPositionals: true,
  })
  const [command, ...paths] = positionals

  if (values.help || !command) {
    console.log(HELP)
    process.exitCode = values.help ? 0 : 1
    return
  }

  ROOT = findRoot()
  const entries = selectEntries(
    parseGitmodules(path.join(ROOT, '.gitmodules')),
    paths,
  )

  switch (command) {
    case 'clone': {
      for (const entry of entries) {
        cloneEntry(entry)
      }
      break
    }
    case 'verify': {
      let allOk = true
      for (const entry of entries) {
        let ok = verifyEntry(entry)
        if (ok && values.deep) {
          ok = deepVerifyEntry(entry)
        }
        if (!ok) {
          allOk = false
        }
      }
      if (!allOk) {
        throw new Error('verify failed: one or more checks did not pass')
      }
      console.log('verify: all checks passed')
      break
    }
    case 'restore-sparse': {
      for (const entry of entries) {
        restoreSparseEntry(entry)
      }
      break
    }
    default: {
      throw new Error(`unknown subcommand "${command}" (try --help)`)
    }
  }
}

try {
  main()
} catch (error) {
  console.error(
    `git-partial-submodule: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
}
