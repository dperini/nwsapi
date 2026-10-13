import { expect, test } from 'vitest'
import {
  findBlocksByTag,
  parseNamedBlocks,
  scanMarkers,
} from '../../../../scripts/repo/lib/named-blocks.mts'

test('extracts balanced nested tags with line positions and case-insensitive names', () => {
  const text =
    '<!-- <repo> -->\r\ncontent\r\n<!-- <ONBOARDING> -->\r\nsetup\r\n<!-- </onboarding> -->\r\n<!-- </repo> -->'
  const blocks = findBlocksByTag(text, 'onboarding')
  expect(blocks).toEqual([
    { tag: 'onboarding', beginLine: 2, endLine: 4, depth: 1, children: [] },
  ])
  expect(parseNamedBlocks(text).wellFormed).toBe(true)
})

test.each([
  ['<!-- <repo> -->\n<!-- </onboarding> -->', 'mismatch'],
  ['<!-- </onboarding> -->', 'orphan-end'],
  ['<!-- <onboarding> -->', 'unclosed'],
] as const)(
  'reports malformed blocks without extracting a partial region',
  (text, kind) => {
    expect(
      parseNamedBlocks(text).malformed.some(item => item.kind === kind),
    ).toBe(true)
    expect(findBlocksByTag(text, 'onboarding')).toEqual([])
  },
)

test('recognizes comment styles and ignores prose mentions', () => {
  expect(scanMarkers('Mention <!-- <onboarding> --> here.')).toEqual([])
  expect(
    findBlocksByTag(
      '# <fleet>\ntext\n# </fleet>\n// <repo>\ntext\n// </repo>',
      'repo',
    ),
  ).toHaveLength(1)
})
