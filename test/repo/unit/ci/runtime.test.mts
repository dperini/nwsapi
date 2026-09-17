import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import {
  escapeWorkflowValue,
  exposeRuntime,
} from '../../../../scripts/repo/ci/runtime.mts'

test('runtime credentials are masked before being exported with independent delimiters', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-runtime-'))
  try {
    const file = path.join(directory, 'env')
    const output = vi.fn()
    exposeRuntime(
      {
        GITHUB_ENV: file,
        ACTIONS_RESULTS_URL: 'https://results.example/',
        ACTIONS_RUNTIME_TOKEN: 'test-token',
      },
      output,
    )
    expect(output).toHaveBeenCalledWith('::add-mask::test-token\n')
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines[0]!.split('<<')[0]).toBe('ACTIONS_RESULTS_URL')
    expect(lines[1]).toBe('https://results.example/')
    expect(lines[2]).toBe(lines[0]!.split('<<')[1])
    expect(lines[3]!.split('<<')[0]).toBe('ACTIONS_RUNTIME_TOKEN')
    expect(lines[4]).toBe('test-token')
    expect(lines[5]).toBe(lines[3]!.split('<<')[1])
    expect(lines[2]).not.toBe(lines[5])
    expect(() => exposeRuntime({}, output)).toThrow('runner did not provide')
    expect(escapeWorkflowValue('a%\r\nb')).toBe('a%25%0D%0Ab')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
