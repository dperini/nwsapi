import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

const runKey = process.platform === 'darwin' ? '↩ Return' : '↵ Enter'
const quitKey = process.platform === 'darwin' ? '⎋ Esc' : 'Esc'

const fixture = new URL('./fixture/menu.mts', import.meta.url).href
const source = `
  import { captureMenuFrames } from ${JSON.stringify(fixture)};
  console.log(JSON.stringify(await captureMenuFrames()));
`

function flatten(frame: string) {
  // Scrollbar cells separate wrapped lines in the captured terminal frame.
  return frame.replace(/[▀▄█]/g, '').replace(/\s+/g, ' ')
}

test('native menu keeps commands fixed and exposes flexible content at terminal sizes', () => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-ffi', '--input-type=module', '-e', source],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10_000 },
  )
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  const output = JSON.parse(result.stdout) as {
    frames: string[]
    remediation: string
    pageDown: { selected: number; activations: number }
    preview: {
      scrollTop: number
      selected: number
      activations: number
      frame: string
    }
    enter: { selected: number; activations: number }
    wideScrolled: string
    largerScrolled: string
    wide: string
    larger: string
    small: string
    commands: string[]
  }
  const first = output.frames[0]!
  const scrolled = output.frames[1]!
  expect(first).toContain('Setup needed')
  expect(first).toContain('Missing tool.')
  expect(first).toContain('pnpm run setup')
  expect(first).toContain(`${runKey} run`)
  expect(first).toContain(`q or ${quitKey} quit`)
  expect(flatten(scrolled)).toContain('LAST HISTORY MARKER')
  expect(flatten(output.remediation)).toContain('complete diagnostic report.')
  for (const frame of [output.wideScrolled, output.largerScrolled]) {
    expect(flatten(frame)).toContain('LAST HISTORY MARKER')
    expect(frame).toContain('Command: pnpm run setup')
    expect(frame).toContain(`${runKey} run`)
  }
  expect(output.pageDown).toEqual({ selected: 0, activations: 0 })
  expect(output.preview).toMatchObject({
    scrollTop: 0,
    selected: 3,
    activations: 0,
  })
  expect(output.preview.frame).toContain('pnpm run setup:check')
  expect(output.enter).toEqual({ selected: 3, activations: 1 })
  for (const frame of [
    first,
    output.preview.frame,
    output.wide,
    output.larger,
  ]) {
    const commandRow = frame
      .split('\n')
      .findIndex(line => line.includes('Command:'))
    const footerRow = frame
      .split('\n')
      .findIndex(line => line.includes(`${runKey} run`))
    expect(commandRow).toBeGreaterThan(-1)
    expect(footerRow).toBeGreaterThan(commandRow)
  }
  for (const [index, frame] of output.commands.entries()) {
    expect(frame).toContain(
      `pnpm run ${['setup', 'guide', 'review', 'setup:check'][index]}`,
    )
    expect(frame).toContain('3. Review my changes')
    expect(frame).not.toContain('3. Review my changes ·')
    if (index > 1) {
      expect(frame).not.toContain('Status:')
    }
  }
  const commandRows = output.commands.map(frame =>
    frame.split('\n').findIndex(line => line.includes('Command:')),
  )
  expect(new Set(commandRows).size).toBe(1)
  expect(output.small).toContain('pnpm run setup:check')
})
