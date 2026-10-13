/*
 * MIT License
 *
 * Copyright (c) 2024 Socket Inc
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// Extracted from SocketDev/socket-lib src/paths/shared.mts at 5ddd9989dcfcdf57d7b3380bbf2a2020a299354b.
// Internal imports use Node built-ins here so tests have no socket-lib dependency.
import { fileURLToPath } from 'node:url'

const WIN32 = process.platform === 'win32'
const DRIVE_LETTER_REGEXP = /^[A-Za-z]:$/
const msysDriveRegExp = /^\/([a-zA-Z])($|\/)/

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
