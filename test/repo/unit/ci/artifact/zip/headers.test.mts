import { expect, test } from 'vitest'
import {
  createZipEnd,
  createZipHeaders,
  ZIP_MAX_BYTES,
  ZIP_MAX_ENTRIES,
} from '../../../../../../scripts/repo/ci/artifact/zip/headers.mts'

test('ZIP headers encode UTF-8 names, checksums, sizes, and directory offsets', () => {
  const name = 'corpus/é'
  const { local, central } = createZipHeaders({
    name,
    crc: 123,
    compressedSize: 12,
    uncompressedSize: 20,
    offset: 42,
  })
  expect(local.readUInt32LE(0)).toBe(0x04_03_4b_50)
  expect(local.readUInt16LE(6)).toBe(0x08_00)
  expect(local.readUInt32LE(14)).toBe(123)
  expect(local.readUInt32LE(18)).toBe(12)
  expect(local.subarray(30).toString()).toBe(name)
  expect(central.readUInt32LE(42)).toBe(42)
  const end = createZipEnd({
    entries: 1,
    centralSize: central.length,
    centralOffset: 54,
  })
  expect(end.readUInt16LE(8)).toBe(1)
  expect(end.readUInt32LE(16)).toBe(54)
  expect(() =>
    createZipHeaders({
      name,
      crc: 0,
      compressedSize: ZIP_MAX_BYTES + 1,
      uncompressedSize: 0,
      offset: 0,
    }),
  ).toThrow(RangeError)
  expect(() =>
    createZipEnd({
      entries: ZIP_MAX_ENTRIES + 1,
      centralSize: 0,
      centralOffset: 0,
    }),
  ).toThrow(RangeError)
})
