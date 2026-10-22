import { expect, test } from 'vitest'
import { parse } from '../../../../../docs/repo/perf/pytorch-has-routing/highlight-tokens.mts'

test.each([
  ['typescript', 'const café: string = "😀 <script>"\r\n\r\n// 12µs\r\n'],
  ['python', 'def hello():\n    return "ciao 🌍"\n'],
  ['shell', '# Build\npnpm run build\n'],
  ['unknown-language', '<script>alert("text")</script>\rnext\n'],
  ['javascript', ''],
])('preserves every source character for %s', (language, source) => {
  const spans = parse(source, language)
  let cursor = 0
  for (const span of spans) {
    expect(span.start).toBe(cursor)
    expect(span.end).toBeGreaterThan(span.start)
    cursor = span.end
  }
  expect(cursor).toBe(source.length)
  expect(spans.map(span => source.slice(span.start, span.end)).join('')).toBe(
    source,
  )
})

test.each([
  ['typescript', 'const answer: number = 42', 'const'],
  ['python', 'def hello():\n    return 42', 'def'],
  ['shell', '# Build\npnpm run build', '# Build'],
])('uses the %s lexer without WebGPU', (language, source, text) => {
  const spans = parse(source, language)
  expect(
    spans.some(
      span =>
        span.type !== 'plain' &&
        source.slice(span.start, span.end).includes(text),
    ),
  ).toBe(true)
})

test('unknown languages stay plain', () => {
  expect(
    parse('const answer = 42', 'unsupported').every(
      span => span.type === 'plain',
    ),
  ).toBe(true)
})
