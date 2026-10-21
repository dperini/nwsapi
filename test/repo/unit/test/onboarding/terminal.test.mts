import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PlainSetupProtocol } from '../../../../../scripts/test/onboarding/terminal.mts'

test('plain setup requires a preview and confirmation before marking completion', () => {
  const protocol = new PlainSetupProtocol()
  assert.equal(protocol.accept('Preview a task:'), 'select-setup')
  assert.equal(protocol.confirmationSent, false)
  assert.equal(
    protocol.accept(
      'Set up this checkout\nCommand: node scripts/setup.mjs\nEnter to run, b to go back, or q to quit:',
    ),
    'confirm-setup',
  )
  protocol.markConfirmationSent()
  assert.equal(
    protocol.accept(
      'Done. Next: node scripts/develop/run.mts\nEnter to return to the menu, or q to quit:',
    ),
    'quit',
  )
  assert.equal(protocol.setupCompleted, true)
  assert.equal(protocol.previewObserved, true)
})
