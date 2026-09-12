import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import type { NwsapiEngine } from '../../../../../.config/runtime.d.ts'

const { source, limit } = JSON.parse(readFileSync(0, 'utf8')) as {
  source: string
  limit: number
}
const module = {
  exports: {} as (host: unknown) => NwsapiEngine,
}
vm.runInNewContext(source, {
  module,
  exports: module.exports,
  require: createRequire(import.meta.url),
})
const { window } = new JSDOM('<div popover aria-modal="true"></div>')
try {
  let calls = 0
  window.Element.prototype.matches = function (
    this: Element,
    selector: string,
  ) {
    calls++
    if (limit && calls > limit) {
      throw new Error('Delegation limit reached')
    }
    return engine.match(selector, this)
  } as unknown as Element['matches']
  const engine = module.exports(window)
  const initializationCalls = calls
  const started = performance.now()
  const result = engine.match(':modal', window.document.body.firstElementChild!)
  console.log(
    JSON.stringify({
      initializationCalls,
      calls,
      result,
      queryMs: performance.now() - started,
    }),
  )
} finally {
  window.close()
}
