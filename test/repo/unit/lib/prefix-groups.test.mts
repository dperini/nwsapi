import { describe, expect, test } from 'vitest'

import { findFilenamePrefixGroups } from '../../../../scripts/repo/lib/prefix-groups.mts'

describe('findFilenamePrefixGroups', () => {
  test('finds three related sibling modules', () => {
    const groups = findFilenamePrefixGroups([
      'src/core/compile-class.mts',
      'src/core/compile-id.mts',
      'src/core/compile-token.mts',
    ])

    expect(groups).toEqual([
      expect.objectContaining({
        prefix: 'compile',
        modules: ['compile-class', 'compile-id', 'compile-token'],
        suggestedDirectory: 'src/core/compile',
      }),
    ])
  })

  test('prefers the more specific shared prefix', () => {
    const groups = findFilenamePrefixGroups([
      'src/core/compile-position-dense.mts',
      'src/core/compile-position-match.mts',
      'src/core/compile-position-route.mts',
    ])

    expect(groups.map(group => group.suggestedDirectory)).toEqual([
      'src/core/compile-position',
    ])
  })

  test('requires at least three logical modules', () => {
    expect(
      findFilenamePrefixGroups([
        'src/core/has-candidates.mts',
        'src/core/has-slotted.mts',
      ]),
    ).toEqual([])
  })

  test('groups a base module with its prefixed helper', () => {
    expect(
      findFilenamePrefixGroups([
        'src/core/match/language.mts',
        'src/core/match/language-parent.mts',
      ]),
    ).toEqual([
      expect.objectContaining({
        modules: ['language', 'language-parent'],
        suggestedDirectory: 'src/core/match/language',
      }),
    ])
  })

  test('counts a declaration and implementation as one module', () => {
    expect(
      findFilenamePrefixGroups([
        'src/core/query-state.d.ts',
        'src/core/query-state.mts',
        'src/core/query-cache.mts',
      ]),
    ).toEqual([])
  })

  test('reports target collisions', () => {
    const groups = findFilenamePrefixGroups([
      'src/core/state-create.mts',
      'src/core/state-query.mts',
      'src/core/state-runtime.mts',
      'src/core/state',
    ])

    expect(groups[0]?.collisions).toEqual(['src/core/state'])
  })
})
