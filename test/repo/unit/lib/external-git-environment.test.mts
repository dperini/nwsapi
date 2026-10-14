import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import {
  externalGitEnvironment,
  targetsWptRepository,
} from '../../../../scripts/repo/lib/external-git-environment.mts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('external git environment removes repository context and preserves other settings', () => {
  const environment = {
    ...process.env,
    PATH: '/tools/bin',
    GIT_DIR: '/work/nwsapi/.git',
    GIT_COMMON_DIR: '/work/nwsapi/.git',
    GIT_WORK_TREE: '/work/nwsapi',
    GIT_INDEX_FILE: '/work/nwsapi/.git/index',
    GIT_OBJECT_DIRECTORY: '/work/nwsapi/.git/objects',
    GIT_ALTERNATE_OBJECT_DIRECTORIES: '/work/shared/objects',
    GIT_PREFIX: 'scripts/repo/',
    GIT_SHALLOW_FILE: '/work/nwsapi/.git/shallow',
    GIT_CONFIG_GLOBAL: '/work/user-gitconfig',
    GITHUB_TOKEN: 'preserved-for-authentication',
  }

  const result = externalGitEnvironment(environment)

  expect(result).toMatchObject({
    PATH: '/tools/bin',
    GIT_CONFIG_GLOBAL: '/work/user-gitconfig',
    GITHUB_TOKEN: 'preserved-for-authentication',
  })
  for (const variable of [
    'GIT_DIR',
    'GIT_COMMON_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_PREFIX',
    'GIT_SHALLOW_FILE',
  ]) {
    expect(result[variable]).toBeUndefined()
  }
  expect(environment.GIT_INDEX_FILE).toBe('/work/nwsapi/.git/index')
})

test('external repository matching is limited to the configured WPT checkout', () => {
  expect(
    targetsWptRepository(
      '/checkout',
      ['-C', 'upstream/wpt', 'rev-parse'],
      '/checkout',
    ),
  ).toBe(true)
  expect(
    targetsWptRepository(
      '/checkout',
      ['-C', 'other/repo', 'rev-parse'],
      '/checkout',
    ),
  ).toBe(false)
  expect(targetsWptRepository('/checkout', ['status'], undefined)).toBe(false)
})

test('git commands with external context read the explicitly selected repository', () => {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-external-git-context-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const repositoryA = path.join(temporaryDirectory, 'repo-a')
  const repositoryB = path.join(temporaryDirectory, 'repo-b')
  mkdirSync(repositoryA)
  mkdirSync(repositoryB)
  const cleanEnvironment = externalGitEnvironment()
  const commit = (directory: string, filename: string) => {
    execFileSync('git', ['init', '-b', 'main'], {
      cwd: directory,
      env: cleanEnvironment,
      stdio: 'ignore',
    })
    writeFileSync(path.join(directory, filename), filename)
    execFileSync('git', ['add', filename], {
      cwd: directory,
      env: cleanEnvironment,
      stdio: 'ignore',
    })
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-m',
        filename,
      ],
      { cwd: directory, env: cleanEnvironment, stdio: 'ignore' },
    )
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: directory,
      env: cleanEnvironment,
      encoding: 'utf8',
    }).trim()
  }
  const revisionA = commit(repositoryA, 'a.txt')
  const revisionB = commit(repositoryB, 'b.txt')
  const inheritedContext = {
    ...externalGitEnvironment(),
    GIT_DIR: path.join(repositoryA, '.git'),
  }

  expect(
    execFileSync('git', ['-C', repositoryB, 'rev-parse', 'HEAD'], {
      env: inheritedContext,
      encoding: 'utf8',
    }).trim(),
  ).toBe(revisionA)
  expect(
    execFileSync('git', ['-C', repositoryB, 'rev-parse', 'HEAD'], {
      env: externalGitEnvironment(inheritedContext),
      encoding: 'utf8',
    }).trim(),
  ).toBe(revisionB)
})
