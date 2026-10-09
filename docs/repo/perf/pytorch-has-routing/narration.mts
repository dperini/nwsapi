import italianTranscript from '../../../../assets/repo/model-guide/locales/narration.it.json'
import { currentLocale, translate } from './locale.mts'
import italianTimings from '../../../../assets/repo/model-guide/narration/timings.it.generated.json'
import transcript from '../../../../assets/repo/model-guide/narration/transcript.json'
import timings from '../../../../assets/repo/model-guide/narration/timings.generated.json'
import type { ImportGlobFunction } from 'vite'
import { element } from './ui.mts'
import { attachWordHighlight, transcriptMarkup } from './spoken-words.mts'

declare global {
  interface ImportMeta {
    glob: ImportGlobFunction
  }
}

const clips = import.meta.glob<string>(
  '../../../../assets/repo/model-guide/narration/*.generated.mp3',
  { eager: true, query: '?url', import: 'default' },
)
let playing: HTMLAudioElement | undefined

function formatTime(seconds: number) {
  const rounded = Math.floor(Number.isFinite(seconds) ? seconds : 0)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

function attachPlayer(
  audio: HTMLAudioElement,
  panel: HTMLElement,
  title: string,
  recordedDuration: number,
) {
  const button = panel.querySelector<HTMLButtonElement>('button')!
  const label = button.querySelector('span')!
  const icon = button.querySelector('path')!
  const time = panel.querySelector<HTMLElement>('.narration-time')!
  const seek = panel.querySelector<HTMLInputElement>('input')!
  let request = 0
  const update = () => {
    const duration = Number.isFinite(audio.duration)
      ? audio.duration
      : recordedDuration
    const active = !audio.paused
    label.textContent = translate(active ? 'pause' : 'listen')
    icon.setAttribute(
      'd',
      active ? 'M7 5h4v14H7ZM14 5h4v14h-4Z' : 'm9 5 10 7-10 7Z',
    )
    button.setAttribute('aria-pressed', String(active))
    button.setAttribute(
      'aria-label',
      translate(active ? 'pauseNarration' : 'listenNarration').replace(
        '{title}',
        title,
      ),
    )
    panel.classList.toggle('is-playing', active)
    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`
    seek.max = String(Number.isFinite(audio.duration) ? audio.duration : 0)
    seek.value = String(audio.currentTime)
    seek.disabled = !Number.isFinite(audio.duration)
    seek.setAttribute(
      'aria-valuetext',
      translate('narrationProgress')
        .replace('{current}', formatTime(audio.currentTime))
        .replace('{duration}', formatTime(duration)),
    )
    const progress =
      audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0
    seek.style.setProperty('--audio-progress', `${progress}%`)
  }
  for (
    let i = 0,
      events = ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended'],
      length = events.length;
    i < length;
    i += 1
  ) {
    audio.addEventListener(events[i]!, update)
  }
  seek.addEventListener('input', () => {
    audio.currentTime = Number(seek.value)
    update()
  })
  seek.setAttribute(
    'aria-label',
    translate('seekNarration').replace('{title}', title),
  )
  button.addEventListener('click', () => {
    request += 1
    if (!audio.paused) {
      audio.pause()
      return
    }
    playing?.pause()
    playing = audio
    const attempt = request
    void audio.play().catch(() => {
      if (attempt !== request || playing !== audio) {
        return
      }
      audio.pause()
      playing = undefined
      update()
      label.textContent = translate('audioUnavailable')
      button.setAttribute(
        'aria-label',
        translate('retryNarration').replace('{title}', title),
      )
      panel.setAttribute('role', 'status')
    })
  })
  update()
}

export function initializeNarration() {
  playing?.pause()
  playing = undefined
  document.querySelectorAll('.narration').forEach(panel => panel.remove())
  for (let i = 0, length = transcript.sections.length; i < length; i += 1) {
    const section = transcript.sections[i]!
    const italian = currentLocale() === 'it'
    const file = italian ? `${section.id}.it.generated.mp3` : section.file
    const audio = new Audio(
      clips[`../../../../assets/repo/model-guide/narration/${file}`],
    )
    audio.preload = 'none'
    const panel = document.createElement('div')
    panel.className = 'narration'
    panel.setAttribute('data-locale-content', '')
    const text = italian
      ? italianTranscript[section.id as keyof typeof italianTranscript]
      : section.text
    const written = transcriptMarkup(text)
    panel.innerHTML = `<button type="button" class="narration-play" aria-pressed="false" aria-label="Play section narration"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg><span>Listen</span></button><input class="narration-seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="Seek section narration" disabled><span class="narration-time mono"></span><details><summary><svg class="transcript-icon transcript-icon-document" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4m-9 5h6m-6 3.5h6"/></svg><span class="narration-transcript-label">Transcript</span></summary><p>${written}</p></details>`
    const chapter = element(section.id)
    chapter.querySelector('.section-intro')!.after(panel)
    panel.querySelector('.narration-transcript-label')!.textContent =
      translate('transcript')
    panel.querySelector('summary')!.title = translate('transcript')
    panel.querySelector('p')!.lang = currentLocale()
    const titles = {
      training: 'narrationTraining',
      search: 'narrationSearch',
      policy: 'narrationPolicy',
      source: 'narrationSource',
    } as const
    const title = translate(titles[section.id as keyof typeof titles])
    const aligned = (italian ? italianTimings : timings).sections.find(
      entry => entry.id === section.id,
    )
    attachPlayer(audio, panel, title, aligned?.duration ?? 0)
    if (aligned) {
      attachWordHighlight(audio, panel, aligned.words)
    }
  }
}

window.addEventListener('guide-locale-change', initializeNarration)
window.addEventListener('pagehide', () => {
  playing?.pause()
})
