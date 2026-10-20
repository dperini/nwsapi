import { execFileSync } from 'node:child_process'
import { globSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runProcess } from '../develop/process.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { toolingFiles } from '../lib/tooling-scope.mts'
import { isMainModule } from '../lib/run-node.mts'

export interface StagedCheckPlan {
  lintFiles: string[]
  formatFiles: string[]
  fullLint: boolean
  fullFormat: boolean
}

export function parseStagedPaths(output: string): string[] {
  return output.split('\0').filter(Boolean)
}

export function planStagedChecks(
  stagedFiles: readonly string[],
  lintableFiles: readonly string[],
  formattableFiles: readonly string[],
): StagedCheckPlan {
  const lintable = new Set(lintableFiles)
  const formattable = new Set(formattableFiles)
  const files = [...new Set(stagedFiles)].toSorted()
  return {
    lintFiles: files.filter(file => lintable.has(file)),
    formatFiles: files.filter(file => formattable.has(file)),
    fullLint: files.some(requiresFullLint),
    fullFormat: files.some(requiresFullFormat),
  }
}

export function requiresFullFormat(file: string) {
  return (
    file === '.config/oxfmt.json' ||
    file === 'scripts/repo/format.mts' ||
    file === 'scripts/repo/lib/tooling-scope.mts'
  )
}

export function requiresFullLint(file: string) {
  return (
    file === 'package.json' ||
    file === 'pnpm-lock.yaml' ||
    file === 'pnpm-workspace.yaml' ||
    file.startsWith('.config/') ||
    file === 'scripts/repo/lint.mts' ||
    file.startsWith('scripts/repo/lint/') ||
    file === 'scripts/repo/lib/tooling-scope.mts' ||
    file === 'scripts/repo/lib/run-tool.mts' ||
    file === 'scripts/repo/lib/paths.mts'
  )
}

export function gitOutput(args: string[], root: string) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
  })
}

export function getStagedFiles(root: string) {
  return parseStagedPaths(
    gitOutput(['diff', '--cached', '--name-only', '-z', '--'], root),
  )
}

export function createStagedSnapshot(sourceRoot = REPO_ROOT) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-staged-check-'))
  const prefix = `${directory}${path.sep}`
  try {
    const files = execFileSync(
      'git',
      [
        'ls-files',
        '-z',
        '--',
        ':(glob)src/**/*.mts',
        ':(glob)src/external/*.js',
        ':(glob)src/**/*.d.ts',
        ':(glob)scripts/repo/**/*.mts',
        ':(glob)scripts/fleet/**/*.mts',
        ':(glob)test/repo/**/*.mts',
        ':(glob)docs/**/*.mts',
        ':(glob)docs/**/*.json',
        ':(glob)docs/**/*.md',
        ':(glob)docs/**/*.html',
        ':(glob)assets/repo/model-guide/**/*.json',
        ':(glob)assets/repo/bench/survey-2026-10-03/*.html',
        ':(glob).config/*.mts',
        ':(glob).config/generated/*.mts',
        ':(glob).config/repo/**/*.mts',
        ':(glob).config/*.d.ts',
        ':(glob).config/*.json',
        ':(glob).config/fleet/**/*.json',
        ':(glob).github/**/*.mts',
        'vitest.config.mts',
        'package.json',
        'README.md',
      ],
      { cwd: sourceRoot, encoding: 'buffer' },
    ) as Buffer
    execFileSync(
      'git',
      ['checkout-index', '--stdin', '-z', `--prefix=${prefix}`],
      { cwd: sourceRoot, input: files },
    )
    symlinkSync(
      path.join(sourceRoot, 'node_modules'),
      path.join(directory, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    return directory
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

export function getLintableFiles(root: string) {
  return toolingFiles(root)
}

export function getFormattableFiles(
  root: string,
  lintFiles: readonly string[],
) {
  return [...lintFiles, ...globSync('.config/*.json', { cwd: root })]
}

export async function runNodeTool(args: string[], cwd: string) {
  return runProcess({
    command: process.execPath,
    args,
    cwd,
    env: process.env,
  })
}

export async function checkStagedTranslations(
  files: string[],
  snapshot: string,
) {
  const changed = files.some(
    file =>
      file === 'README.md' ||
      file.startsWith('docs/') ||
      file.startsWith('assets/repo/model-guide/') ||
      file.startsWith('assets/repo/bench/survey-2026-10-03/') ||
      file.startsWith('scripts/repo/translation/'),
  )
  if (!changed) {
    return 0
  }
  console.log('[commit] Checking language coverage for the staged content.')
  const result = await runNodeTool(
    [path.join(snapshot, 'scripts/repo/translation/check.mts')],
    snapshot,
  )
  return result.code ?? 1
}

export async function checkStagedFormat(
  plan: StagedCheckPlan,
  snapshot: string,
) {
  if (plan.fullFormat || plan.formatFiles.length > 0) {
    const formatArgs = plan.fullFormat
      ? [path.join(snapshot, 'scripts/repo/format.mts'), '--check']
      : [
          path.join(snapshot, 'node_modules/oxfmt/bin/oxfmt'),
          '--config',
          '.config/oxfmt.json',
          '--check',
          '--',
          ...plan.formatFiles,
        ]
    const format = await runNodeTool(formatArgs, snapshot)
    if (format.code !== 0) {
      return format.code ?? 1
    }
  }
  return 0
}

export async function checkStagedFiles(root = REPO_ROOT) {
  const stagedFiles = getStagedFiles(root)
  execFileSync('git', ['diff', '--cached', '--check'], {
    cwd: root,
    stdio: 'inherit',
  })

  if (stagedFiles.length === 0) {
    console.log('[commit] No staged files to check.')
    return 0
  }

  const snapshot = createStagedSnapshot(root)
  try {
    const lintable = getLintableFiles(snapshot)
    const plan = planStagedChecks(
      stagedFiles,
      lintable,
      getFormattableFiles(snapshot, lintable),
    )
    console.log(
      `[commit] Checking ${stagedFiles.length} staged paths in an isolated snapshot (${plan.fullLint ? 'full lint' : `${plan.lintFiles.length} lint files`}, ${plan.fullFormat ? 'full format' : `${plan.formatFiles.length} format files`}).`,
    )

    if (plan.fullLint || plan.lintFiles.length > 0) {
      const lint = await runNodeTool(
        [
          path.join(snapshot, 'scripts/repo/lint.mts'),
          ...(plan.fullLint
            ? []
            : plan.lintFiles.map(file => `--file=${file}`)),
        ],
        snapshot,
      )
      if (lint.code !== 0) {
        return lint.code ?? 1
      }
    }

    const formatCode = await checkStagedFormat(plan, snapshot)
    if (formatCode !== 0) {
      return formatCode
    }

    const languageCode = await checkStagedTranslations(stagedFiles, snapshot)
    if (languageCode !== 0) {
      return languageCode
    }

    console.log(
      '[commit] Staged checks passed. Run pnpm run review before opening a pull request.',
    )
    return 0
  } finally {
    rmSync(snapshot, { recursive: true, force: true })
  }
}

if (isMainModule(import.meta.url) && process.argv.includes('--help')) {
  console.log('Usage: node scripts/repo/git/staged-check.mts [--help]')
  console.log(
    'Check staged whitespace, lint, formatting, and language coverage without changing the index or worktree.',
  )
} else if (isMainModule(import.meta.url)) {
  process.exitCode = await checkStagedFiles()
}
