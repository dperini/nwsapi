import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'

// A changed SVG needs a new URL so GitHub requests the updated image.
export function refreshChartReferences(root = REPO_ROOT) {
  const chartRoot = path.join(root, 'assets/repo/bench') + path.sep
  for (const relative of ['README.md', 'docs/benchmarks.md']) {
    const document = path.join(root, relative)
    const before = fs.readFileSync(document, 'utf8')
    const after = before.replace(
      /\]\(([^\s)?]+\.svg)(?:\?[^\s)]*)?\)/g,
      (reference, href: string) => {
        const asset = path.resolve(path.dirname(document), href)
        if (!asset.startsWith(chartRoot) || !fs.existsSync(asset)) {
          return reference
        }
        const revision = crypto
          .createHash('sha256')
          .update(fs.readFileSync(asset))
          .digest('hex')
          .slice(0, 12)
        return `](${href}?v=${revision})`
      },
    )
    if (after !== before) {
      fs.writeFileSync(document, after)
    }
  }
}
