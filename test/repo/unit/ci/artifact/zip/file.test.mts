import { Readable } from 'node:stream'
import type { FileHandle } from 'node:fs/promises'
import fs from 'node:fs/promises'
import { afterEach, expect, test, vi } from 'vitest'
import {
  assertZipFiles,
  writeZipBytes,
  writeZipFileEntry,
} from '../../../../../../scripts/repo/ci/artifact/zip/file.mts'
import { ZIP_MAX_BYTES } from '../../../../../../scripts/repo/ci/artifact/zip/headers.mts'

afterEach(() => vi.restoreAllMocks())
test.each(['', '../file', 'a\\b', 'a\0b', 'C:/file', 'a//b', './file'])(
  'rejects unsafe archive path %s',
  name => {
    expect(() => assertZipFiles([{ name, path: 'unused', size: 0 }])).toThrow()
  },
)
test('rejects duplicate entries and archive size above the classic ZIP limit', () => {
  expect(() =>
    assertZipFiles([
      { name: 'file', path: 'a', size: 0 },
      { name: 'file', path: 'b', size: 0 },
    ]),
  ).toThrow()
  expect(() =>
    assertZipFiles([{ name: 'file', path: 'a', size: ZIP_MAX_BYTES }]),
  ).toThrow()
})
test('output handles partial writes and rejects zero writes and overflow', async () => {
  const write = vi.fn(async () => ({ bytesWritten: 2 }))
  await writeZipBytes(
    { write } as unknown as FileHandle,
    Buffer.from('abcd'),
    10,
  )
  expect(write.mock.calls).toHaveLength(2)
  const stopped = {
    write: async () => ({ bytesWritten: 0 }),
  } as unknown as FileHandle
  await expect(writeZipBytes(stopped, Buffer.from('a'), 0)).rejects.toThrow()
  await expect(
    writeZipBytes(stopped, Buffer.from('a'), ZIP_MAX_BYTES),
  ).rejects.toThrow()
})
test.each(['not-file', 'wrong-size', 'grew', 'modified', 'valid'])(
  'entry rejects changed source state %s',
  async mode => {
    const before = {
      size: 3,
      mtimeMs: 1,
      ctimeMs: 1,
      isFile: () => mode !== 'not-file',
    }
    const after = { ...before, mtimeMs: mode === 'modified' ? 2 : 1 }
    const close = vi.fn(async () => {})
    const source = {
      stat: vi
        .fn()
        .mockResolvedValueOnce(
          mode === 'wrong-size' ? { ...before, size: 4 } : before,
        )
        .mockResolvedValue(after),
      createReadStream: () =>
        Readable.from([Buffer.from(mode === 'grew' ? 'abcd' : 'abc')]),
      close,
    } as unknown as FileHandle
    vi.spyOn(fs, 'open').mockResolvedValue(source)
    const archive = {
      write: async (bytes: Buffer, _offset: number, length: number) => ({
        bytesWritten: length,
        buffer: bytes,
      }),
    } as unknown as FileHandle
    const promise = writeZipFileEntry(
      { name: 'file', path: 'unused', size: 3 },
      archive,
      0,
    )
    if (mode === 'valid') {
      expect(await promise).toMatchObject({
        central: expect.any(Buffer),
        offset: expect.any(Number),
      })
    } else {
      await expect(promise).rejects.toThrow()
    }
    expect(close).toHaveBeenCalledOnce()
  },
)
