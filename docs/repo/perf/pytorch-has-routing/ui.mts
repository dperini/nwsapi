export function element(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) {
    throw new Error(`Missing guide element: ${id}`)
  }
  return found
}

export function text(id: string, value: string) {
  writeUnitText(element(id), value)
}

export function writeUnitText(
  node: HTMLElement,
  source: string,
  start = 0,
  end = source.length,
) {
  const units = Array.from(source.matchAll(/(?<=\d)(?:µs|ns)\b/g))
  if (!units.length) {
    node.textContent = source.slice(start, end)
    return
  }
  node.replaceChildren()
  let cursor = start
  for (let i = 0, length = units.length; i < length; i += 1) {
    const unit = units[i]!
    const from = Math.max(start, unit.index)
    const to = Math.min(end, unit.index + unit[0].length)
    if (from >= to) {
      continue
    }
    const label = document.createElement('span')
    label.className = 'time-unit'
    label.textContent = source.slice(from, to)
    node.append(source.slice(cursor, from), label)
    cursor = to
  }
  node.append(source.slice(cursor, end))
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
