import { expect, test, vi } from 'vitest'
import { checkUnicodeEs5 } from '../../../../scripts/repo/unicode-es5/check.mts'
import type * as NodeRunner from '../../../../scripts/repo/lib/run-node.mts'

const state = vi.hoisted(() => ({ main: false }))
vi.mock('../../../../scripts/repo/lib/run-node.mts', async importOriginal => ({
  ...(await importOriginal<typeof NodeRunner>()),
  isMainModule: (url: string) =>
    state.main && url.endsWith('/unicode-es5/check.mts'),
}))

test('the Unicode checker can execute as a direct repository command', async () => {
  state.main = true
  try {
    vi.resetModules()
    await import('../../../../scripts/repo/unicode-es5/check.mts')
  } finally {
    state.main = false
  }
})

test('the Unicode tables imported by direction matching support ES5', () => {
  expect(() => checkUnicodeEs5()).not.toThrow()
})

test('ES5 escapes, surrogate pairs, and lookaheads remain valid', () => {
  expect(() =>
    checkUnicodeEs5({
      bmp: /[\x41-\x5A\u0590-\u05FF]/,
      supplementary: /(?:\uD83D[\uDE00-\uDE4F])(?!\uDC00)/,
      literalEscapes: /\\u\{1F600\}|\\p\{Letter\}|\\P\{Letter\}|\\k<name>/,
    }),
  ).not.toThrow()
})

test.each(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'])(
  'shared Unicode tables reject the %s flag',
  flag => {
    expect(() => checkUnicodeEs5({ changed: new RegExp('a', flag) })).toThrow(
      'Unicode pattern "changed" must have no flags',
    )
  },
)

test.each([
  String.raw`\P{Letter}`,
  String.raw`\k<name>`,
  String.raw`\p{Letter}`,
  String.raw`\u{1F600}`,
  String.raw`\\\u{1F600}`,
])('modern escapes fail even without Unicode flags: %s', source => {
  expect(() => checkUnicodeEs5({ changed: new RegExp(source) })).toThrow(
    'Unicode pattern "changed" must not use modern regex escapes',
  )
})

test.each([/(?<!a)b/, /(?<=a)b/, /(?<letter>a)/])(
  'the ES5 parser rejects modern group syntax: %s',
  changed => {
    expect(() => checkUnicodeEs5({ changed })).toThrow(
      'Unicode pattern "changed" must use ES5 regular expression syntax',
    )
  },
)
