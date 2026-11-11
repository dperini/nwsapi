export function menuKeys(platform = process.platform) {
  return platform === 'darwin'
    ? { run: 'Return', quit: 'Esc', page: 'fn ↑↓' }
    : { run: 'Enter', quit: 'Esc', page: 'PgUp/PgDn' }
}

export function menuHelp(
  count: number,
  platform = process.platform,
  submenu = false,
) {
  const keys = menuKeys(platform)
  return `1–${count} / ↑↓ choose task · ${keys.run} run · ${submenu ? `${keys.quit} back · q quit` : `${keys.quit} / q quit`}`
}

export function menuExitHelp(submenu = false) {
  return submenu ? 'Esc back · q quit' : 'Esc / q quit'
}
