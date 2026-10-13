import assert from 'node:assert/strict'
import { test } from 'vitest'
import { review } from '../../../../scripts/repo/review/run.mts'
import { normalizePath } from '../../util/normalize-path.mts'

test('unit review failure stops at the first failing check and offers a unit retry', () => {
  const commands: string[] = []
  const messages: string[] = []
  const result = review(
    script => {
      commands.push(script)
      if (normalizePath(script).endsWith('/review/unit.mts')) {
        throw new Error('unit step failed')
      }
    },
    message => messages.push(message),
  )

  assert.equal(result, 1)
  assert.equal(commands.length, 4)
  assert.ok(messages.some(message => message.includes('pnpm run test:unit')))
  assert.ok(
    messages.some(message =>
      message.includes(
        'Focused suite commands, when shown, are diagnostic only',
      ),
    ),
  )
  assert.ok(
    messages.includes('After resolving the failure, rerun pnpm run review.'),
  )
  assert.equal(
    messages.some(
      message =>
        message === 'Next: pnpm run review to repeat the complete review.',
    ),
    false,
  )
})

test('review still stops at its first failed non-unit check', () => {
  const commands: string[] = []
  const messages: string[] = []
  const result = review(
    script => {
      commands.push(script)
      throw new Error('lint failed')
    },
    message => messages.push(message),
  )

  assert.equal(result, 1)
  assert.equal(commands.length, 1)
  assert.ok(normalizePath(commands[0]!).endsWith('/lint.mts'))
  assert.ok(
    messages.includes('Next: pnpm run review to repeat the complete review.'),
  )
})
