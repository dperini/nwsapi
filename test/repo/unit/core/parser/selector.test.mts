import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import factory from '../../../../../dist/nwsapi.js'

test('issue 260 rejects empty groups in a top-level selector list', t => {
  const { window } = new JSDOM(
    '<!doctype html><head><title></title></head><body><script></script></body>',
  )
  t.onTestFinished(() => window.close())
  const engine = factory(window)
  engine.configure({ VERBOSITY: false, LOGERRORS: false })

  for (const selector of [',head script', 'head,,script', 'head script,']) {
    expect(engine.select(selector, window.document), selector).toEqual([])
  }
  expect(engine.select(':is(head,script)', window.document)).toHaveLength(2)
})
