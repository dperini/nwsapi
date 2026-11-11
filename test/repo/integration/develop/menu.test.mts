import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

const fixture = new URL('./fixture/menu.mts', import.meta.url).href
const source = `
  import { exerciseMenu } from ${JSON.stringify(fixture)};
  console.log(JSON.stringify(await exerciseMenu()));
`

test.each([
  [80, 24],
  [100, 30],
  [120, 40],
])(
  'wizard previews, scrolls, and guards activation at %ix%i',
  (width, height) => {
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-ffi',
        '--input-type=module',
        '-e',
        source.replace('exerciseMenu()', `exerciseMenu(${width}, ${height})`),
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...process.env, NWSAPI_WIZARD_ANIMATIONS: '0' },
      },
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout) as {
      badgeGeometry: { height: number; aligned: boolean }
      initial: { selected: number; scrollTop: number }
      scrolled: { selected: number; scrollTop: number }
      preview: { selected: number; activations: number; scrollTop: number }
      activated: { selected: number; activations: number }
      disabled: {
        selected: number
        activations: number
        expanded: boolean
        panel: string
      }
      skipped: { selected: number; activations: number }
      helpOpened: string
      helpClosed: string
    }

    expect(output.badgeGeometry).toEqual({ height: 1, aligned: true })
    expect(output.initial.selected).toBe(0)
    expect(output.scrolled.selected).toBe(0)
    expect(output.scrolled.scrollTop).toBeGreaterThan(output.initial.scrollTop)
    expect(output.preview).toMatchObject({ selected: 4, activations: 0 })
    expect(output.activated).toEqual({ selected: 4, activations: 1 })
    expect(output.disabled).toEqual({
      selected: 5,
      activations: 1,
      expanded: false,
      panel: 'wizard-menu',
    })
    expect(output.skipped).toEqual({ selected: 3, activations: 1 })
    expect(output.helpOpened).toBe('wizard-command-help')
    expect(output.helpClosed).toBe('wizard-menu')
  },
)

test('more checks keeps specialized tasks selectable and distinguishes back from quit', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-ffi',
      '--input-type=module',
      '-e',
      `import { exerciseReviewMenu } from ${JSON.stringify(fixture)}; console.log(JSON.stringify(await exerciseReviewMenu()));`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, NWSAPI_WIZARD_ANIMATIONS: '0' },
    },
  )
  expect(result.status, result.stderr).toBe(0)
  const output = JSON.parse(result.stdout)
  expect(output.options).toHaveLength(8)
  expect(output.selected).toEqual([4])
  expect(output.backs).toBe(1)
  expect(output.quits).toBe(1)
})

test('m opens the review submenu without running review', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-ffi',
      '--input-type=module',
      '-e',
      `import { exerciseReviewLauncher } from ${JSON.stringify(fixture)}; console.log(JSON.stringify(await exerciseReviewLauncher()));`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, NWSAPI_WIZARD_ANIMATIONS: '0' },
    },
  )
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ opened: 1, activated: 0 })
})

test('language picker applies explicitly, cancels, and restores task focus', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-ffi',
      '--input-type=module',
      '-e',
      `import { exerciseLanguagePicker } from ${JSON.stringify(fixture)}; console.log(JSON.stringify(await exerciseLanguagePicker()));`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, NWSAPI_WIZARD_ANIMATIONS: '0' },
    },
  )
  expect(result.status, result.stderr).toBe(0)
  const output = JSON.parse(result.stdout)
  expect(output.beforeApply).toBe('en')
  expect(output.applied).toMatchObject({
    language: 'it',
    selected: 2,
    activations: 0,
    saved: ['it'],
  })
  expect(output.applied.name).toContain('Configura questo checkout')
  expect(output.cancelled).toBe('it')
  expect(output.saved).toEqual(['it'])
  expect(output.activations).toBe(1)
})
