import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import type factory from '../../../src/nwsapi.js'

for (const map of [undefined, {}]) {
  test(`the cache preserves hosts with ${map === undefined ? 'missing' : 'non-callable'} Map`, t => {
    const { window } = new JSDOM('<p class="item"></p>')
    t.onTestFinished(() => window.close())
    const context = {
      module: { exports: {} as typeof factory },
      exports: {},
      Map: map,
    }
    vm.runInNewContext(
      readFileSync(new URL('../../../src/nwsapi.js', import.meta.url), 'utf8'),
      context,
      {
        filename: fileURLToPath(
          new URL('../../../src/nwsapi.js', import.meta.url),
        ),
      },
    )
    const nw = context.module.exports({ document: window.document })
    nw.configure({ LEGACY: true })
    const element = window.document.querySelector('p')
    expect(nw.select('.item')).toEqual([element])
    element.className = 'changed'
    expect(nw.select('.item')).toHaveLength(0)
    expect(nw.match('.changed', element)).toBe(true)
    nw.configure({}, true)
    expect(nw.select('.changed')).toEqual([element])
    const cache = nw.matchLambdas
    cache.clear()
    expect(cache.size()).toBe(0)
    expect(cache.has('__proto__')).toBe(false)
    for (let i = 0; i < 1000; i++) {
      cache.set(String(i), i)
    }
    expect(cache.size()).toBe(1000)
    expect(cache.get('0')).toBe(0)
    cache.set('1', 'updated')
    cache.set('__proto__', 'safe')
    expect(cache.get('2')).toBeUndefined()
    expect(cache.get('0')).toBe(0)
    expect(cache.get('1')).toBe('updated')
    expect(cache.get('__proto__')).toBe('safe')
    expect(cache.size()).toBe(1000)
    cache.clear()
    expect(cache.has('0')).toBe(false)
  })
}
