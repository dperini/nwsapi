import crypto from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import { Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32, createDeflateRaw } from 'node:zlib'
import {
  createZipEnd,
  createZipHeaders,
  ZIP_MAX_BYTES,
  ZIP_MAX_ENTRIES,
} from './headers.mts'
import type { FileHandle } from 'node:fs/promises'

const CHUNK_BYTES = 64 * 1024
const MAX_DIRECTORY_BYTES = 16 * 1024 * 1024

export interface ZipFileEntry {
  name: string
  path: string
  size: number
}

export function assertZipFiles(entries: readonly ZipFileEntry[]): void {
  let bytes = 22
  let directoryBytes = 0
  const names = new Set<string>()
  for (const entry of entries) {
    const nameBytes = Buffer.byteLength(entry.name)
    const segments = entry.name.split('/')
    if (
      !entry.name ||
      names.has(entry.name) ||
      entry.name.includes('\\') ||
      entry.name.includes('\0') ||
      /^[a-z]:/i.test(entry.name) ||
      segments.some(segment => !segment || segment === '.' || segment === '..')
    ) {
      throw new Error(
        'Invalid ZIP entry path. Where: artifact archive. Saw a duplicate or unsafe relative path; wanted unique portable file names. Fix: stage each file once below the upload root.',
      )
    }
    createZipHeaders({
      name: entry.name,
      crc: 0,
      compressedSize: 0,
      uncompressedSize: entry.size,
      offset: 0,
    })
    names.add(entry.name)
    bytes += entry.size + 76 + nameBytes * 2
    directoryBytes += 46 + nameBytes
  }
  if (
    entries.length > ZIP_MAX_ENTRIES ||
    bytes > ZIP_MAX_BYTES ||
    directoryBytes > MAX_DIRECTORY_BYTES
  ) {
    throw new RangeError(
      'ZIP inputs exceed supported limits. Where: artifact archive. Saw more than 4 GiB of staged data, 65534 entries or 16 MiB of directory metadata. Fix: split the artifact into smaller archives.',
    )
  }
}

export async function writeZipBytes(
  handle: FileHandle,
  bytes: Buffer,
  position: number,
): Promise<void> {
  if (position + bytes.length > ZIP_MAX_BYTES) {
    throw new RangeError(
      'ZIP output exceeds 4 GiB. Where: artifact archive. Saw an oversized compressed archive; wanted a classic ZIP below 4 GiB. Fix: split the artifact into smaller archives.',
    )
  }
  let written = 0
  while (written < bytes.length) {
    const { bytesWritten } = await handle.write(
      bytes,
      written,
      bytes.length - written,
      position + written,
    )
    if (!bytesWritten) {
      throw new Error(
        'ZIP write stopped. Where: artifact archive. Saw a zero-byte write; wanted complete output. Fix: check disk space and retry.',
      )
    }
    written += bytesWritten
  }
}

export async function writeZipFileEntry(
  entry: ZipFileEntry,
  archive: FileHandle,
  offset: number,
): Promise<{ central: Buffer; offset: number }> {
  const source = await fs.open(
    entry.path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await source.stat()
    if (!before.isFile() || before.size !== entry.size) {
      throw new Error(
        'Artifact source changed. Where: ZIP input. Saw a changed file size or type; wanted the staged regular file. Fix: stop writers and stage the artifact again.',
      )
    }
    const initial = createZipHeaders({
      name: entry.name,
      crc: 0,
      compressedSize: 0,
      uncompressedSize: entry.size,
      offset,
    })
    await writeZipBytes(archive, initial.local, offset)
    let position = offset + initial.local.length
    let checksum = 0
    let inputBytes = 0
    const counter = new Transform({
      transform(chunk: Buffer, encoding, callback) {
        void encoding
        inputBytes += chunk.length
        if (inputBytes > entry.size) {
          callback(new Error('Artifact input grew while archiving'))
          return
        }
        checksum = crc32(chunk, checksum)
        callback(undefined, chunk)
      },
    })
    const output = new Writable({
      write(chunk: Buffer, encoding, callback) {
        void encoding
        writeZipBytes(archive, chunk, position).then(() => {
          position += chunk.length
          callback()
        }, callback)
      },
    })
    await pipeline(
      source.createReadStream({ autoClose: false, highWaterMark: CHUNK_BYTES }),
      counter,
      createDeflateRaw({ level: 9, chunkSize: CHUNK_BYTES }),
      output,
    )
    const after = await source.stat()
    if (
      inputBytes !== entry.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    ) {
      throw new Error(
        'Artifact source changed. Where: ZIP input. Saw modified bytes while archiving; wanted a stable staged file. Fix: stop writers and stage the artifact again.',
      )
    }
    const headers = createZipHeaders({
      name: entry.name,
      crc: checksum,
      compressedSize: position - offset - initial.local.length,
      uncompressedSize: inputBytes,
      offset,
    })
    await writeZipBytes(archive, headers.local, offset)
    return { central: headers.central, offset: position }
  } finally {
    await source.close()
  }
}

export async function createZipFile(
  entries: readonly ZipFileEntry[],
  destination: string,
): Promise<{ sizeBytes: number; sha256: string }> {
  assertZipFiles(entries)
  const archive = await fs.open(destination, 'wx', 0o600)
  let sizeBytes = 0
  try {
    const directory: Buffer[] = []
    for (const entry of entries) {
      const result = await writeZipFileEntry(entry, archive, sizeBytes)
      directory.push(result.central)
      sizeBytes = result.offset
    }
    const centralOffset = sizeBytes
    for (let index = 0, count = directory.length; index < count; index += 1) {
      const header = directory[index]!
      await writeZipBytes(archive, header, sizeBytes)
      sizeBytes += header.length
    }
    const end = createZipEnd({
      entries: entries.length,
      centralSize: sizeBytes - centralOffset,
      centralOffset,
    })
    await writeZipBytes(archive, end, sizeBytes)
    sizeBytes += end.length
  } finally {
    await archive.close()
  }
  const hash = crypto.createHash('sha256')
  for await (const chunk of createReadStream(destination, {
    highWaterMark: CHUNK_BYTES,
  })) {
    hash.update(chunk)
  }
  return { sizeBytes, sha256: hash.digest('hex') }
}
