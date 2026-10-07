import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import {
  DOCUMENTS,
  atomic,
  components,
  documentation,
} from '../../../../scripts/repo/bench/documents.mts'

test('benchmark document families contain representative selectors and component relationships', () => {
  assert.deepEqual(Object.keys(DOCUMENTS), [
    'documentation',
    'atomic',
    'components',
  ])
  const atomicDom = new JSDOM(atomic())
  const componentDom = new JSDOM(components())
  const documentationDom = new JSDOM(documentation())
  try {
    assert.equal(
      atomicDom.window.document.querySelectorAll('.card').length,
      400,
    )
    assert.equal(
      atomicDom.window.document.querySelectorAll('.sidebar .menu').length,
      30,
    )
    assert.equal(
      componentDom.window.document.querySelectorAll('button[aria-label]')
        .length,
      300,
    )
    assert.equal(
      componentDom.window.document.querySelectorAll('label').length,
      300,
    )
    assert.equal(
      componentDom.window.document.querySelector('label')!.control!.id,
      'in-0',
    )
    assert.ok(
      documentationDom.window.document.querySelectorAll('*').length > 100,
    )
    assert.equal(DOCUMENTS.atomic.html, atomic)
    assert.equal(DOCUMENTS.components.html, components)
    assert.equal(DOCUMENTS.documentation.html, documentation)
  } finally {
    atomicDom.window.close()
    componentDom.window.close()
    documentationDom.window.close()
  }
})
