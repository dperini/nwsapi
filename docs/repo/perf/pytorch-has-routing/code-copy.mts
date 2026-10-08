import { iconMarkup } from './icons.mts'

const controls = new WeakMap<HTMLElement, HTMLButtonElement>()

function connectCopy(
  button: HTMLButtonElement,
  status: HTMLElement,
  code: HTMLElement,
) {
  let reset: ReturnType<typeof setTimeout> | undefined
  button.addEventListener('click', async () => {
    clearTimeout(reset)
    try {
      await navigator.clipboard.writeText(code.textContent ?? '')
      button.innerHTML = iconMarkup('check')
      button.setAttribute('aria-label', 'Code copied')
      status.textContent = 'Copied'
    } catch {
      status.textContent = 'Select the code to copy it manually.'
    }
    reset = setTimeout(() => {
      button.innerHTML = iconMarkup('copy')
      button.setAttribute('aria-label', 'Copy code')
      status.textContent = ''
    }, 2400)
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
