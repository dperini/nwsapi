import { expect, test } from 'vitest'
import {
  formatCliOutput,
  isCompatibleNodeVersion,
  jsonArguments,
  shouldUseColor,
  supportsTuiPlatform,
} from '../../../../../scripts/repo/cli/ui/terminal.mts'

test('colors only terminal output when NO_COLOR and TERM allow it', () => {
  expect(shouldUseColor({ isTTY: true, env: {} })).toBe(true)
  expect(shouldUseColor({ isTTY: false, env: {} })).toBe(false)
  expect(shouldUseColor({ isTTY: true, env: { NO_COLOR: '' } })).toBe(false)
  expect(shouldUseColor({ isTTY: true, env: { TERM: 'dumb' } })).toBe(false)
  expect(shouldUseColor({ isTTY: true, env: {}, json: true })).toBe(false)
})

test('help headings receive ANSI while command output and JSON remain intact', () => {
  expect(formatCliOutput('Usage: nwsapi <command>', true)).toContain('\u001b[')
  expect(formatCliOutput('nwsapi / Command menu', true)).toContain('\u001b[')
  expect(formatCliOutput('nwsapi / Command menu', false)).not.toContain(
    '\u001b[',
  )
  expect(formatCliOutput('{"ok":true}', true)).toBe('{"ok":true}')
  expect(formatCliOutput('nwsapi: bad selector', false, true)).toBe(
    'nwsapi: bad selector',
  )
})

test('TUI runtime requires Node 26.4 and a supported native target', () => {
  expect(isCompatibleNodeVersion('v26.4.0')).toBe(true)
  expect(isCompatibleNodeVersion('v26.3.99')).toBe(false)
  expect(isCompatibleNodeVersion('v22.20.0')).toBe(false)
  expect(isCompatibleNodeVersion('not a version')).toBe(false)
  expect(supportsTuiPlatform('darwin', 'arm64', undefined)).toBe(true)
  expect(supportsTuiPlatform('linux', 'x64', 'musl')).toBe(true)
  expect(supportsTuiPlatform('linux', 'x64', undefined)).toBe(false)
  expect(supportsTuiPlatform('win32', 'ia32', undefined)).toBe(false)
  expect(supportsTuiPlatform('aix', 'x64', undefined)).toBe(false)
})

test('JSON flags are recognized before applying color formatting', () => {
  expect(jsonArguments(['compile', '.x', '--json'])).toBe(true)
  expect(jsonArguments(['compile', '.x', '-j'])).toBe(true)
  expect(jsonArguments(['--help'])).toBe(false)
})
