import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../lib/run-node.mts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

type ParityStatus = 'Rust' | 'Bridge' | 'JS' | 'N/A'

// These public APIs accept JavaScript callbacks or expose their callback
// registries. A Rust function-pointer API with a similar name is not parity.
const javascriptCallbackContracts = new Set([
  'registerCombinator',
  'registerSelector',
  'Combinators',
  'Selectors',
  'uninstall',
])

export function memberName(signature: string): string {
  return signature.split('(', 1)[0]!.trim()
}

export function apiEntries(markdown: string): string[] {
  const entries = [...markdown.matchAll(/^\| \[`([^`]+)`\]/gm)].map(match =>
    memberName(match[1]!),
  )
  const start = markdown.indexOf('### Configuration')
  const end = markdown.indexOf('</details>', start)
  if (start < 0 || end < 0) {
    throw new Error('Could not find the generated API configuration table.')
  }
  const configuration = markdown.slice(start, end)
  for (const match of configuration.matchAll(/^\| `([^`]+)`/gm)) {
    entries.push(memberName(match[1]!))
  }
  return entries
}

export function parityEntries(
  markdown: string,
): Array<{ name: string; status: ParityStatus }> {
  const start = markdown.indexOf('| Documented API entry | Status |')
  const end = markdown.indexOf('\nModules (', start)
  if (start < 0 || end < 0) {
    throw new Error('Could not find the Rust API parity table.')
  }
  const entries: Array<{ name: string; status: ParityStatus }> = []
  for (const line of markdown.slice(start, end).split('\n')) {
    const match = /^\| `([^`]+)` \| (Rust|Bridge|JS|N\/A) \|/.exec(line)
    if (match) {
      entries.push({
        name: memberName(match[1]!),
        status: match[2] as ParityStatus,
      })
    }
  }
  return entries
}

export function counts(names: string[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const name of names) {
    result.set(name, (result.get(name) ?? 0) + 1)
  }
  return result
}

export function selectorApiCoverage(
  apiMarkdown: string,
  parityMarkdown: string,
) {
  const api = counts(apiEntries(apiMarkdown))
  const parity = parityEntries(parityMarkdown)
  const accounted = counts(parity.map(entry => entry.name))
  const missing = [...api].flatMap(([name, count]) =>
    Array.from(
      { length: Math.max(0, count - (accounted.get(name) ?? 0)) },
      () => name,
    ),
  )
  const extra = [...accounted].flatMap(([name, count]) =>
    Array.from(
      { length: Math.max(0, count - (api.get(name) ?? 0)) },
      () => name,
    ),
  )
  if (missing.length || extra.length) {
    throw new Error(
      `API inventory mismatch; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`,
    )
  }

  const overstatedCallbacks = parity.filter(
    entry =>
      javascriptCallbackContracts.has(entry.name) &&
      !['JS', 'Bridge'].includes(entry.status),
  )
  if (overstatedCallbacks.length) {
    throw new Error(
      `Host callback and lifecycle contracts require a JS or Bridge classification: ${overstatedCallbacks.map(entry => entry.name).join(', ')}.`,
    )
  }

  const direct = parity.filter(entry => entry.status === 'Rust').length
  const bridge = parity.filter(entry => entry.status === 'Bridge').length
  const javascript = parity.filter(entry => entry.status === 'JS').length
  const reserved = parity.filter(entry => entry.status === 'N/A').length
  const total = parity.length
  const rustBacked = direct + bridge
  const percentage = (100 * rustBacked) / total

  const documented =
    /\*\*(\d+)\/(\d+) \(([\d.]+)%\) have a Rust route\*\*/.exec(parityMarkdown)
  const routeBreakdown =
    /(\d+) direct Rust and (\d+) through Node\/WASM or\s+host bridges?\./.exec(
      parityMarkdown,
    )
  if (
    !documented ||
    !routeBreakdown ||
    Number(documented[1]) !== rustBacked ||
    Number(documented[2]) !== total ||
    Number(documented[3]) !== Number(percentage.toFixed(1)) ||
    Number(routeBreakdown[1]) !== direct ||
    Number(routeBreakdown[2]) !== bridge
  ) {
    throw new Error(
      `Rust README API coverage summary does not match its parity table (${rustBacked}/${total}, ${direct} direct, ${bridge} bridge).`,
    )
  }

  return {
    total,
    direct,
    bridge,
    javascript,
    reserved,
    rustBacked,
    percentage,
  }
}

if (isMainModule(import.meta.url)) {
  const result = selectorApiCoverage(
    readFileSync(path.join(repoRoot, 'docs/repo/selector/api.md'), 'utf8'),
    readFileSync(path.join(repoRoot, 'rust/dom/README.md'), 'utf8'),
  )
  console.log(
    `Selector API inventory: ${result.rustBacked}/${result.total} have a Rust route (${result.percentage.toFixed(1)}%; ${result.direct} direct Rust, ${result.bridge} bridge, ${result.javascript} JS-only, ${result.reserved} reserved).`,
  )
}
