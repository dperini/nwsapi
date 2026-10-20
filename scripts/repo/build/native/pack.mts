import { lstatSync } from 'node:fs'
import { nativeTarget } from './matrix.mts'

export type NativeRun = (
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
) => string

export type NativePackReceipt = {
  input: string
  template: string
  output: string
  target: string
  rawSize: number
  nativeSize: number
  rawSha512: string
}

export type NativePackOptions = {
  root: string
  executable: string
  template: string
  target: string
  library: string
  output: string
}

export type NativeOutputInfo = {
  size: number
  regularFile: boolean
}

export type NativeOutputInspector = (filename: string) => NativeOutputInfo

export function packNativeLibrary(
  options: NativePackOptions,
  run: NativeRun,
  inspectOutput: NativeOutputInspector = inspectNativeOutput,
): NativePackReceipt {
  nativeTarget(options.target)
  const stdout = run(
    options.executable,
    [
      'pack-ffi',
      options.library,
      '--target',
      options.target,
      '--template',
      options.template,
      '--out',
      options.output,
    ],
    options.root,
  )
  let receipt: unknown
  try {
    receipt = JSON.parse(stdout)
  } catch {
    throw new Error('abi pack-ffi returned an invalid JSON receipt.')
  }
  validateReceipt(receipt, options)
  const output = inspectOutput(options.output)
  if (!output.regularFile || output.size !== receipt['nativeSize']) {
    throw new Error(
      'abi pack-ffi output is missing or disagrees with its receipt.',
    )
  }
  return receipt
}

export function inspectNativeOutput(filename: string): NativeOutputInfo {
  try {
    const metadata = lstatSync(filename)
    return {
      size: metadata.size,
      regularFile: metadata.isFile() && !metadata.isSymbolicLink(),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { size: 0, regularFile: false }
    }
    throw error
  }
}

export function validateReceipt(
  value: unknown,
  options: NativePackOptions,
): asserts value is NativePackReceipt {
  if (typeof value !== 'object' || value === null) {
    throw new Error('abi pack-ffi receipt must be a JSON object.')
  }
  const receipt = value as Record<string, unknown>
  if (
    receipt['input'] !== options.library ||
    receipt['template'] !== options.template ||
    receipt['output'] !== options.output ||
    receipt['target'] !== options.target
  ) {
    throw new Error('abi pack-ffi receipt does not match the requested inputs.')
  }
  if (
    !Number.isSafeInteger(receipt['rawSize']) ||
    (receipt['rawSize'] as number) <= 0 ||
    !Number.isSafeInteger(receipt['nativeSize']) ||
    (receipt['nativeSize'] as number) <= 0 ||
    typeof receipt['rawSha512'] !== 'string' ||
    !/^[\da-f]{128}$/u.test(receipt['rawSha512'])
  ) {
    throw new Error(
      'abi pack-ffi receipt contains invalid size or SHA-512 data.',
    )
  }
}
