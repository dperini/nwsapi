#!/usr/bin/env node

import { readdirSync } from 'node:fs'
import path from 'node:path'

import { findFilenamePrefixGroups } from '../lib/prefix-groups.mts'
import { REPO_ROOT, SOURCE_DIR } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'

function sourcePaths(directory: string): string[] {
  const paths: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      paths.push(
        path.relative(REPO_ROOT, absolutePath).replaceAll('\\', '/'),
        ...sourcePaths(absolutePath),
      )
    } else if (entry.isFile()) {
      paths.push(path.relative(REPO_ROOT, absolutePath).replaceAll('\\', '/'))
    }
  }
  return paths
}

export function checkFilenamePrefixGroups(files = sourcePaths(SOURCE_DIR)) {
  const groups = findFilenamePrefixGroups(files)
  if (groups.length === 0) {
    return
  }
  const detail = groups
    .map(group => {
      const collisions = group.collisions.length
        ? ` Existing targets: ${group.collisions.join(', ')}.`
        : ''
      return `${group.files.join(', ')} should move under the reviewed singular directory ${group.suggestedDirectory}/.${collisions}`
    })
    .join('\n')
  throw new Error(
    `Related source modules share a filename prefix instead of a directory.\n${detail}`,
  )
}

if (isMainModule(import.meta.url)) {
  checkFilenamePrefixGroups()
}
