import assert from 'node:assert/strict'
import { test } from 'node:test'
import { choosePlain, returnToMenu } from '../../../scripts/develop/plain.mts'

function answers(values) {
  let index = 0
  return async () => {
    if (index >= values.length) {
      throw new Error('Unexpected prompt')
    }
    return values[index++]
  }
}

async function withoutConsoleOutput(action) {
  const originalLog = console.log
  console.log = () => {}
  try {
    return await action()
  } finally {
    console.log = originalLog
  }
}

test('preview confirms the chosen task after rejecting invalid confirmation input', async () => {
  await withoutConsoleOutput(async () => {
    const state = { selected: 0, result: '' }
    const ask = answers(['3', 'typo', ''])

    assert.equal(await choosePlain(state, ask), 2)
    assert.equal(state.selected, 2)
  })
})

test('back returns to selection and permits a different task', async () => {
  await withoutConsoleOutput(async () => {
    const state = { selected: 0, result: '' }
    const ask = answers(['1', 'b', '4', ''])

    assert.equal(await choosePlain(state, ask), 3)
    assert.equal(state.selected, 3)
  })
})

test('invalid menu formats are rejected and quit exits without selecting', async () => {
  await withoutConsoleOutput(async () => {
    const state = { selected: 0, result: '' }
    const ask = answers(['1e0', '0x1', '', '2', 'Q'])

    assert.equal(await choosePlain(state, ask), undefined)
    assert.equal(state.selected, 1)
  })
})

test('return prompt retries invalid input and supports return or quit', async () => {
  await withoutConsoleOutput(async () => {
    assert.equal(await returnToMenu(answers(['typo', ''])), true)
    assert.equal(await returnToMenu(answers(['q'])), false)
  })
})
