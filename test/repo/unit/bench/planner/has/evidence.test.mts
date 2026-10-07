import assert from 'node:assert/strict'
import { compileFunction } from 'node:vm'
import { JSDOM } from 'jsdom'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({ closed: vi.fn() }))
vi.mock('../../../../../../scripts/repo/browser.mts', () => ({
  browserLaunchOptions: () => ({ executablePath: '/fixture/chrome' }),
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => {
      const dom = new JSDOM('<body></body>')
      vi.stubGlobal('document', dom.window.document)
      vi.stubGlobal('probeFactories', [])
      return {
        close: async () => {
          state.closed()
          dom.window.close()
        },
        newPage: async () => ({
          addScriptTag: async ({ content }: { content: string }) => {
            compileFunction(content, ['globalThis'])(globalThis)
          },
          evaluate: async (fn: (value: unknown) => unknown, value: unknown) =>
            fn(value),
        }),
      }
    },
  },
}))
import { browserEvidence } from '../../../../../../scripts/repo/bench/planner/has/evidence.mts'
const source =
  'let calls=0;function factory(){return{select:(selector,document)=>{calls+=1;return Array.from(document.querySelectorAll(selector))}}}factory.resetTrace=()=>{calls=0};factory.trace=()=>({entries:0,inverse:0,forward:0,resolver:0,empty:0,decisions:0,facts:null,features:null,route:"ineligible",calls});module.exports=factory;'
const entry = {
  id: 'fixture',
  family: 'fixture',
  split: 'train' as const,
  html: '<main><i></i><i></i></main>',
  selector: 'i',
  tags: [],
}

test('browser route evidence warms isolated frames and removes them after identity checks', async () => {
  try {
    const verify = vi.fn()
    const result = await browserEvidence(
      [entry],
      [source, source, source],
      verify,
      2,
    )
    assert.equal(result.length, 1)
    assert.equal(result[0]!.traces.length, 3)
    assert.equal(
      (result[0]!.traces[0] as unknown as { calls: number }).calls,
      1,
    )
    assert.equal(verify.mock.calls.length, 1)
    assert.equal(document.querySelectorAll('iframe').length, 0)
    const defaults = await browserEvidence([entry], [source, source, source])
    assert.equal(defaults[0]!.id, 'fixture')
    const bad = [
      'module.exports=()=>({select:()=>[]});',
      'module.exports=()=>({select:(s,d)=>Array.from(d.querySelectorAll(s),node=>node.cloneNode())});',
    ]
    for (let index = 0, length = bad.length; index < length; index += 1) {
      await assert.rejects(browserEvidence([entry], [bad[index]!], () => {}, 0))
      assert.equal(document.querySelectorAll('iframe').length, 0)
    }
    await assert.rejects(
      browserEvidence([entry], [source], () => {
        throw Object.assign(new Error('verify'), { code: 'VERIFY_FAILED' })
      }),
      { code: 'VERIFY_FAILED' },
    )
    assert.equal(state.closed.mock.calls.length, 5)
  } finally {
    vi.unstubAllGlobals()
  }
})
