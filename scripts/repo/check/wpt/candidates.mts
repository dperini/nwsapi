import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { manifest } from '../../../../test/repo/e2e/upstream/manifest.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'
import { inspectWptScope } from './scope.mts'
import { checkInventory } from './inventory.mts'

export function candidateSignals(source: string) {
  // This broad prefilter only discovers review candidates. The AST scope check
  // and manual assertion review decide whether a page can join the suite.
  return /\b(?:test_valid_selector|test_invalid_selector|querySelector|querySelectorAll|matches|closest)\b/.test(
    source,
  )
}

export function auditCandidates(root = REPO_ROOT) {
  const checkout = path.join(root, 'upstream/wpt')
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', checkout, ...args], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }).trim()
  const selected = new Set(
    manifest.map(entry =>
      entry.script ? entry.path.replace(/\.html$/, '.js') : entry.path,
    ),
  )
  const candidates = []
  for (const relative of globSync('**/*.{html,xht,xhtml,window.js,any.js}', {
    cwd: checkout,
  }).toSorted()) {
    const url = '/' + relative
    if (selected.has(url) || relative.startsWith('resources/')) {
      continue
    }
    const source = readFileSync(path.join(checkout, relative), 'utf8')
    const script =
      relative.endsWith('.window.js') || relative.endsWith('.any.js')
    if (
      !candidateSignals(source) ||
      (!script && !source.includes('testharness.js'))
    ) {
      continue
    }
    const parsing = /\btest_(?:valid|invalid)_selector\b/.test(source)
    let reasons: string[]
    try {
      const result = inspectWptScope(
        [
          {
            path: script ? url.replace(/\.js$/, '.html') : url,
            note: 'Unreviewed discovery candidate.',
            script,
            parsing,
          },
        ],
        root,
      )
      reasons = [
        ...new Set(result.issues.map(issue => issue.reason)),
      ].toSorted()
    } catch (error) {
      reasons = [String(error).replaceAll(root + path.sep, '')]
    }
    candidates.push({
      path: url,
      sha256: createHash('sha256').update(source).digest('hex'),
      parsing,
      reasons,
    })
  }
  // The tree listing uses Git metadata without fetching every upstream blob.
  // These paths flag gaps beyond our sparse checkout, not audited eligibility.
  const outsideCheckout = git('ls-tree', '-r', '--name-only', 'HEAD')
    .split('\n')
    .filter(
      file =>
        /(?:selector|pseudo|^custom-elements\/state\/)/i.test(file) &&
        /\.(?:html|xht|xhtml|window\.js)$/.test(file) &&
        !existsSync(path.join(checkout, file)),
    )
  return { revision: git('rev-parse', 'HEAD'), candidates, outsideCheckout }
}

export function checkCandidates(write = false) {
  checkInventory()
  const report = auditCandidates()
  const filename = path.join(
    REPO_ROOT,
    'test/repo/e2e/upstream/candidates.json',
  )
  const text = JSON.stringify(report, null, 2) + '\n'
  if (write) {
    writeFileSync(filename, text)
  } else if (!existsSync(filename) || readFileSync(filename, 'utf8') !== text) {
    throw new Error(
      'WPT candidates changed. Run check:wpt-candidates --write, review the diff and assertions, and document inclusion or exclusion before committing the inventory. Passing the scope scan alone does not establish eligibility.',
    )
  }
  console.log(
    `WPT audit: ${report.candidates.length} unselected candidates, ${report.outsideCheckout.length} selector/pseudo paths outside the checkout. Inventory ${write ? 'written for review' : 'unchanged'}.`,
  )
  return report
}

if (isMainModule(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--write')) {
    throw new Error('Usage: check:wpt-candidates [--write]')
  }
  checkCandidates(process.argv.includes('--write'))
}
