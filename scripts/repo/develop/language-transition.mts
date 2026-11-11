import { createSignal, onCleanup } from 'solid-js/dist/solid.js'
import { flipboardText, FLIP_TOTAL_DURATION } from './flipboard.mts'
import { wizardAnimationsEnabled } from './mascot.mts'
import type { WizardLanguage } from './language.mts'

export function createLanguageTransition() {
  const [elapsed, setElapsed] = createSignal(FLIP_TOTAL_DURATION)
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }
  const finish = () => {
    stop()
    setElapsed(FLIP_TOTAL_DURATION)
  }
  onCleanup(stop)
  return {
    finish,
    begin() {
      stop()
      if (!wizardAnimationsEnabled()) {
        finish()
        return
      }
      const started = performance.now()
      setElapsed(0)
      timer = setInterval(() => {
        const value = performance.now() - started
        if (value >= FLIP_TOTAL_DURATION) {
          finish()
        } else {
          setElapsed(value)
        }
      }, 32)
      timer.unref?.()
    },
    bind(row: number) {
      let language: WizardLanguage | undefined
      let target = ''
      let rendered = ''
      let before: string | undefined
      return (text: string, next: WizardLanguage) => {
        if (language !== undefined && language !== next) {
          before = rendered
        } else if (text !== target) {
          before = undefined
        }
        language = next
        target = text
        rendered =
          before === undefined
            ? text
            : flipboardText(before, text, elapsed(), row)
        return rendered
      }
    },
  }
}
