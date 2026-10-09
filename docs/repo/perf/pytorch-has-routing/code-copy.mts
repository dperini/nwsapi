import { iconMarkup } from './icons.mts'

const controls = new WeakMap<HTMLElement, HTMLButtonElement>()

function connectCopy(
  button: HTMLButtonElement,
  status: HTMLElement,
  code: HTMLElement,
) {
  let reset: ReturnType<typeof setTimeout> | undefined
  const toolbar = button.parentElement!
  const restore = () => {
    button.innerHTML = iconMarkup('copy')
    button.setAttribute('aria-label', 'Copy code')
    button.title = 'Copy code'
    status.replaceChildren()
    delete toolbar.dataset['copyState']
  }
  const copy = async () => {
    clearTimeout(reset)
    restore()
    try {
      await navigator.clipboard.writeText(code.textContent ?? '')
      button.innerHTML = iconMarkup('check')
      button.setAttribute('aria-label', 'Code copied')
      button.title = 'Code copied'
      const message = document.createElement('span')
      message.className = 'code-copy-message'
      message.textContent = 'Copied'
      status.replaceChildren(message)
      toolbar.dataset['copyState'] = 'copied'
    } catch {
      status.textContent = 'Select the code to copy it manually.'
    }
    reset = setTimeout(restore, 2400)
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
