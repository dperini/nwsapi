import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { IMPORTANT_ICON_REL_PATH, REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { optimiseSvg } from '../gen/svg-optimize.mts'

export interface SvgDrift {
  after: number
  before: number
  path: string
}

export function optimiseRepoSvg(svg: string, file: string): string {
  // The supplied Octicon path must remain byte-for-byte unchanged.
  return optimiseSvg(svg, {
    preservePathData: file === IMPORTANT_ICON_REL_PATH,
  })
}

export function findUnoptimizedSvgs(
  entries: ReadonlyArray<{ content: string; path: string }>,
  optimise = optimiseRepoSvg,
): SvgDrift[] {
  return entries.flatMap(entry => {
    const optimized = optimise(entry.content, entry.path)
    return optimized.trimEnd() === entry.content.trimEnd()
      ? []
      : [
          {
            after: Buffer.byteLength(optimized),
            before: Buffer.byteLength(entry.content),
            path: entry.path,
          },
        ]
  })
}

export function checkSvgs(fix = false, root = REPO_ROOT) {
  // Include new assets. Git errors must not silently skip validation.
  const files = [
    ...new Set(
      execFileSync(
        'git',
        [
          'ls-files',
          '--cached',
          '--others',
          '--exclude-standard',
          '-z',
          '--',
          '*.svg',
        ],
        {
          cwd: root,
          encoding: 'utf8',
        },
      )
        .split('\0')
        .filter(Boolean),
    ),
  ].toSorted()
  const entries = files.map(file => ({
    path: file,
    content: readFileSync(path.join(root, file), 'utf8'),
  }))
  const drift = findUnoptimizedSvgs(entries)
  if (fix) {
    for (const entry of entries) {
      if (drift.some(item => item.path === entry.path)) {
        writeFileSync(
          path.join(root, entry.path),
          optimiseRepoSvg(entry.content, entry.path) + '\n',
        )
      }
    }
  } else if (drift.length) {
    throw new Error(
      `Unoptimized SVGs: ${drift.map(item => `${item.path} (${item.before} → ${item.after} bytes)`).join(', ')}. Run pnpm run fix:svg.`,
    )
  }
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--fix')) {
    throw new Error('Usage: pnpm run check:svg [--fix]')
  }
  checkSvgs(args.includes('--fix'))
}
