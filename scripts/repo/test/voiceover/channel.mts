import type { Writable } from 'node:stream'

export function createWorkerChannel(
  input: Writable,
  isAlive: () => boolean,
  fail: (error: Error) => void,
) {
  let failed = false
  const onError = (cause: unknown) => {
    if (failed) {
      return
    }
    failed = true
    fail(cause instanceof Error ? cause : new Error(String(cause)))
  }
  // Keep the listener installed for late pipe errors during shutdown.
  input.on('error', onError)
  return (command: string) => {
    if (failed) {
      return
    }
    if (!isAlive() || input.destroyed || input.writableEnded) {
      onError(new Error('The narration worker input closed.'))
      return
    }
    try {
      input.write(`${command}\n`, error => {
        if (error) {
          onError(error)
        }
      })
    } catch (error) {
      onError(error)
    }
  }
}
