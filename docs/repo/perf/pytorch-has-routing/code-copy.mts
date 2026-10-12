import { iconMarkup } from './icons.mts'

const controls = new WeakMap<HTMLElement, HTMLButtonElement>()

function connectCopy(
  button: HTMLButtonElement,
  status: HTMLElement,
  code: HTMLElement,
) {
  let reset: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  let inFlight = false
  const toolbar = button.parentElement!
  const restoreVisual = () => {
    button.innerHTML = iconMarkup('copy')
    button.setAttribute('aria-label', 'Copy code')
    button.title = 'Copy code'
    delete toolbar.dataset['copyState']
  }
  const copy = async () => {
    if (inFlight) {
      return
    }
    inFlight = true
    const currentAttempt = ++attempt
    clearTimeout(reset)
    restoreVisual()
    status.replaceChildren()
    button.disabled = true
    try {
      await navigator.clipboard.writeText(code.textContent ?? '')
      if (currentAttempt !== attempt) {
        return
      }
      button.innerHTML = iconMarkup('check')
      button.setAttribute('aria-label', 'Code copied')
      button.title = 'Code copied'
      status.textContent = 'Copied'
      toolbar.dataset['copyState'] = 'copied'
    } catch {
      if (currentAttempt === attempt) {
        status.textContent = 'Select the code to copy it manually.'
      }
    } finally {
      inFlight = false
      button.disabled = !code.textContent
    }
    if (currentAttempt === attempt) {
      if (toolbar.dataset['copyState'] === 'copied') {
        reset = setTimeout(restoreVisual, 400)
      }
    }
  }
  button.addEventListener('click', () => {
    void copy()
  })
}

export function attachCodeCopy(code: HTMLElement) {
  const existing = controls.get(code)
  if (existing) {
    existing.disabled = !code.textContent
    return
  }
  const sample = document.createElement('div')
  sample.className = 'code-sample'
  const toolbar = document.createElement('div')
  toolbar.className = 'code-toolbar'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'code-copy'
  button.title = 'Copy code'
  button.setAttribute('aria-label', 'Copy code')
  button.disabled = !code.textContent
  button.innerHTML = iconMarkup('copy')
  const status = document.createElement('span')
  status.className = 'code-copy-status'
  status.setAttribute('role', 'status')
  code.before(sample)
  toolbar.append(status, button)
  sample.append(toolbar, code)
  controls.set(code, button)
  connectCopy(button, status, code)
}
