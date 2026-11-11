// Matches Vowen's logger/symbols-builder and is-unicode-supported convention.
// Vowen catalog sources: logger/symbols-builder.mts and
// packages/is-unicode-supported/index.cjs (MIT).
export function supportsConsoleUnicode(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (platform !== 'win32') {
    return env['TERM'] !== 'linux'
  }
  return Boolean(
    env['WT_SESSION'] ||
    env['TERMINUS_SUBLIME'] ||
    env['ConEmuTask'] === '{cmd::Cmder}' ||
    ['Terminus-Sublime', 'vscode'].includes(env['TERM_PROGRAM'] ?? '') ||
    [
      'xterm-256color',
      'alacritty',
      'rxvt-unicode',
      'rxvt-unicode-256color',
    ].includes(env['TERM'] ?? '') ||
    env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm',
  )
}

export function consoleSymbols(unicode = supportsConsoleUnicode()) {
  const fail = unicode ? '✖' : '×'
  const pass = unicode ? '✔' : '√'
  const caution = unicode ? '⚠' : '‼'
  return {
    error: fail,
    fail,
    pass,
    success: pass,
    caution,
    warning: caution,
    info: unicode ? 'ⓘ' : 'i',
  }
}

export type MessageKind = keyof ReturnType<typeof consoleSymbols>
export function consoleMessage(
  kind: MessageKind,
  message: string,
  unicode = supportsConsoleUnicode(),
) {
  return `${consoleSymbols(unicode)[kind]} ${message}`
}
