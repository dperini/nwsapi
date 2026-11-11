import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { gitEnvironment, regularFiles } from './git.mts'
import { toolingFiles } from '../../lib/tooling-scope.mts'
import type { translateIncremental as TranslateIncremental } from '../../translation/incremental.mts'

export function runTool(root: string, args: string[]) {
  execFileSync(process.execPath, args, {
    cwd: root,
    env: gitEnvironment(),
    stdio: 'inherit',
  })
}

export function linkTools(root: string, sourceRoot: string) {
  const linked: string[] = []
  for (const file of [
    'node_modules',
    '.cache/bin',
    '.cache/guide-translation-model',
  ]) {
    if (!existsSync(path.join(sourceRoot, file))) {
      continue
    }
    const destination = path.join(root, file)
    mkdirSync(path.dirname(destination), { recursive: true })
    symlinkSync(
      path.join(sourceRoot, file),
      destination,
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    linked.push(destination)
  }
  const cache = '.cache/docs-localization/translations.json'
  if (existsSync(path.join(sourceRoot, cache))) {
    mkdirSync(path.dirname(path.join(root, cache)), { recursive: true })
    copyFileSync(path.join(sourceRoot, cache), path.join(root, cache))
  }
  return linked
}

export async function runQuality(
  root: string,
  files: string[],
  sourceRoot: string,
) {
  const links = linkTools(root, sourceRoot)
  try {
    const candidates = regularFiles(root, files)
    const scope = new Set(toolingFiles(root))
    const lint = candidates.filter(file => scope.has(file))
    const format = candidates.filter(
      file => scope.has(file) || /^\.config\/[^/]+\.json$/.test(file),
    )
    if (lint.length) {
      runTool(root, [
        'scripts/repo/run.mts',
        'scripts/repo/lint.mts',
        '--fix',
        ...lint.map(file => `--file=${file}`),
      ])
    }
    if (format.length) {
      runTool(root, [
        'node_modules/oxfmt/bin/oxfmt',
        '--config',
        '.config/oxfmt.json',
        '--write',
        '--',
        ...format,
      ])
    }
    const require = createRequire(path.join(root, 'package.json'))
    const { translateIncremental } = require(
      path.join(root, 'scripts/repo/translation/incremental.mts'),
    ) as { translateIncremental: typeof TranslateIncremental }
    return await translateIncremental(files, root)
  } finally {
    for (const link of links) {
      rmSync(link)
    }
  }
}
