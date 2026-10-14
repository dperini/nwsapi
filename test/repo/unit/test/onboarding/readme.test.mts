import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  parseJourney,
  readJourney,
} from '../../../../../scripts/repo/test/onboarding/readme.mts'

test('README commands are read only from its balanced onboarding section', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-readme-'))
  const command =
    '<!-- onboarding:bootstrap:start -->\n```sh\nnode setup.mts\n```\n<!-- onboarding:bootstrap:end -->'
  try {
    writeFileSync(
      path.join(root, 'README.md'),
      `<!-- <onboarding> -->\n${command}\n<!-- </onboarding> -->\n${command}`,
    )
    expect(await readJourney(root)).toEqual([
      { id: 'bootstrap', command: ['node', 'setup.mts'] },
    ])
    writeFileSync(path.join(root, 'README.md'), command)
    await expect(readJourney(root)).rejects.toThrow()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('multiline quick starts preserve separate executable commands', () => {
  expect(
    parseJourney(
      '<!-- onboarding:pnpm-install:start -->\n```sh\npnpm i\npnpm run dev\n```\n<!-- onboarding:pnpm-install:end -->',
    ),
  ).toEqual([
    { id: 'pnpm-install', command: ['pnpm', 'i'] },
    { id: 'pnpm-install-2', command: ['pnpm', 'run', 'dev'] },
  ])
})
