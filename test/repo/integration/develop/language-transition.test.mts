import { spawnSync } from 'node:child_process'
import { createTerminal } from '@termless/core'
import { createXtermBackend } from '@termless/xtermjs'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

test('Solid animates a language change without replacing the task control or running it', async () => {
  const fixture = new URL('./fixture/language-transition.mts', import.meta.url)
    .href
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-ffi',
      '--input-type=module',
      '-e',
      `import { exerciseLanguageTransition } from ${JSON.stringify(fixture)}; console.log(JSON.stringify(await exerciseLanguageTransition()));`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, NWSAPI_WIZARD_ANIMATIONS: '1' },
    },
  )
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  const output = JSON.parse(result.stdout) as {
    before: string
    during: string
    after: string
    selected: number
    destroyed: boolean
    activations: number
    language: string
  }
  expect(output).toMatchObject({
    selected: 0,
    destroyed: false,
    activations: 0,
    language: 'it',
  })
  expect(output.during).not.toBe(output.before)
  expect(output.during).not.toBe(output.after)
  const terminal = createTerminal({
    backend: createXtermBackend(),
    cols: 100,
    rows: 30,
  })
  try {
    for (const frame of [output.before, output.during, output.after]) {
      terminal.feed('\x1b[2J\x1b[H' + frame.split('\n').join('\r\n'))
      expect(terminal.findText('NWSAPI v3')).not.toBeNull()
      const position = terminal.findText('pnpm run go')
      expect(position).not.toBeNull()
    }
    expect(terminal.findText('Configura questo checkout')).not.toBeNull()
    expect(terminal.findText('it ▾')).not.toBeNull()
  } finally {
    await terminal.close()
  }
})
