import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { readJourney } from '../../../../../scripts/repo/test/onboarding/readme.mts'

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
