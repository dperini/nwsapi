export function replaceWarningSample(container: HTMLElement, markup: string) {
  const active = container.ownerDocument.activeElement
  const warning =
    active instanceof container.ownerDocument.defaultView!.HTMLElement &&
    container.contains(active)
      ? active.closest<HTMLButtonElement>('button[data-warning]')
      : null
  const warningIndex = warning?.dataset['warning']
  container.innerHTML = markup
  if (warningIndex === undefined) {
    return
  }
  for (const button of container.querySelectorAll<HTMLButtonElement>(
    'button[data-warning]',
  )) {
    if (button.dataset['warning'] === warningIndex) {
      button.focus()
      return
    }
  }
}
