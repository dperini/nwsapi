import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  changedFiles,
  git,
  regularFiles,
  assertAllowedChanges,
} from '../../../../../scripts/repo/git/followup/git.mts'

const roots: string[] = []
export function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'followup-paths-'))
  roots.push(root)
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.name', 'Test'])
  git(root, ['config', 'user.email', 'test@example.invalid'])
  git(root, ['config', 'commit.gpgsign', 'false'])
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

test('preserves unusual filenames and includes both sides of a rename', () => {
  const root = fixture()
  const original = 'old name\nfile.txt'
  const renamed = '-new name.txt'
  writeFileSync(path.join(root, original), 'text')
  git(root, ['add', '--', original])
  git(root, ['commit', '-m', 'initial'])
  expect(changedFiles(root, 'HEAD')).toEqual([original])
  git(root, ['mv', '--', original, renamed])
  git(root, ['commit', '-m', 'rename'])
  expect(changedFiles(root, 'HEAD')).toEqual([renamed, original])
  expect(regularFiles(root, changedFiles(root, 'HEAD'))).toEqual([renamed])
  writeFileSync(path.join(root, renamed), 'updated')
  expect(() => assertAllowedChanges(root, [renamed])).not.toThrow()
  expect(() => assertAllowedChanges(root, [])).toThrow(
    'outside the commit scope',
  )
})

test('does not follow symlinks or permit paths outside the checkout', () => {
  const root = fixture()
  writeFileSync(path.join(root, 'file.txt'), 'text')
  symlinkSync('file.txt', path.join(root, 'link.txt'))
  expect(regularFiles(root, ['file.txt', 'link.txt', 'deleted.txt'])).toEqual([
    'file.txt',
  ])
  expect(() => regularFiles(root, ['../outside'])).toThrow('outside checkout')
})

test('merge commits compare against the first parent', () => {
  const root = fixture()
  git(root, ['commit', '--allow-empty', '-m', 'initial'])
  git(root, ['switch', '-c', 'feature'])
  writeFileSync(path.join(root, 'feature.txt'), 'feature')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'feature'])
  git(root, ['switch', 'main'])
  writeFileSync(path.join(root, 'main.txt'), 'main')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'main'])
  git(root, ['merge', '--no-ff', 'feature', '-m', 'merge'])
  expect(changedFiles(root, 'HEAD')).toEqual(['feature.txt'])
})
