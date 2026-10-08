import { isReadingMode } from './reading-mode.mts'
import { escapeHtml } from './ui.mts'

type WordCue = { text: string; start: number; end: number }

export function transcriptMarkup(text: string) {
  return text
    .split(/(\s+)/)
    .map(word => {
      if (!word.trim()) {
        return word
      }
      const label = escapeHtml(word).replace(
        /\b(?:[\w/.-]+\.(?:mts|mjs|py|js)|nwsapi|jsdom)\b/g,
        '<code>$&</code>',
      )
      return `<span class="spoken-word">${label}</span>`
    })
    .join('')
}

function currentWord(cues: WordCue[], time: number) {
  let low = 0
  let high = cues.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (cues[middle]!.start <= time) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found >= 0 && time < cues[found]!.end ? found : -1
}

export function attachWordHighlight(
  audio: HTMLAudioElement,
  panel: HTMLElement,
  cues: WordCue[],
) {
  const words = Array.from(panel.querySelectorAll<HTMLElement>('.spoken-word'))
  if (words.length !== cues.length) {
    return
  }
  let active = -1
  let frame = 0
  const update = () => {
    const next = audio.ended ? -1 : currentWord(cues, audio.currentTime)
    if (next !== active) {
      const gap =
        active >= 0
          ? (cues[active + 1]?.start ?? Infinity) - cues[active]!.end
          : 0
      words[active]?.classList.toggle('is-pausing', next === -1 && gap >= 0.3)
      words[active]?.classList.remove('is-speaking')
      words[next]?.classList.remove('is-pausing')
      words[next]?.classList.add('is-speaking')
      active = next
    }
  }
  const follow = () => {
    if (isReadingMode()) {
      words.forEach(word => word.classList.remove('is-speaking', 'is-pausing'))
      active = -1
      return
    }
    update()
    if (!audio.paused && !audio.ended) {
      frame = requestAnimationFrame(follow)
    }
  }
  const refresh = () => {
    cancelAnimationFrame(frame)
    follow()
  }
  for (const event of [
    'play',
    'pause',
    'ended',
    'seeking',
    'seeked',
    'timeupdate',
  ]) {
    audio.addEventListener(event, refresh)
  }
  window.addEventListener('guide-reading-mode-change', refresh)
  refresh()
}
