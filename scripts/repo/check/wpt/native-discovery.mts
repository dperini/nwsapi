import { readFileSync } from 'node:fs'
import path from 'node:path'
import { inspectSelectorCalls } from './inventory.mts'
import {
  manifestSources,
  pageMetadata,
  verifyNativeCheckout,
} from './native-metadata.mts'

export function discoveryMetadata(source: string, file: string) {
  const metadata = pageMetadata(source, file)
  const reasons: string[] = []
  if (
    metadata.help.some(href =>
      /(?:\/selectors(?:-\d+)?\/|#(?:dom-parentnode-queryselector|dom-element-matches|dom-element-closest))/.test(
        href,
      ),
    )
  ) {
    reasons.push('Selector specification help link.')
  }
  for (const script of metadata.scripts) {
    const calls = inspectSelectorCalls(script, false)
    if (calls.validity) {
      reasons.push('Selector validity helper calls.')
    }
    if (Object.keys(calls.calls).length) {
      reasons.push('Selector API calls in the source AST.')
    }
    if (calls.unparsed) {
      reasons.push('Unparsed script requires scope review.')
    }
  }
  return { reasons: [...new Set(reasons)], dependencies: metadata.dependencies }
}

export function discoverNative(checkout: string, revision: string) {
  verifyNativeCheckout(checkout, revision)
  const manifest = JSON.parse(
    readFileSync(path.join(checkout, 'MANIFEST.json'), 'utf8'),
  )
  const sources = manifestSources({ testharness: manifest.items.testharness })
  const cache = new Map<string, ReturnType<typeof discoveryMetadata>>()
  const inspect = (file: string, parents = new Set<string>()): string[] => {
    if (parents.has(file)) {
      return []
    }
    if (!cache.has(file)) {
      cache.set(
        file,
        discoveryMetadata(
          readFileSync(path.join(checkout, file), 'utf8'),
          file,
        ),
      )
    }
    const info = cache.get(file)!
    const reasons = [...info.reasons]
    const visited = new Set([...parents, file])
    for (const dependency of info.dependencies) {
      const url = URL.parse(dependency, 'https://wpt.test/' + file)
      if (!url) {
        reasons.push(
          'Templated script dependency requires scope review: ' + dependency,
        )
        continue
      }
      if (
        url.origin !== 'https://wpt.test' ||
        url.pathname.startsWith('/resources/')
      ) {
        continue
      }
      const relative = url.pathname.slice(1)
      try {
        if (inspect(relative, visited).length) {
          reasons.push('Selector-related script dependency: ' + relative)
        }
      } catch {
        reasons.push('Script dependency requires scope review: ' + relative)
      }
    }
    return [...new Set(reasons)]
  }
  const candidates = []
  for (const [test, file] of sources) {
    const reasons = inspect(file)
    if (reasons.length) {
      candidates.push({ test, file, reasons })
    }
  }
  return { revision, scanned: sources.size, filesRead: cache.size, candidates }
}
