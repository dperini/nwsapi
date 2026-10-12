import { PassThrough } from 'node:stream'
import { expect, test, vi } from 'vitest'
import { createWorkerChannel } from '../../../../../scripts/repo/test/voiceover/channel.mts'

test('writes a command to an owned live worker input', () => {
  const input = new PassThrough()
  const fail = vi.fn()
  const send = createWorkerChannel(input, () => true, fail)
  send('GO:fixture')
  expect(input.read().toString()).toBe('GO:fixture\n')
  expect(fail).not.toHaveBeenCalled()
  input.destroy()
})

test('a mocked broken pipe requests cleanup once and suppresses later sends', () => {
  const input = new PassThrough()
  const fail = vi.fn()
  const send = createWorkerChannel(input, () => true, fail)
  const error = Object.assign(new Error('fixture pipe failure'), {
    code: 'EPIPE',
  })
  expect(() => input.emit('error', error)).not.toThrow()
  expect(() => input.emit('error', error)).not.toThrow()
  send('START:fixture')
  expect(input.read()).toBeNull()
  expect(fail).toHaveBeenCalledExactlyOnceWith(error)
  input.destroy()
})

test('closed workers are never sent a start command', () => {
  const input = new PassThrough()
  const fail = vi.fn()
  createWorkerChannel(input, () => false, fail)('START:fixture')
  expect(input.read()).toBeNull()
  expect(fail).toHaveBeenCalledOnce()
  input.destroy()
})

test('a synchronous stream write failure follows the same cleanup path', () => {
  const input = new PassThrough()
  const fail = vi.fn()
  vi.spyOn(input, 'write').mockImplementation(() => {
    throw new Error('fixture write failure')
  })
  expect(() =>
    createWorkerChannel(input, () => true, fail)('GO:fixture'),
  ).not.toThrow()
  expect(fail).toHaveBeenCalledOnce()
  input.destroy()
})
