import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  toolDirectory,
  toolExecutable,
  toolPlan,
  toolVersions,
  REPO_ROOT,
} from '../external-tools.mjs'

export const MISE_ROOT = path.join(REPO_ROOT, '.cache', 'mise')

export function miseEnvironment(env = process.env, directory = MISE_ROOT) {
  const result = { ...env }
  const names = Object.keys(result)
  for (let i = 0, length = names.length; i < length; i += 1) {
    if (
      names[i].startsWith('MISE_') ||
      ['NODE_OPTIONS', 'NODE_PATH', 'NODE_EXECUTABLE'].includes(names[i])
    ) {
      delete result[names[i]]
    }
  }
  return {
    ...result,
    MISE_NO_CONFIG: '1',
    MISE_DATA_DIR: path.join(directory, 'data'),
    MISE_CACHE_DIR: path.join(directory, 'cache'),
    MISE_CONFIG_DIR: path.join(directory, 'config'),
    MISE_STATE_DIR: path.join(directory, 'state'),
    MISE_GLOBAL_CONFIG_FILE: path.join(directory, 'empty.toml'),
    MISE_SYSTEM_CONFIG_FILE: path.join(directory, 'empty.toml'),
  }
}

export function nubRequest(args) {
  return {
    command: toolExecutable('mise'),
    args: [
      'exec',
      `github:nubjs/nub@${toolVersions()['nub']}`,
      '--',
      'nub',
      ...args,
    ],
  }
}

export function registerNub(run = execFileSync) {
  mkdirSync(MISE_ROOT, { recursive: true })
  writeFileSync(path.join(MISE_ROOT, 'empty.toml'), '')
  // Reuse the verified release so mise does not need another download or global install.
  run(
    toolExecutable('mise'),
    [
      'link',
      '--force',
      `github:nubjs/nub@${toolVersions()['nub']}`,
      toolDirectory(toolPlan('nub')),
    ],
    {
      cwd: MISE_ROOT,
      env: miseEnvironment(),
      stdio: 'inherit',
    },
  )
}
