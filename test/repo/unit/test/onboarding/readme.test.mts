import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseJourney } from '../../../../../scripts/test/onboarding/readme.mts'

test('marked README commands reject missing and duplicate IDs', () => {
  const step =
    '<!-- onboarding:bootstrap:start -->\n```sh\nnode scripts/setup.mjs\n```\n<!-- onboarding:bootstrap:end -->'
  assert.deepEqual(parseJourney(step), [
    { id: 'bootstrap', command: ['node', 'scripts/setup.mjs'] },
  ])
  assert.throws(() => parseJourney('none'), /no marked/)
  assert.throws(() => parseJourney(step + '\n' + step), /unique/)
})
