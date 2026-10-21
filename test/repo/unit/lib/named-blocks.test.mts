import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  extractBlockByTag,
  parseNamedBlocks,
} from '../../../../scripts/lib/named-blocks.mts'

test('named blocks preserve balanced nested content and normalize CRLF', () => {
  const text =
    'outside\r\n<!-- <onboarding> -->\r\nbody\r\n<!-- <repo> -->\r\nnested\r\n<!-- </repo> -->\r\n<!-- </onboarding> -->\r\nend'
  const block = extractBlockByTag(text, 'onboarding')
  assert.ok(block?.includes('body\n<!-- <repo> -->\nnested'))
  assert.ok(!block?.includes('outside'))
  assert.ok(!block?.includes('\r'))
  assert.equal(parseNamedBlocks(text).malformed.length, 0)
})

test('missing, duplicate and malformed named blocks cannot produce a trusted section', () => {
  for (const text of [
    'body',
    '<!-- </onboarding> -->',
    '<!-- <onboarding> -->\nbody',
    '<!-- <onboarding> -->\n<!-- </repo> -->',
    '<!-- <onboarding> -->\na\n<!-- </onboarding> -->\n<!-- <onboarding> -->\nb\n<!-- </onboarding> -->',
  ]) {
    assert.equal(extractBlockByTag(text, 'onboarding'), undefined)
  }
})
