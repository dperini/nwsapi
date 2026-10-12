interface SearchControls {
  input: HTMLInputElement
  clear: HTMLButtonElement
  undo: HTMLButtonElement
  setClearDisabled: (disabled: boolean) => void
  update: () => void
  cancelAnnouncement: () => void
}

export function connectSearchInput(controls: SearchControls) {
  let composing = false
  let previous: string | undefined
  let lastValue = controls.input.value
  const resetUndo = () => {
    previous = undefined
    controls.undo.hidden = true
  }
  const changed = () => {
    controls.setClearDisabled(controls.input.value.length === 0)
    if (composing || controls.input.value === lastValue) {
      return
    }
    lastValue = controls.input.value
    resetUndo()
    controls.update()
  }
  controls.input.addEventListener('compositionstart', () => {
    composing = true
    controls.cancelAnnouncement()
  })
  controls.input.addEventListener('compositionend', () => {
    composing = false
    if (controls.input.value === lastValue) {
      controls.update()
      return
    }
    changed()
  })
  controls.input.addEventListener('input', changed)
  controls.clear.addEventListener('click', () => {
    if (composing || !controls.input.value) {
      return
    }
    previous = controls.input.value
    controls.input.value = lastValue = ''
    controls.undo.hidden = false
    controls.setClearDisabled(true)
    controls.update()
    controls.input.focus()
  })
  controls.undo.addEventListener('click', () => {
    if (previous === undefined || composing) {
      return
    }
    controls.input.value = lastValue = previous
    resetUndo()
    controls.setClearDisabled(false)
    controls.update()
    controls.input.focus()
  })
  return {
    isComposing: () => composing,
    reset() {
      composing = false
      lastValue = controls.input.value
      resetUndo()
    },
  }
}

export function settledAnnouncement(target: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => clearTimeout(timer)
  return {
    cancel,
    update(message: string) {
      cancel()
      timer = setTimeout(() => {
        if (target.textContent !== message) {
          target.textContent = message
        }
      }, 200)
    },
  }
}
