import { expect, test } from 'vitest'
import {
  consoleMessage,
  consoleSymbols,
  supportsConsoleUnicode,
} from '../../../../scripts/repo/develop/console-symbols.mts'

test.each([true, false])(
  'message aliases share the Vowen symbols with Unicode=%s',
  unicode => {
    const symbols = consoleSymbols(unicode)
    expect(symbols.error).toBe(unicode ? '✖' : '×')
    expect(symbols.fail).toBe(symbols.error)
    expect(symbols.caution).toBe(unicode ? '⚠' : '‼')
    expect(symbols.warning).toBe(symbols.caution)
    expect(symbols.pass).toBe(unicode ? '✔' : '√')
    expect(symbols.success).toBe(symbols.pass)
    expect(symbols.info).toBe(unicode ? 'ⓘ' : 'i')
    expect(consoleMessage('error', 'Review failed.', unicode)).toBe(
      `${symbols.error} Review failed.`,
    )
  },
)

test('uses fallback symbols in the Linux kernel console and legacy Windows consoles', () => {
  expect(supportsConsoleUnicode('linux', { TERM: 'linux' })).toBe(false)
  expect(supportsConsoleUnicode('win32', {})).toBe(false)
  expect(supportsConsoleUnicode('linux', { TERM: 'xterm-256color' })).toBe(true)
  expect(supportsConsoleUnicode('darwin', {})).toBe(true)
})

test.each([
  { WT_SESSION: 'terminal' },
  { TERMINUS_SUBLIME: '1' },
  { ConEmuTask: '{cmd::Cmder}' },
  { TERM_PROGRAM: 'Terminus-Sublime' },
  { TERM_PROGRAM: 'vscode' },
  { TERM: 'xterm-256color' },
  { TERM: 'alacritty' },
  { TERM: 'rxvt-unicode' },
  { TERM: 'rxvt-unicode-256color' },
  { TERMINAL_EMULATOR: 'JetBrains-JediTerm' },
])('recognizes supported Windows terminals: %j', env => {
  expect(supportsConsoleUnicode('win32', env)).toBe(true)
})
