import { expect, test } from 'vitest'
import {
  candidatePathsMatch,
  parseWorktreeInventory,
} from '../../../../../scripts/repo/develop/worktree/sweep.mts'

test('parses Git worktree records with Windows line endings, spaces, and locked or detached checkouts', () => {
  expect(
    parseWorktreeInventory(
      'worktree C:/Users/Dev Name/repo\r\nHEAD abc\r\nbranch refs/heads/master\r\n\r\nworktree C:/Temp/checkout\r\nHEAD def\r\ndetached\r\nlocked maintenance\r\n\r\n',
    ),
  ).toEqual([
    { path: 'C:/Users/Dev Name/repo', branch: 'master', locked: false },
    { path: 'C:/Temp/checkout', branch: undefined, locked: true },
  ])
  expect(parseWorktreeInventory('')).toEqual([])
})

test('matches native Windows paths to Git paths while rejecting unrelated cleanup targets', () => {
  const metadata = { repository: 'C:/repo/.git' }
  const paths = {
    parent: 'C:\\Temp\\nwsapi-worktree-owned',
    temporaryRoot: 'C:/Temp',
    repository: 'C:\\repo\\.git',
    checkout: 'C:\\Temp\\nwsapi-worktree-owned\\checkout',
  }
  expect(candidatePathsMatch(metadata, paths)).toBe(true)
  expect(candidatePathsMatch({ repository: 'C:/other/.git' }, paths)).toBe(
    false,
  )
  expect(candidatePathsMatch(metadata, { ...paths, parent: 'C:/Temp' })).toBe(
    false,
  )
  expect(
    candidatePathsMatch(metadata, { ...paths, temporaryRoot: 'C:/Tem' }),
  ).toBe(false)
  expect(
    candidatePathsMatch(metadata, {
      ...paths,
      checkout: 'C:/Temp/unrelated/checkout',
    }),
  ).toBe(false)
})
