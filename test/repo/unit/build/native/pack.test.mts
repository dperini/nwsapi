import { expect, test, vi } from 'vitest'
import {
  packNativeLibrary,
  type NativePackOptions,
  type NativePackReceipt,
  type NativeOutputInspector,
  type NativeRun,
} from '../../../../../scripts/repo/build/native/pack.mts'
import { nativeCarrierMatrix } from '../../../../../scripts/repo/build/native/matrix.mts'

const baseOptions: NativePackOptions = {
  root: '/checkout',
  executable: '/tools/abi',
  template: '/templates/darwin-arm64/ffi-stub.node',
  target: 'darwin-arm64',
  library: '/node_modules/libopentui.dylib',
  output: '/cache/opentui.node',
}

function makeReceipt(options: NativePackOptions): NativePackReceipt {
  return {
    input: options.library,
    template: options.template,
    output: options.output,
    target: options.target,
    rawSize: 4096,
    nativeSize: 6144,
    rawSha512: 'a'.repeat(128),
  }
}

test.each(nativeCarrierMatrix)(
  'packages target $target through abi pack-ffi with explicit paths',
  target => {
    const options = {
      ...baseOptions,
      target: target.target,
      template: `/templates/${target.target}/ffi-stub.node`,
    }
    const run = vi.fn<NativeRun>(() => JSON.stringify(makeReceipt(options)))
    const inspectOutput = vi.fn<NativeOutputInspector>(() => ({
      size: 6144,
      regularFile: true,
    }))

    const receipt = packNativeLibrary(options, run, inspectOutput)

    expect(receipt).toEqual(makeReceipt(options))
    expect(run).toHaveBeenCalledWith(
      '/tools/abi',
      [
        'pack-ffi',
        options.library,
        '--target',
        target.target,
        '--template',
        options.template,
        '--out',
        options.output,
      ],
      '/checkout',
    )
    expect(inspectOutput).toHaveBeenCalledWith(options.output)
  },
)

test('rejects a target outside the canonical native matrix before running', () => {
  const run = vi.fn<NativeRun>(() => '')

  expect(() =>
    packNativeLibrary({ ...baseOptions, target: 'darwin-riscv64' }, run),
  ).toThrow('Unsupported OpenTUI native target')
  expect(run).not.toHaveBeenCalled()
})

test('rejects invalid JSON or a receipt for different input paths', () => {
  const invalidJson = vi.fn<NativeRun>(() => 'success')
  expect(() => packNativeLibrary(baseOptions, invalidJson)).toThrow(
    'invalid JSON receipt',
  )

  const differentTarget = vi.fn<NativeRun>(() =>
    JSON.stringify({ ...makeReceipt(baseOptions), target: 'darwin-x64' }),
  )
  expect(() => packNativeLibrary(baseOptions, differentTarget)).toThrow(
    'does not match the requested inputs',
  )
})

test('rejects incomplete digest and size data from the pack receipt', () => {
  const run = vi.fn<NativeRun>(() =>
    JSON.stringify({ ...makeReceipt(baseOptions), rawSha512: 'abc' }),
  )

  expect(() => packNativeLibrary(baseOptions, run)).toThrow(
    'invalid size or SHA-512',
  )
})

test('rejects a missing output or output size that differs from the receipt', () => {
  const run = vi.fn<NativeRun>(() => JSON.stringify(makeReceipt(baseOptions)))
  const missingOutput = vi.fn<NativeOutputInspector>(() => ({
    size: 0,
    regularFile: false,
  }))

  expect(() => packNativeLibrary(baseOptions, run, missingOutput)).toThrow(
    'output is missing or disagrees',
  )

  const wrongSize = vi.fn<NativeOutputInspector>(() => ({
    size: 17,
    regularFile: true,
  }))
  expect(() => packNativeLibrary(baseOptions, run, wrongSize)).toThrow(
    'output is missing or disagrees',
  )
})
