#!/usr/bin/env node

import { readdirSync } from 'node:fs'
import path from 'node:path'

import { findFilenamePrefixGroups } from '../lib/prefix-groups.mts'
import { findSourceLayoutIssues } from '../lib/source-layout.mts'
import { REPO_ROOT, REPO_SCRIPT_DIR, SOURCE_DIR } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'

function treePaths(directory: string): string[] {
  const paths: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      paths.push(
        path.relative(REPO_ROOT, absolutePath).replaceAll('\\', '/'),
        ...treePaths(absolutePath),
      )
    } else if (entry.isFile()) {
      paths.push(path.relative(REPO_ROOT, absolutePath).replaceAll('\\', '/'))
    }
  }
  return paths
}

export function checkNaming(
  files = [...treePaths(SOURCE_DIR), ...treePaths(REPO_SCRIPT_DIR)],
) {
  const groups = findFilenamePrefixGroups(files)
  const issues = findSourceLayoutIssues(files)
  if (groups.length === 0 && issues.length === 0) {
    return
  }
  const detail = groups.map(group => {
    const collisions = group.collisions.length
      ? ` Existing targets: ${group.collisions.join(', ')}.`
      : ''
    return `${group.files.join(', ')} should move under the reviewed singular directory ${group.suggestedDirectory}/.${collisions}`
  })
  for (const issue of issues) {
    detail.push(
      issue.kind === 'uncategorized-module'
        ? `${issue.file}: ${issue.directory}/ contains category directories only. Move this module into the directory that owns its responsibility and update its imports.`
        : issue.kind === 'authored-declaration'
          ? `${issue.file}: authored types belong in .mts modules. Move them into the owning implementation or a type-only .mts module and update type imports. Declaration files in src/ are reserved for external JavaScript loaders.`
          : `${issue.file}: a sibling directory already represents this module. Move it inside ${issue.directory}/ with a name that describes its role, then update its imports.`,
    )
  }
  throw new Error(`Project naming needs organization.\n${detail.join('\n')}`)
}

if (isMainModule(import.meta.url)) {
  checkNaming()
}
