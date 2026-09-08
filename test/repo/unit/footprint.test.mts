import { expect, test } from 'vitest'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { fileSizes } from '../../../scripts/repo/bench/filesize.mts'
import {
  median,
  positiveInteger,
  summarize,
} from '../../../scripts/repo/bench/footprint-shared.mts'
import { fuzzInvocation } from '../../../scripts/repo/fuzz.mts'

test('memory summaries retain noise and compute even-sample medians without changing samples', () => {
  const values = [9, -2, 5, 1]
  expect(summarize(values)).toEqual({
    median: 3,
    min: -2,
    max: 9,
    samples: values,
  })
  expect(values).toEqual([9, -2, 5, 1])
  expect(() => median([])).toThrow()
  expect(() => median([NaN])).toThrow()
})

test('measurement limits reject partial numbers and unbounded work', () => {
  for (const value of ['1junk', '1.5', '0', '-1', 'Infinity', '10001']) {
    expect(() => positiveInteger(value, 'rounds')).toThrow()
  }
  expect(positiveInteger('40', 'count')).toBe(40)
})

test('size reports count UTF-8 bytes and the exact compressed payload', () => {
  const source = 'const text = "😀";'.repeat(20)
  const sizes = fileSizes(source)
  expect(sizes.bytes).toBe(Buffer.byteLength(source))
  expect(sizes.bytes).toBeGreaterThan(source.length)
  expect(sizes.gzip).toBe(gzipSync(source, { level: 9 }).length)
  expect(sizes.brotli).toBe(
    brotliCompressSync(source, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  )
  expect(sizes.sha256).toHaveLength(64)
})

test('replay cannot inherit a live fuzzing, merge, or optimization mode', () => {
  const env = {
    VITIATE_FUZZ: '1',
    VITIATE_OPTIMIZE: '1',
    VITIATE_CLI_IPC: '{"merge":true}',
    VITIATE_SUPERVISOR: '1',
    VITIATE_SHMEM: 'shmem',
    PATH: '/bin',
  }
  const invocation = fuzzInvocation(['--replay', 'selectors.fuzz.mts'], env)
  expect(invocation.env).toEqual({ PATH: '/bin', VITIATE_FUZZ: '0' })
  expect(invocation.args).toEqual([
    'node_modules/vitest/vitest.mjs',
    'run',
    'selectors.fuzz.mts',
  ])
  expect(env.VITIATE_FUZZ).toBe('1')
  expect(fuzzInvocation([], { VITIATE_FUZZ: '0' }).env['VITIATE_FUZZ']).toBe(
    '1',
  )
})
