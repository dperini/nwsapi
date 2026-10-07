export function element(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) {
    throw new Error(`Missing guide element: ${id}`)
  }
  return found
}

export function text(id: string, value: string) {
  element(id).textContent = value
}

export function input(id: string) {
  return element(id) as HTMLInputElement
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
