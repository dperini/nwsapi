// Visitors: little Animorphs-style transformations of the wizard mascot.
export const VISITORS = [
  '🐸',
  '🐉',
  '🦋',
  '🐶',
  '🦊',
  '🦉',
  '🐢',
  '🦎',
  '🐙',
  '🐈',
  '🦄',
] as const
export const EFFECTS = ['✨', '⚡', '☁️', '💫'] as const

export function wizardAnimationsEnabled(
  value = process.env['NWSAPI_WIZARD_ANIMATIONS'],
) {
  switch (value?.trim().toLowerCase()) {
    case '0':
    case 'no':
    case 'n':
    case 'false':
      return false
    case '1':
    case 'yes':
    case 'y':
    case 'true':
      return true
    default:
      return true
  }
}

export function pick<T>(values: readonly T[], random: () => number) {
  return values[
    Math.min(values.length - 1, Math.floor(random() * values.length))
  ]!
}

export function chooseVisitor(previous?: string, random = Math.random) {
  return pick(
    VISITORS.filter(value => value !== previous),
    random,
  )
}

export function chooseTransformationEffect(random = Math.random) {
  return pick(EFFECTS, random)
}

export function nextVisitorDelay(random = Math.random) {
  return 18_000 + Math.floor(random() * 77_000)
}

// Only the two-cell header mascot changes; commands and focus stay untouched.
export function startWizardMascot(
  show: (mascot: string) => void,
  random = Math.random,
) {
  if (!wizardAnimationsEnabled()) {
    return () => {}
  }
  let stopped = false
  let previous: string | undefined
  let timer: ReturnType<typeof setTimeout>
  const between = (min: number, max: number) =>
    min + Math.floor(random() * (max - min))
  function after(delay: number, action: () => void) {
    timer = setTimeout(() => {
      if (!stopped) {
        action()
      }
    }, delay)
    timer.unref?.()
  }
  function schedule() {
    after(nextVisitorDelay(random), () => {
      const visitor = chooseVisitor(previous, random)
      previous = visitor
      const effect = chooseTransformationEffect(random)
      show(effect)
      after(between(350, 750), () => {
        show(visitor)
        after(between(1000, 1800), () => {
          show(effect)
          after(between(350, 750), () => {
            show('🧙')
            schedule()
          })
        })
      })
    })
  }
  schedule()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
