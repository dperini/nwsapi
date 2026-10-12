export function menuKeys(platform = process.platform) {
  return platform === 'darwin'
    ? { run: '↩ Return', quit: '⎋ Esc', page: 'fn ↑/↓ (⇞/⇟)' }
    : { run: '↵ Enter', quit: 'Esc', page: 'PgUp/PgDn (⇞/⇟)' }
}

export function menuHelp(count: number, platform = process.platform) {
  const keys = menuKeys(platform)
  return `1–${count} or ↑/↓ preview · ${keys.run} run · q or ${keys.quit} quit\n${keys.page} scroll details and history`
}
