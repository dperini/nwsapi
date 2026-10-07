import assert from 'node:assert/strict'
import { parse } from 'css-tree'
import { test } from 'vitest'
import defaults, { presets } from '../../../../scripts/repo/bench/presets.mts'

test('legacy benchmark presets remain valid selector lists across every named group', () => {
  assert.equal(defaults, presets)
  const groups = Object.values(presets)
  assert.ok(groups.length > 1)
  for (let index = 0, length = groups.length; index < length; index += 1) {
    const selectors = groups[index]!
    assert.ok(selectors.length > 0)
    for (
      let position = 0, size = selectors.length;
      position < size;
      position += 1
    ) {
      assert.equal(
        parse(selectors[position]!, { context: 'selectorList' }).type,
        'SelectorList',
      )
    }
  }
})
