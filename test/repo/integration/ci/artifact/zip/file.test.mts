import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  assertZipFiles,
  createZipFile,
} from '../../../../../../scripts/repo/ci/artifact/zip/file.mts'

test('streamed ZIP archives interoperate with the standard ZIP reader', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-zip-'))
  try {
    const source = path.join(directory, 'input')
    const bytes = Buffer.from('example corpus'.repeat(10_000))
    writeFileSync(source, bytes)
    const entries = [{ name: '.hidden/é', path: source, size: bytes.length }]
    const file = path.join(directory, 'artifact.zip')
    const zip = await createZipFile(entries, file)
    const archive = readFileSync(file)
    expect(zip.sizeBytes).toBe(archive.length)
    expect(zip.sha256).toBe(createHash('sha256').update(archive).digest('hex'))
    const output = execFileSync(
      process.platform === 'win32' ? 'python' : 'python3',
      [
        '-c',
        'import sys, zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.namelist()==[".hidden/é"]; sys.stdout.buffer.write(z.read(".hidden/é"))',
        file,
      ],
      { cwd: directory },
    )
    expect(output).toEqual(bytes)
    for (const name of ['../escape', '/root', 'a\\b', 'a//b']) {
      expect(() => assertZipFiles([{ ...entries[0]!, name }])).toThrow(
        'Invalid ZIP entry path',
      )
    }
    expect(() => assertZipFiles([...entries, ...entries])).toThrow(
      'Invalid ZIP entry path',
    )
    await expect(
      createZipFile(
        [{ ...entries[0]!, size: 1 }],
        path.join(directory, 'changed.zip'),
      ),
    ).rejects.toThrow('source changed')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
