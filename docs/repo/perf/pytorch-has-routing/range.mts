export function syncRangePulse(control: HTMLInputElement) {
  const wrapper = control.closest<HTMLElement>('.range-control')
  if (!wrapper) {
    return
  }
  const minimum = Number(control.min || 0)
  const maximum = Number(control.max || 100)
  const progress =
    maximum > minimum
      ? Math.max(
          0,
          Math.min(1, (control.valueAsNumber - minimum) / (maximum - minimum)),
        )
      : 0
  wrapper.style.setProperty('--range-position', String(progress))
}

export function initializeRangePulses() {
  const controls = document.querySelectorAll<HTMLInputElement>(
    'input[type="range"]:not(.narration-seek)',
  )
  for (let i = 0, length = controls.length; i < length; i += 1) {
    const control = controls[i]!
    const wrapper = document.createElement('span')
    wrapper.className = 'range-control'
    const pulse = document.createElement('span')
    pulse.className = 'range-pulse'
    pulse.setAttribute('aria-hidden', 'true')
    control.before(wrapper)
    wrapper.append(control, pulse)
    control.addEventListener('input', () => syncRangePulse(control))
    control.addEventListener('change', () => syncRangePulse(control))
    syncRangePulse(control)
  }
  document.addEventListener('guide-controls-sync', () => {
    for (let i = 0, length = controls.length; i < length; i += 1) {
      syncRangePulse(controls[i]!)
    }
  })
}
