import { readFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, normalizePath } from '../lib/paths.mts'

export const DRY_RUN_ENTRIES = new Set([
  'scripts/repo/browser.mts',
  'scripts/repo/node.mts',
  'scripts/repo/clean.mts',
  'scripts/repo/setup/bootstrap.mts',
  'scripts/repo/setup/browser-tests.mts',
  'scripts/repo/setup/agents.mts',
  'scripts/repo/setup/run.mts',
  'scripts/repo/setup/prepare.mts',
  'scripts/repo/setup/security.mts',
  'scripts/repo/setup/tools.mts',
  'scripts/repo/setup/wpt.mts',
  'scripts/repo/setup/tak.mts',
  'scripts/repo/setup/voiceover/run.mts',
  'scripts/repo/setup/hooks.mts',
  'scripts/repo/setup/model-training.mts',
  'scripts/repo/video/run.mts',
  'scripts/repo/test/onboarding/ci.mts',
  'scripts/repo/test/onboarding/run.mts',
])

export interface ScriptDescription {
  schemaVersion: 1
  type: 'command'
  entry: string
  packageScripts: string[]
  description: string
  options: string[]
  changes: 'declared' | 'not-declared'
}

export function describeScript(entry: string, root = REPO_ROOT) {
  const relative = normalizePath(path.relative(root, path.resolve(root, entry)))
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as {
    scripts?: Record<string, string>
  }
  const packageScripts = Object.entries(manifest.scripts ?? {})
    .filter(([, command]) => command.includes(relative))
    .map(([name]) => name)
    .toSorted((first, second) => first.localeCompare(second))
  const supportsDryRun = DRY_RUN_ENTRIES.has(relative)
  return {
    schemaVersion: 1,
    type: 'command',
    entry: relative,
    packageScripts,
    description: packageScripts.length
      ? `Repository command used by ${packageScripts.map(name => `pnpm run ${name}`).join(', ')}.`
      : `Repository script entrypoint ${relative}.`,
    options: ['--json', '--describe', ...(supportsDryRun ? ['--dry-run'] : [])],
    changes: supportsDryRun ? 'declared' : 'not-declared',
  } satisfies ScriptDescription
}

export function formatScriptDescription(description: ScriptDescription) {
  return [
    description.entry,
    description.description,
    `Options: ${description.options.join(', ')}`,
    `Change behavior: ${description.changes}`,
  ].join('\n')
}

export function parseCommandJson(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

export function commandResult(
  entry: string,
  args: string[],
  result: {
    status: number | null
    signal: NodeJS.Signals | null
    stdout: string
    stderr: string
    error?: Error | undefined
  },
) {
  return {
    schemaVersion: 1,
    type: 'result',
    command: { entry, args },
    exitCode: result.status,
    signal: result.signal,
    output: parseCommandJson(result.stdout),
    stderr: result.stderr.trim() || undefined,
    ...(result.error ? { error: result.error.message } : {}),
  }
}
