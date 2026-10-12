import { expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { toolProcess } from '../../../../scripts/repo/lib/tool-process.mts'

test('ordinary tool requests retain their argument boundaries', () => {
  const args = ['tool.mts', '--file', 'a file.mts']
  const request = toolProcess(args, false)
  expect(request.command).toBe(process.execPath)
  expect(request.args).toEqual(args)
  expect(request.options).toEqual({})
  request.dispose()
})

test('Windows shell launches keep large inventories outside the command line', () => {
  const args = [
    'tool.mts',
    ...Array.from(
      { length: 2000 },
      (_, index) => `src/folder-${index}/file.mts`,
    ),
    'a file & %PATH% !value! (quoted).mts',
  ]
  const request = toolProcess(args, true)
  const file = request.options.env?.NWSAPI_TOOL_ARGUMENTS
  expect(file).toBeTypeOf('string')
  try {
    expect(request.options.shell).toBe(true)
    expect(request.command.length).toBeLessThan(100)
    expect(request.args).toEqual([])
    expect(request.options.env?.NWSAPI_TOOL_NODE).toBe(
      path.normalize(process.execPath),
    )
    expect(JSON.parse(readFileSync(file!, 'utf8'))).toEqual(args)
  } finally {
    request.dispose()
  }
  expect(existsSync(file!)).toBe(false)
})

test('concurrent Windows tool requests own separate argument files', () => {
  const first = toolProcess(['first.mts'], true)
  const second = toolProcess(['second.mts'], true)
  try {
    const firstFile = first.options.env!.NWSAPI_TOOL_ARGUMENTS
    const secondFile = second.options.env!.NWSAPI_TOOL_ARGUMENTS
    expect(firstFile).not.toBe(secondFile)
    first.dispose()
    expect(JSON.parse(readFileSync(secondFile, 'utf8'))).toEqual(['second.mts'])
  } finally {
    first.dispose()
    second.dispose()
  }
})
