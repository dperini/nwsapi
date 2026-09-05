#!/usr/bin/env node
/**
 * git-partial-submodule.mjs
 *
 * Dependency-free tool for the "pristine upstream" pins recorded in
 * .gitmodules. Upstream checkouts are gitignored and carry NO gitlink
 * (no 160000 index entry); the `ref` field in .gitmodules is the pin of
 * record, and the sha256 in the entry's header comment is a hash of the
 * `git ls-tree -r <ref>` manifest for tamper detection.
 *
 * Subcommands:
 *   clone [path...]           materialize (or update) each pinned checkout
 *   verify [path...]          check layout, HEAD, sparsity, worktree
 *                             cleanliness, and manifest hash; with --deep,
 *                             also run the entry's `verify` command
 *   restore-sparse [path...]  re-apply the declared sparse-checkout patterns
 *
 * Every .gitmodules entry is validated before any value reaches a git
 * command line: `ref` must be a 40-char lowercase hex commit id, `url`
 * must start with https://, `path` must resolve strictly inside the
 * repository root, and sparse-checkout patterns must not start with "-".
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

/**
 * The root is the nearest directory at or above cwd containing .gitmodules.
 * Checkout paths in .gitmodules are resolved against it. This lets the tool
 * run from repo subdirectories and against copies of .gitmodules elsewhere.
 */
function findRoot() {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, '.gitmodules'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`no .gitmodules found at or above ${process.cwd()}`);
    }
    dir = parent;
  }
}

let ROOT = null;

// 512 MiB; the ls-tree manifest of a large upstream can run to many MB.
const MAX_BUFFER = 512 * 1024 * 1024;

const HELP = `git-partial-submodule.mjs — pristine upstream checkouts pinned in .gitmodules

Usage:
  node scripts/git-partial-submodule.mjs <clone|verify|restore-sparse> [path...] [--deep] [--help]

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
`;

function git(cwd, args, { capture = true } = {}) {
  return execFileSync('git', args, {
    cwd,
    maxBuffer: MAX_BUFFER,
    stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
  });
}

function tryGitText(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim();
  } catch {
    return null;
  }
}

/**
 * Parse .gitmodules, tolerating comment lines and tab/space indentation.
 * A comment directly above a [submodule "..."] section in the form
 *   # <label> sha256:<64 hex>
 * supplies the entry's label and expected manifest hash. Other comments
 * (e.g. trailing "# no-release-tag: ..." notes) are ignored.
 */
function parseGitmodules(filePath) {
  const entries = [];
  let pendingHeader = null;
  let current = null;
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') {
      continue;
    }
    if (line.startsWith('#') || line.startsWith(';')) {
      const match = line.match(/^[#;]\s*(\S+)\s+sha256:([0-9a-fA-F]{64})\b/);
      pendingHeader = match
        ? { label: match[1], sha256: match[2].toLowerCase() }
        : null;
      continue;
    }
    const section = line.match(/^\[submodule\s+"(.+)"\]$/);
    if (section) {
      current = {
        name: section[1],
        label: pendingHeader ? pendingHeader.label : null,
        sha256: pendingHeader ? pendingHeader.sha256 : null,
        keys: {},
      };
      entries.push(current);
      pendingHeader = null;
      continue;
    }
    // git-config semantics: a valueless key means boolean true, and a
    // value may be wrapped in double quotes.
    const kv = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/);
    if (kv && current) {
      let value = kv[2] === undefined ? 'true' : kv[2].trim();
      const quoted = value.match(/^"(.*)"$/);
      if (quoted) {
        value = quoted[1];
      }
      current.keys[kv[1].toLowerCase()] = value;
    }
  }
  return entries.map((entry) => {
    const { keys } = entry;
    const normalized = {
      name: entry.name,
      label: entry.label,
      sha256: entry.sha256,
      path: keys.path ?? entry.name,
      url: keys.url ?? null,
      ref: keys.ref ?? null,
      branch: keys.branch ?? null,
      shallow: keys.shallow === 'true',
      sparsePatterns: (keys['sparse-checkout'] ?? '').split(/\s+/).filter(Boolean),
      verifyCommand: keys.verify ?? null,
    };
    for (const required of ['url', 'ref']) {
      if (!normalized[required]) {
        throw new Error(
          `.gitmodules entry "${entry.name}" is missing required key "${required}"`,
        );
      }
    }
    validateEntry(normalized);
    return normalized;
  });
}

/**
 * Reject .gitmodules values that could smuggle options or paths into git
 * command lines (e.g. a ref of "--upload-pack=<cmd>" executes code) or
 * escape the repository root. Called for every entry before any value is
 * used; a violation throws, which prints the message and exits 1.
 */
function validateEntry(entry) {
  const fail = (message) => {
    throw new Error(`.gitmodules entry "${entry.name}": ${message}`);
  };
  if (!/^[0-9a-f]{40}$/.test(entry.ref)) {
    fail(`ref must be a 40-character lowercase hex commit id, got "${entry.ref}"`);
  }
  if (!entry.url.startsWith('https://')) {
    fail(`url must start with "https://", got "${entry.url}"`);
  }
  if (path.isAbsolute(entry.path)) {
    fail(`path must be relative to the repository root, got "${entry.path}"`);
  }
  const relative = path.relative(ROOT, path.resolve(ROOT, entry.path));
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail(`path must resolve strictly inside the repository root, got "${entry.path}"`);
  }
  for (const pattern of entry.sparsePatterns) {
    if (pattern.startsWith('-')) {
      fail(`sparse-checkout pattern must not start with "-", got "${pattern}"`);
    }
  }
}

function selectEntries(entries, requestedPaths) {
  if (requestedPaths.length === 0) {
    return entries;
  }
  const normalize = (p) => p.replace(/\/+$/, '');
  const selected = [];
  for (const requested of requestedPaths) {
    const want = normalize(requested);
    const found = entries.find(
      (entry) => normalize(entry.path) === want || entry.name === want,
    );
    if (!found) {
      throw new Error(`no .gitmodules entry matches path "${requested}"`);
    }
    selected.push(found);
  }
  return selected;
}

function checkoutDir(entry) {
  return path.join(ROOT, entry.path);
}

/**
 * True only when `dir` is itself the top level of a git work tree. A bare
 * `rev-parse` check is not enough: for a directory without its own .git,
 * git walks up and finds the surrounding repository, which must never be
 * mistaken for (or fetched into as) the upstream checkout.
 */
function isGitRepo(dir) {
  const toplevel = tryGitText(dir, ['-C', dir, 'rev-parse', '--show-toplevel']);
  if (toplevel === null) {
    return false;
  }
  try {
    return realpathSync(toplevel) === realpathSync(dir);
  } catch {
    return false;
  }
}

function headOf(dir) {
  return tryGitText(dir, ['-C', dir, 'rev-parse', 'HEAD']);
}

function applySparse(dir, entry) {
  if (entry.sparsePatterns.length === 0) {
    return;
  }
  git(dir, ['-C', dir, 'sparse-checkout', 'init', '--cone'], { capture: false });
  git(dir, ['-C', dir, 'sparse-checkout', 'set', '--', ...entry.sparsePatterns], {
    capture: false,
  });
}

function fetchAndDetach(dir, entry) {
  const fetchArgs = ['-C', dir, 'fetch'];
  if (entry.shallow) {
    fetchArgs.push('--depth', '1');
  }
  fetchArgs.push('--filter=blob:none', 'origin', entry.ref);
  git(dir, fetchArgs, { capture: false });
  git(dir, ['-C', dir, 'checkout', '--detach', 'FETCH_HEAD', '--'], {
    capture: false,
  });
}

function cloneEntry(entry) {
  const dir = checkoutDir(entry);
  if (existsSync(dir)) {
    if (isGitRepo(dir)) {
      if (headOf(dir) === entry.ref) {
        console.log(`${entry.path}: up to date (HEAD ${entry.ref.slice(0, 12)})`);
        return;
      }
      console.log(`${entry.path}: HEAD differs from pin; fetching ${entry.ref}`);
      // Re-apply sparse patterns first so a pin bump that also changes
      // sparse-checkout takes effect on the re-checked-out tree.
      applySparse(dir, entry);
      fetchAndDetach(dir, entry);
      console.log(`${entry.path}: re-checked out at ${entry.ref.slice(0, 12)}`);
      return;
    }
    if (readdirSync(dir).length > 0) {
      throw new Error(
        `${entry.path}: exists, is not a git repository, and is not empty — ` +
          'refusing to overwrite; move it aside and re-run clone',
      );
    }
  }
  console.log(`${entry.path}: cloning ${entry.url} @ ${entry.ref.slice(0, 12)}`);
  mkdirSync(dir, { recursive: true });
  git(dir, ['-C', dir, 'init'], { capture: false });
  git(dir, ['-C', dir, 'remote', 'add', 'origin', entry.url], { capture: false });
  git(dir, ['-C', dir, 'config', 'remote.origin.promisor', 'true'], {
    capture: false,
  });
  git(dir, ['-C', dir, 'config', 'remote.origin.partialclonefilter', 'blob:none'], {
    capture: false,
  });
  applySparse(dir, entry);
  fetchAndDetach(dir, entry);
  console.log(`${entry.path}: checked out at ${entry.ref.slice(0, 12)}`);
}

function manifestSha256(dir, ref) {
  const stdout = git(dir, [
    '-C',
    dir,
    '-c',
    'core.quotePath=false',
    'ls-tree',
    '-r',
    ref,
  ]);
  return createHash('sha256').update(stdout).digest('hex');
}

function verifyEntry(entry) {
  const dir = checkoutDir(entry);
  const checks = [];
  const record = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    return ok;
  };

  const repoOk = record(
    'checkout exists',
    existsSync(dir) && isGitRepo(dir),
    dir,
  );

  if (repoOk) {
    const head = headOf(dir);
    record(
      'HEAD == ref',
      head === entry.ref,
      head === entry.ref ? entry.ref : `HEAD is ${head ?? '(unborn)'}, want ${entry.ref}`,
    );

    const listed = (tryGitText(dir, ['-C', dir, 'sparse-checkout', 'list']) ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .sort();
    const declared = [...entry.sparsePatterns].sort();
    const sparseOk =
      listed.length === declared.length &&
      listed.every((pattern, i) => pattern === declared[i]);
    record(
      'sparse-checkout',
      sparseOk,
      sparseOk
        ? declared.join(' ')
        : `have [${listed.join(' ')}], want [${declared.join(' ')}]`,
    );

    // The manifest hash covers the object database only, so a tampered
    // working tree would still pass it; require a clean status too.
    const status = tryGitText(dir, ['-C', dir, 'status', '--porcelain']);
    const dirty = (status ?? '').split('\n').filter(Boolean);
    const cleanOk = status === '';
    record(
      'worktree clean',
      cleanOk,
      cleanOk
        ? 'git status --porcelain is empty'
        : status === null
          ? 'git status failed'
          : `${dirty.length} dirty path(s), e.g. ${dirty[0]}`,
    );

    if (entry.shallow) {
      const gitDir = tryGitText(dir, ['-C', dir, 'rev-parse', '--absolute-git-dir']);
      const shallowOk = gitDir !== null && existsSync(path.join(gitDir, 'shallow'));
      record(
        'shallow',
        shallowOk,
        shallowOk ? '.git/shallow present' : '.git/shallow missing (full clone?)',
      );
    }

    if (entry.sha256) {
      let actual = null;
      try {
        actual = manifestSha256(dir, entry.ref);
      } catch {
        // ls-tree fails when the pinned ref's objects are absent.
      }
      record(
        'manifest sha256',
        actual === entry.sha256,
        actual === entry.sha256
          ? entry.sha256
          : `have ${actual ?? '(ls-tree failed)'}, want ${entry.sha256}`,
      );
    } else {
      record('manifest sha256', false, 'no sha256 header comment in .gitmodules');
    }
  } else {
    const skipped = ['HEAD == ref', 'sparse-checkout', 'worktree clean'];
    if (entry.shallow) {
      skipped.push('shallow');
    }
    skipped.push('manifest sha256');
    for (const name of skipped) {
      record(name, false, 'skipped: checkout missing');
    }
  }

  console.log(`${entry.path} (${entry.label ?? entry.name})`);
  for (const check of checks) {
    const status = check.ok ? 'PASS' : 'FAIL';
    console.log(`  ${status}  ${check.name.padEnd(16)} ${check.detail}`);
  }
  return checks.every((check) => check.ok);
}

/**
 * Deep verification, opt-in via `verify --deep`: run the entry's `verify`
 * command after its structural checks pass. The command string is split on
 * whitespace and executed directly with no shell, so quoting, environment
 * assignments, and shell operators (&&, |, >, ...) are not supported —
 * keep the `verify` key a simple "<command> <arg>..." like
 * "pnpm run test:upstream".
 */
function deepVerifyEntry(entry) {
  const label = 'deep verify'.padEnd(16);
  if (!entry.verifyCommand) {
    console.log(`  SKIP  ${label} no "verify" key in .gitmodules`);
    return true;
  }
  const [file, ...args] = entry.verifyCommand.split(/\s+/).filter(Boolean);
  console.log(`${entry.path}: deep verify: ${entry.verifyCommand}`);
  try {
    execFileSync(file, args, {
      cwd: ROOT,
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
  } catch {
    console.log(`  FAIL  ${label} ${entry.verifyCommand}`);
    return false;
  }
  console.log(`  PASS  ${label} ${entry.verifyCommand}`);
  return true;
}

function restoreSparseEntry(entry) {
  const dir = checkoutDir(entry);
  if (!existsSync(dir) || !isGitRepo(dir)) {
    throw new Error(`${entry.path}: no checkout to restore; run clone first`);
  }
  applySparse(dir, entry);
  console.log(`${entry.path}: sparse-checkout set to: ${entry.sparsePatterns.join(' ')}`);
}

function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: 'boolean', short: 'h' },
      deep: { type: 'boolean' },
    },
    allowPositionals: true,
  });
  const [command, ...paths] = positionals;

  if (values.help || !command) {
    console.log(HELP);
    process.exitCode = values.help ? 0 : 1;
    return;
  }

  ROOT = findRoot();
  const entries = selectEntries(
    parseGitmodules(path.join(ROOT, '.gitmodules')),
    paths,
  );

  switch (command) {
    case 'clone': {
      for (const entry of entries) {
        cloneEntry(entry);
      }
      break;
    }
    case 'verify': {
      let allOk = true;
      for (const entry of entries) {
        let ok = verifyEntry(entry);
        if (ok && values.deep) {
          ok = deepVerifyEntry(entry);
        }
        if (!ok) {
          allOk = false;
        }
      }
      if (!allOk) {
        throw new Error('verify failed: one or more checks did not pass');
      }
      console.log('verify: all checks passed');
      break;
    }
    case 'restore-sparse': {
      for (const entry of entries) {
        restoreSparseEntry(entry);
      }
      break;
    }
    default: {
      throw new Error(`unknown subcommand "${command}" (try --help)`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`git-partial-submodule: ${error.message}`);
  process.exitCode = 1;
}
