import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../../../', import.meta.url)),
)
export const IMPORTANT_ICON_REL_PATH = 'assets/repo/important.svg'
export const SVG_CHECK_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/check/svgs-are-optimized.mts',
)
export const API_DOC_PATH = path.join(REPO_ROOT, 'docs/api.md')
export const API_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/gen/api-md.mts',
)
export const ENGINE_SOURCE_PATH = path.join(REPO_ROOT, 'src/nwsapi.mts')
export const ADAPTER_SOURCE_PATH = path.join(REPO_ROOT, 'src/dom-selector.mts')
export const TRAVERSAL_SOURCE_PATH = path.join(
  REPO_ROOT,
  'src/modules/nwsapi-traversal.mts',
)
export const UPSTREAM_HELPER_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/git-partial-submodule.mts',
)
export const PLAYWRIGHT_CLI_PATH = path.join(
  REPO_ROOT,
  'node_modules/@playwright/test/cli.js',
)
export const TAZE_CLI_PATH = path.join(
  REPO_ROOT,
  'node_modules/taze/bin/taze.mjs',
)
export const WORKSPACE_PATH = path.join(REPO_ROOT, 'pnpm-workspace.yaml')
export const LINT_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts/repo/lint.mts')
export const FORMAT_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/format.mts',
)
export const TSC_CLI_PATH = path.join(
  REPO_ROOT,
  'node_modules/typescript/bin/tsc',
)
export const TSC_CONFIG_PATH = path.join(
  REPO_ROOT,
  '.config/tsconfig.check.json',
)
export const COVERAGE_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/coverage.mts',
)
export const COMPILE_CACHE_DIR = path.join(
  os.tmpdir(),
  'nwsapi',
  'compile-cache',
)
export const COVERAGE_SUMMARY_PATH = path.join(
  REPO_ROOT,
  'coverage/coverage-summary.json',
)
