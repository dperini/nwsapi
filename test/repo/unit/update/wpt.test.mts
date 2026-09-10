import { expect, test } from 'vitest'
import { releasePin, releaseTag } from '../../../../scripts/repo/update/wpt.mts'
import { updateDependencies } from '../../../../scripts/repo/update.mts'

const sha = 'a'.repeat(40)
const hash = 'b'.repeat(64)
const config = `# wpt-old sha256:${'c'.repeat(64)}\n[submodule "upstream/wpt"]\n\tref = ${'d'.repeat(40)}\n# no-release-tag: web-platform-tests publishes no release tags\n`

test('WPT pins preserve configuration while replacing release provenance', () => {
  const next = releasePin(config, 'merge_pr_62589', sha, hash)
  expect(next).toContain(
    `# merge_pr_62589 sha256:${hash}\n[submodule "upstream/wpt"]`,
  )
  expect(next).toContain(`ref = ${'d'.repeat(40)}`)
  expect(next).not.toContain('no-release-tag')
  expect(() => releasePin('', 'release', sha, hash)).toThrow('integrity header')
  expect(() => releasePin(config, 'release', 'master', hash)).toThrow(
    'Invalid WPT commit',
  )
  expect(() => releasePin(config, 'release', sha, 'unknown')).toThrow(
    'Invalid WPT commit',
  )
})

test('WPT release selection rejects preview releases and malformed tags', () => {
  expect(releaseTag({ tag_name: 'merge_pr_62589' })).toBe('merge_pr_62589')
  for (const release of [
    {},
    { tag_name: 'release', draft: true },
    { tag_name: 'release', prerelease: true },
    { tag_name: 'release\n[submodule "other"]' },
  ]) {
    expect(() => releaseTag(release)).toThrow('published, non-prerelease tag')
  }
})

test('dependency updates refresh WPT before install hooks and keep previews read-only', () => {
  const calls: string[] = []
  const run = () => {
    calls.push('registry')
  }
  const install = () => {
    calls.push('install')
  }
  const wpt = (preview: boolean) => {
    calls.push(preview ? 'wpt-check' : 'wpt-write')
  }
  updateDependencies(true, run, install, () => {}, wpt)
  expect(calls).toEqual(['registry', 'wpt-check'])
  calls.length = 0
  updateDependencies(false, run, install, () => {}, wpt)
  expect(calls).toEqual(['registry', 'wpt-write', 'install'])
  calls.length = 0
  expect(() =>
    updateDependencies(
      false,
      run,
      install,
      () => {},
      () => {
        throw new Error('release unavailable')
      },
    ),
  ).toThrow('release unavailable')
  expect(calls).toEqual(['registry'])
})
