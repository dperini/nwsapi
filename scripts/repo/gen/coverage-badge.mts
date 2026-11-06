#!/usr/bin/env node
/**
 * Generate or check the README coverage badge from the latest coverage run.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { flag } from '@optique/core/primitives'
import { HELP_SHOWN, runCli } from '../lib/cli/parser.mts'

import { fileURLToPath } from 'node:url'

import {
  badgeAssetPath,
  coverageBadgeSvg,
  migrateReadmeBadge,
  readCoveragePct,
  readmeBadgeForm,
} from '../lib/coverage/badge.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import {
  isPublishedPackage,
  missingGitHubSlugMessage,
  repoGitHubSlug,
} from '../lib/github-raw-url.mts'

const logger = { error: console.error, success: console.log }

export interface MakeCoverageBadgeConfig {
  // Dry-run: report staleness via the exit code, write nothing.
  check?: boolean | undefined
  // The repo to operate on. main() passes REPO_ROOT; tests pass a tmp repo.
  repoRoot: string
}

/**
 * Regenerate (or, under `check`, verify) the repo-local coverage badge.
 * Returns the process exit code: 0 on success/current, 1 on a missing
 * precondition or (under `check`) a stale badge.
 */
export function makeCoverageBadge(config: MakeCoverageBadgeConfig): number {
  const cfg = { __proto__: null, check: false, ...config }
  const readmePath = path.join(cfg.repoRoot, 'README.md')
  if (!existsSync(readmePath)) {
    logger.error(
      'gen/coverage-badge: no README.md at the repo root — nothing to update.',
    )
    return 1
  }
  const readme = readFileSync(readmePath, 'utf8')
  if (!readmeBadgeForm(readme)) {
    logger.error(
      'gen/coverage-badge: README.md has no coverage badge (nor a migratable retired form) to update. Add a coverage image to README.md.',
    )
    return 1
  }
  const pct = readCoveragePct(cfg.repoRoot)
  if (pct === undefined) {
    logger.error(
      'gen/coverage-badge: no coverage data at coverage/coverage-summary.json. Run `pnpm run cover` first (the json-summary reporter emits it), then re-run.',
    )
    return 1
  }
  // A published package's README ref is an absolute raw-GitHub url so the badge
  // renders on the npm package page too, which makes the repo slug a hard
  // requirement there, not a nice-to-have. No relative fallback: it would
  // silently reship the broken npm image this url exists to fix. A private
  // package has no registry page, so it keeps the relative path — the absolute
  // form would break it, since a private repo's raw url is not served
  // anonymously.
  let slug: string | undefined
  if (isPublishedPackage(cfg.repoRoot)) {
    slug = repoGitHubSlug(cfg.repoRoot)
    if (slug === undefined) {
      logger.error(
        `gen/coverage-badge: ${missingGitHubSlugMessage(cfg.repoRoot)}`,
      )
      return 1
    }
  }
  const svgPath = badgeAssetPath(cfg.repoRoot)
  const nextSvg = coverageBadgeSvg(pct)
  const currentSvg = existsSync(svgPath)
    ? readFileSync(svgPath, 'utf8')
    : undefined
  const nextReadme = migrateReadmeBadge(readme, slug, nextSvg)
  if (nextSvg === currentSvg && nextReadme === readme) {
    if (!cfg.check) {
      logger.success(
        `gen/coverage-badge: badge already current at ${Math.round(pct)}%.`,
      )
    }
    return 0
  }
  if (cfg.check) {
    logger.error(
      `gen/coverage-badge: the coverage badge is stale (coverage is ${Math.round(pct)}%). Run \`node scripts/repo/gen/coverage-badge.mts\` and commit.`,
    )
    return 1
  }
  mkdirSync(path.dirname(svgPath), { recursive: true })
  writeFileSync(svgPath, nextSvg)
  if (nextReadme !== readme) {
    writeFileSync(readmePath, nextReadme)
    logger.success(
      'gen/coverage-badge: migrated the README badge line to the local asset reference.',
    )
  }
  logger.success(
    `gen/coverage-badge: coverage badge set to ${Math.round(pct)}% (assets/repo/coverage.svg).`,
  )
  return 0
}

export function main(check = false): void {
  process.exitCode = makeCoverageBadge({
    check,
    repoRoot: REPO_ROOT,
  })
}

export function parseCoverageBadgeArgs(args: string[]) {
  return runCli(
    object({ check: withDefault(flag('--check'), false) }),
    'gen:coverage-badge',
    args,
    {
      brief: message`Generate or verify the README coverage badge.`,
    },
  )
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  let options:
    | ReturnType<typeof parseCoverageBadgeArgs>
    | typeof HELP_SHOWN
    | undefined
  try {
    options = parseCoverageBadgeArgs(process.argv.slice(2))
  } catch {
    process.exitCode = 1
  }
  if (options === HELP_SHOWN) {
    process.exitCode = 0
  } else if (options) {
    main(options.check)
  }
}
