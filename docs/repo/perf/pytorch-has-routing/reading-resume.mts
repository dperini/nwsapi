import { translate } from './locale.mts'

type Position = { id: string; updated: number }
const key = 'nwsapi-guide-positions'

function positions(): Record<string, Position> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, Position>
    }
  } catch {
    // Reading works when saved positions are unavailable.
  }
  return {}
}

export function initializeReadingResume(headings: HTMLElement[], path: string) {
  document.querySelector('.reading-resume')?.remove()
  const saved = positions()[path]
  const target = saved && headings.find(heading => heading.id === saved.id)
  if (target && !location.hash) {
    const notice = document.createElement('p')
    notice.className = 'reading-resume'
    const link = document.createElement('a')
    link.href = `#${encodeURIComponent(target.id)}`
    link.textContent = translate('resumeReading').replace(
      '{section}',
      target.textContent?.trim() ?? '',
    )
    link.addEventListener('click', () => {
      let disclosure = target.closest('details')
      while (disclosure) {
        disclosure.open = true
        disclosure = disclosure.parentElement?.closest('details') ?? null
      }
      target.focus({ preventScroll: true })
      notice.remove()
    })
    notice.append(link)
    document.querySelector('.reading-title-row')?.after(notice)
  }
  return (index: number) => {
    const heading = headings[index]
    if (!heading?.id) {
      return
    }
    try {
      const updated = positions()
      updated[path] = { id: heading.id, updated: Date.now() }
      const recent = Object.entries(updated)
        .filter(([, value]) => value && typeof value.updated === 'number')
        .toSorted((a, b) => b[1].updated - a[1].updated)
        .slice(0, 30)
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(recent)))
    } catch {
      // Keep navigation usable when storage is full or unavailable.
    }
  }
}
