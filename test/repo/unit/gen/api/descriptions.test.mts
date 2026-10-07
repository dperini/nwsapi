import { expect, test } from 'vitest'
import { walk } from '../../../../../scripts/repo/gen/api/descriptions.mts'

test('walk ignores primitive inputs and visits nested object and array nodes', () => {
  expect([...walk(null)]).toEqual([])
  expect([...walk('text')]).toEqual([])
  const child = { type: 'Identifier', name: 'x' }
  const parent = {
    type: 'Program',
    body: [child, null],
    other: { nested: { type: 'Literal', value: 1 } },
  }
  expect([...walk(parent)].map(node => node.type)).toEqual([
    'Program',
    'Identifier',
    'Literal',
  ])
})
