import { expect, test } from 'vitest'
import { validateNarrationUrl } from '../../../../../scripts/repo/test/voiceover/url.mts'

const valid =
  'http://127.0.0.1:5173/model-guide-reading.html?doc=docs/repo/selector/api.md'

test('accepts only the local API reader page with a valid port', () => {
  expect(validateNarrationUrl(valid).toString()).toBe(valid)
})

test.each([
  'https://127.0.0.1:5173/model-guide-reading.html?doc=docs/repo/selector/api.md',
  'http://localhost:5173/model-guide-reading.html?doc=docs/repo/selector/api.md',
  'http://127.0.0.1:5173/other.html?doc=docs/repo/selector/api.md',
  'http://127.0.0.1:5173/model-guide-reading.html?doc=docs/repo/other.md',
  'http://user@127.0.0.1:5173/model-guide-reading.html?doc=docs/repo/selector/api.md',
  'http://127.0.0.1:65536/model-guide-reading.html?doc=docs/repo/selector/api.md',
])('rejects an unapproved target: %s', value => {
  expect(() => validateNarrationUrl(value)).toThrow()
})
