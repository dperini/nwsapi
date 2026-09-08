import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'

// GitHub's /raw redirect drops query parameters; use the raw host directly.
export const chartBaseUrl =
  'https://raw.githubusercontent.com/dperini/nwsapi/master/'

// A changed SVG needs a new URL so GitHub requests the updated image.
export function refreshChartReferences(root = REPO_ROOT) {
  const chartRoot = path.join(root, 'assets/repo/bench') + path.sep
  for (const relative of ['README.md', 'docs/repo/perf/benchmarks.md']) {
    const document = path.join(root, relative)
    const before = fs.readFileSync(document, 'utf8')
    const after = before.replace(
      /\]\(([^\s)?]+\.svg)(?:\?[^\s)]*)?\)/g,
      (reference, href: string) => {
        const asset = href.startsWith(chartBaseUrl)
          ? path.resolve(root, href.slice(chartBaseUrl.length))
          : path.resolve(path.dirname(document), href)
        if (!asset.startsWith(chartRoot) || !fs.existsSync(asset)) {
          return reference
        }
        const revision = crypto
          .createHash('sha256')
          .update(fs.readFileSync(asset))
          .digest('hex')
          .slice(0, 12)
        const assetPath = path.relative(root, asset).split(path.sep).join('/')
        return `](${chartBaseUrl}${assetPath}?v=${revision})`
      },
    )
    if (after !== before) {
      fs.writeFileSync(document, after)
    }
  }
}
