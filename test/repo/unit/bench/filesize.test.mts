import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test, vi } from 'vitest'
import type * as RunNode from '../../../../scripts/repo/lib/run-node.mts'

const bundler = vi.hoisted(() => ({
  build: vi.fn(),
  generate: vi.fn(),
  close: vi.fn(),
}))
vi.mock('rolldown', () => ({ rolldown: bundler.build }))
import {
  fileSizes,
  sizeReport,
} from '../../../../scripts/repo/bench/filesize.mts'
afterEach(() => vi.clearAllMocks())

test('file sizes compare UTF-8 artifacts and fingerprint included competitor modules', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-sizes-'))
  const module = path.join(directory, 'module.mjs')
  const code = 'export const value = "repeated";\n'.repeat(100)
  writeFileSync(module, code)
  bundler.build.mockResolvedValue(bundler)
  bundler.generate.mockResolvedValue({
    output: [
      {
        type: 'chunk',
        imports: [],
        modules: { [module]: {}, '\0virtual': {} },
        code,
      },
    ],
  })
  try {
    const sizes = fileSizes(code)
    assert.deepEqual(sizes, fileSizes(Buffer.from(code)))
    assert.equal(sizes.bytes, Buffer.byteLength(code))
    assert.ok(sizes.gzip < sizes.bytes)
    assert.ok(sizes.brotli < sizes.bytes)
    const report = await sizeReport()
    assert.equal(report.rows.length, 2)
    assert.equal(report.rows[1]!.sha256, sizes.sha256)
    assert.deepEqual(report.competitorModules, [
      { file: module, sha256: sizes.sha256 },
    ])
    assert.equal(bundler.close.mock.calls.length, 1)
    const failures = [
      [],
      [{ type: 'asset' }],
      [{ type: 'chunk', imports: ['external'] }],
      [
        { type: 'chunk', imports: [] },
        { type: 'chunk', imports: [] },
      ],
    ]
    for (let index = 0, length = failures.length; index < length; index += 1) {
      bundler.generate.mockResolvedValue({ output: failures[index] })
      await assert.rejects(sizeReport())
    }
    bundler.generate.mockRejectedValue(new Error('generation failed'))
    await assert.rejects(sizeReport())
    assert.equal(bundler.close.mock.calls.length, 6)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('file-size command writes structured comparisons and supports help without bundling', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-sizes-cli-'))
  const output = path.join(directory, 'sizes.json')
  const originalArgs = process.argv
  bundler.build.mockResolvedValue(bundler)
  bundler.generate.mockResolvedValue({
    output: [
      {
        type: 'chunk',
        imports: [],
        modules: {},
        code: 'export const value = 1;',
      },
    ],
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.doMock(
    '../../../../scripts/repo/lib/run-node.mts',
    async importOriginal => ({
      ...(await importOriginal<typeof RunNode>()),
      isMainModule: () => true,
    }),
  )
  try {
    vi.resetModules()
    process.argv = [originalArgs[0]!, 'filesize.mts', '--output', output]
    await import('../../../../scripts/repo/bench/filesize.mts')
    const report = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(report.rows.length, 2)
    vi.clearAllMocks()
    vi.resetModules()
    process.argv = [originalArgs[0]!, 'filesize.mts', '--help']
    await import('../../../../scripts/repo/bench/filesize.mts')
    assert.equal(bundler.build.mock.calls.length, 0)
  } finally {
    process.argv = originalArgs
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
    vi.resetModules()
    rmSync(directory, { recursive: true, force: true })
  }
})
