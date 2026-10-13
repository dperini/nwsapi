import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../../../', import.meta.url)),
)
export const SOURCE_DIR = path.join(REPO_ROOT, 'src')
export const CORE_SOURCE_DIR = path.join(SOURCE_DIR, 'core')
export const REPO_SCRIPT_DIR = path.join(REPO_ROOT, 'scripts/repo')
export const NAMING_CHECK_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/naming/check.mts',
)
export const IMPORTANT_ICON_REL_PATH = 'assets/repo/important.svg'
export const SVG_CHECK_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/svg/check.mts',
)
export const UNICODE_ES5_CHECK_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/unicode-es5/check.mts',
)
export const SCRIPT_ENTRYPOINT_CHECK_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/script-entrypoints/check.mts',
)
export const API_DOC_PATH = path.join(REPO_ROOT, 'docs/repo/selector/api.md')
export const API_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/gen/api/markdown.mts',
)
export const ENGINE_SOURCE_PATH = path.join(
  REPO_ROOT,
  'src/core/initialize/load.mts',
)
export const ENGINE_BUILD_PATH = path.join(REPO_ROOT, 'dist/nwsapi.js')
export const ADAPTER_BUILD_PATH = path.join(
  REPO_ROOT,
  'dist/adapter/dom-selector.js',
)
export const BENCHMARK_CACHE_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/bench/cache.bench.mts',
)
export const BENCHMARK_MEMORY_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/bench/memory.bench.mts',
)
export const BENCHMARK_SELECTORS_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/bench/selectors.bench.mts',
)
export const ADAPTER_SOURCE_PATH = path.join(
  REPO_ROOT,
  'src/adapter/dom-selector.mts',
)
export const TRAVERSAL_SOURCE_PATH = path.join(
  REPO_ROOT,
  'src/extension/traversal/register.mts',
)
export const WPT_CANDIDATES_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/wpt/candidates/check.mts',
)
export const UPSTREAM_HELPER_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/git/partial/submodule.mts',
)
export const BROWSER_SETUP_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/browser.mts',
)
export const TOOL_SETUP_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/setup/tools.mts',
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
export const TSRS_CLI_PATH = path.join(
  REPO_ROOT,
  'node_modules/@maschwenk/tsrs/bin/tsrs',
)
export const TSC_CLI_PATH = path.join(
  REPO_ROOT,
  'node_modules/@typescript/native-preview/bin/tsgo',
)
export const TYPECHECK_CONFIG_PATH = path.join(
  REPO_ROOT,
  '.config/tsconfig.check.json',
)
export const COVERAGE_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts/repo/cover.mts',
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

// Extracted from SocketDev/socket-lib src/paths/shared.mts at 5ddd9989dcfcdf57d7b3380bbf2a2020a299354b.
// Internal imports use Node built-ins here so tests have no socket-lib dependency.
const WIN32 = process.platform === 'win32'
const DRIVE_LETTER_REGEXP = /^[A-Za-z]:$/
const msysDriveRegExp = /^\/([a-zA-Z])($|\/)/

// Extracted from SocketDev/socket-lib src/eco/npm/registry/tarball/shared.mts at 42407687c51f1e75e6c2140ba3b3822fd45e1418.
export function toForwardSlashes(name: string): string {
  return name.replaceAll('\\', '/')
}

function appendNormalizedPathSegment(
  state: NormalizedPathState,
  segment: string,
  prefix: string,
): void {
  if (segment.length === 0 || segment === '.') {
    return
  }
  if (segment === '..') {
    collapsePathParent(state, prefix)
  } else {
    state.collapsed += (state.collapsed.length === 0 ? '' : '/') + segment
    state.segmentCount += 1
  }
}

interface NormalizedPathState {
  collapsed: string
  segmentCount: number
  leadingDotDots: number
}

function collapsePathParent(state: NormalizedPathState, prefix: string): void {
  if (state.segmentCount > 0) {
    const lastSeparatorIndex = state.collapsed.lastIndexOf('/')
    if (lastSeparatorIndex === -1) {
      state.collapsed = ''
      state.segmentCount = 0
      if (state.leadingDotDots > 0 && !prefix) {
        state.collapsed = '..'
        state.leadingDotDots = 1
      }
    } else {
      const lastSegmentStart = lastSeparatorIndex + 1
      const lastSegmentValue = state.collapsed.slice(lastSegmentStart)
      if (lastSegmentValue === '..') {
        state.collapsed = `${state.collapsed}/..`
        state.leadingDotDots += 1
      } else {
        state.collapsed = state.collapsed.slice(0, lastSeparatorIndex)
        state.segmentCount -= 1
      }
    }
  } else if (!prefix) {
    state.collapsed =
      state.collapsed + (state.collapsed.length === 0 ? '' : '/') + '..'
    state.leadingDotDots += 1
  }
}

function hasUncPathPrefix(filepath: string): boolean {
  const first = filepath.charCodeAt(0)
  return (
    filepath.length > 2 &&
    isPathSeparatorCode(first) &&
    filepath.charCodeAt(1) === first &&
    filepath.charCodeAt(2) !== first
  )
}

function hasUncPathShare(filepath: string): boolean {
  const serverStart = skipPathSeparators(filepath, 2)
  const serverEnd = indexOfPathSeparator(filepath, serverStart)
  return (
    serverEnd > 2 && skipPathSeparators(filepath, serverEnd) < filepath.length
  )
}

function indexOfPathSeparator(filepath: string, fromIndex: number): number {
  const { length } = filepath
  for (let i = fromIndex; i < length; i += 1) {
    const code = filepath.charCodeAt(i)
    if (code === 47 /*'/'*/ || code === 92 /*'\\'*/) {
      return i
    }
  }
  return -1
}

function isPathSeparatorCode(code: number): boolean {
  return code === 47 || code === 92
}

function msysDriveToNative(normalized: string): string {
  if (WIN32) {
    return normalized.replace(
      msysDriveRegExp,
      (_, letter, sep) => `${letter.toUpperCase()}:${sep || '/'}`,
    )
  }
  return normalized
}

function normalizedPathPrefix(filepath: string) {
  const namespaceKind = filepath.charCodeAt(2)
  if (
    filepath.length > 4 &&
    filepath.charCodeAt(3) === 92 &&
    (namespaceKind === 63 || namespaceKind === 46) &&
    filepath.charCodeAt(0) === 92 &&
    filepath.charCodeAt(1) === 92
  ) {
    return { __proto__: null, prefix: '//', start: 2 }
  }
  if (hasUncPathPrefix(filepath) && hasUncPathShare(filepath)) {
    return { __proto__: null, prefix: '//', start: 2 }
  }
  const start = skipPathSeparators(filepath, 0)
  return { __proto__: null, prefix: start ? '/' : '', start }
}

export function normalizePath(pathLike: string | Buffer | URL): string {
  const filepath = pathLikeToString(pathLike)
  const { length } = filepath
  if (length === 0) {
    return '.'
  }
  if (length === 1) {
    return filepath.charCodeAt(0) === 92 ? '/' : filepath
  }
  const initial = normalizedPathPrefix(filepath)
  const { prefix } = initial
  let { start } = initial
  let nextIndex = indexOfPathSeparator(filepath, start)
  if (nextIndex === -1) {
    return normalizeSinglePathSegment(filepath.slice(start), prefix)
  }
  const state: NormalizedPathState = {
    collapsed: '',
    segmentCount: 0,
    leadingDotDots: 0,
  }
  while (nextIndex !== -1) {
    appendNormalizedPathSegment(state, filepath.slice(start, nextIndex), prefix)
    start = skipPathSeparators(filepath, nextIndex + 1)
    nextIndex = indexOfPathSeparator(filepath, start)
  }
  appendNormalizedPathSegment(state, filepath.slice(start), prefix)
  const { collapsed } = state
  if (collapsed.length === 0) {
    return prefix || '.'
  }
  // A drive root keeps its slash; a bare drive denotes its current directory.
  if (
    DRIVE_LETTER_REGEXP.test(collapsed) &&
    isPathSeparatorCode(filepath.charCodeAt(2))
  ) {
    return msysDriveToNative(`${prefix}${collapsed}/`)
  }
  return msysDriveToNative(prefix + collapsed)
}

function normalizeSinglePathSegment(segment: string, prefix: string): string {
  if (segment === '.' || segment.length === 0) {
    return prefix || '.'
  }
  if (segment === '..') {
    return prefix ? prefix.slice(0, -1) || '/' : '..'
  }
  return msysDriveToNative(prefix + segment)
}

// Extracted from SocketDev/socket-lib src/paths/shared.mts at 5ddd9989dcfcdf57d7b3380bbf2a2020a299354b.
export function foldPathForCompare(pathLike: string): string {
  let normalized = normalizePath(pathLike)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return WIN32 ? normalized.toLowerCase() : normalized
}

// Extracted from SocketDev/socket-lib src/paths/predicates.mts at 5ddd9989dcfcdf57d7b3380bbf2a2020a299354b.
export function isPathWithinRoot(candidate: string, root: string): boolean {
  const left = foldPathForCompare(candidate)
  const right = foldPathForCompare(root)
  return (
    left === right || left.startsWith(right.endsWith('/') ? right : `${right}/`)
  )
}

function pathLikeToString(
  pathLike: string | Buffer | URL | null | undefined,
): string {
  if (pathLike === null || pathLike === undefined) {
    return ''
  }
  if (typeof pathLike === 'string') {
    return pathLike
  }
  if (Buffer.isBuffer(pathLike)) {
    return pathLike.toString('utf8')
  }
  if (pathLike instanceof URL) {
    try {
      return fileURLToPath(pathLike)
    } catch {
      // On Windows, file URLs like `file:///C:/path` include drive letters.
      // Missing-drive-letter URLs throw; this fallback extracts the
      // pathname directly and decodes percent-encoding.
      const pathname = pathLike.pathname

      const decodedPathname = decodeURIComponent(pathname)
      if (WIN32 && decodedPathname.startsWith('/')) {
        // Drive-letter pattern: /[a-zA-Z]:/
        const letter = decodedPathname.charCodeAt(1) | 0x20
        const hasValidDriveLetter =
          decodedPathname.length >= 3 &&
          letter >= 97 &&
          letter <= 122 &&
          decodedPathname.charAt(2) === ':'

        if (!hasValidDriveLetter) {
          // Preserve Unix-style absolute paths on Windows when the URL
          // didn't carry a drive letter.
          return decodedPathname
        }
      }
      return decodedPathname
    }
  }
  return String(pathLike)
}

function skipPathSeparators(filepath: string, start: number): number {
  while (isPathSeparatorCode(filepath.charCodeAt(start))) {
    start += 1
  }
  return start
}
