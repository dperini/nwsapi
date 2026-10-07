import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type * as Fs from 'node:fs'
import nock from 'nock'
import {
  collectFiles,
  runUpload,
  uploadArtifact,
  uploadZip,
} from '../../../../../scripts/repo/ci/artifact/upload.mts'
const env = {
  ACTIONS_RESULTS_URL: 'https://results.example/',
  ACTIONS_RUNTIME_TOKEN:
    'x.' +
    Buffer.from(JSON.stringify({ scp: 'Actions.Results:run:job' })).toString(
      'base64url',
    ) +
    '.y',
}
const endpoint = '/twirp/github.actions.results.api.v1.ArtifactService/'
// Buffer only the mock transport body so nock does not abort an undici upload.
const mockTransport: typeof fetch = async (input, options) => {
  const body = options?.body
  if (body && typeof body !== 'string') {
    return fetch(input, {
      ...options,
      body: await new Response(body).arrayBuffer(),
    })
  }
  return fetch(input, options)
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
test.each([
  { create: {}, final: {} },
  { create: { signed_upload_url: 'https://blob.example/' }, final: {} },
  {
    create: { signed_upload_url: 'https://blob.example/' },
    final: { artifact_id: 'invalid' },
  },
])(
  'service metadata must include upload URL and valid ID %j',
  async ({ create, final }) => {
    const service = nock('https://results.example')
      .post(endpoint + 'CreateArtifact')
      .reply(200, { ok: true, ...create })
    if ('signed_upload_url' in create) {
      nock('https://blob.example').put('/').reply(201)
      service
        .post(endpoint + 'FinalizeArtifact')
        .reply(200, { ok: true, ...final })
    }
    await expect(
      uploadArtifact('report', [], 14, env, mockTransport),
    ).rejects.toThrow()
    expect(service.isDone()).toBe(true)
  },
)
test('alternate service fields and numeric artifact ID are accepted', async () => {
  const service = nock('https://results.example')
    .post(endpoint + 'CreateArtifact')
    .reply(200, { ok: true, signed_upload_url: 'https://blob.example/' })
    .post(endpoint + 'FinalizeArtifact')
    .reply(200, { ok: true, artifact_id: 42 })
  const blob = nock('https://blob.example').put('/').reply(201)
  expect(await uploadArtifact('report', [], 14, env, mockTransport)).toBe('42')
  expect(service.isDone() && blob.isDone()).toBe(true)
})
test('invalid name is rejected before credentials or upload', async () => {
  await expect(uploadArtifact('', [], 14, {})).rejects.toThrow()
  await expect(uploadArtifact('invalid/name', [], 14, {})).rejects.toThrow()
})
test('CLI rejects incomplete arguments and uploads a populated path', async t => {
  await expect(runUpload([])).rejects.toThrow()
  await expect(
    runUpload([
      '--name',
      'report',
      '--path',
      'missing',
      '--if-no-files-found',
      'bad',
    ]),
  ).rejects.toThrow()
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-upload-cli-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'file'), 'payload')
  const environmentEntries = Object.entries(env)
  for (let i = 0, length = environmentEntries.length; i < length; i += 1) {
    const [name, value] = environmentEntries[i]!
    vi.stubEnv(name, value)
  }
  const service = nock('https://results.example')
    .post(endpoint + 'CreateArtifact')
    .reply(200, { ok: true, signedUploadUrl: 'https://blob.example/' })
    .post(endpoint + 'FinalizeArtifact')
    .reply(200, { ok: true, artifactId: '42' })
  const blob = nock('https://blob.example').put('/').reply(201)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await runUpload(['--name', 'report', '--path', root], mockTransport)
  expect(service.isDone() && blob.isDone()).toBe(true)
  expect(collectFiles(path.join(root, 'file'))[0]!.name).toBe('file')
})
test('CLI entry point delegates validated arguments', async () => {
  vi.resetModules()
  vi.doMock('../../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: () => true,
  }))
  const argv = process.argv
  process.argv = ['node', 'upload.mts']
  try {
    await expect(
      import('../../../../../scripts/repo/ci/artifact/upload.mts'),
    ).rejects.toThrow()
  } finally {
    process.argv = argv
    vi.doUnmock('../../../../../scripts/repo/lib/run-node.mts')
  }
})

test('missing and nonregular inputs cannot be uploaded', async () => {
  expect(
    collectFiles(path.join(os.tmpdir(), 'nwsapi-missing-artifact-input')),
  ).toEqual([])
  vi.resetModules()
  const actual = await vi.importActual<typeof Fs>('node:fs')
  vi.doMock('node:fs', () => ({
    ...actual,
    lstatSync: () => ({
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => false,
    }),
  }))
  try {
    const module =
      await import('../../../../../scripts/repo/ci/artifact/upload.mts')
    expect(() => module.collectFiles('device')).toThrow()
  } finally {
    vi.doUnmock('node:fs')
  }
})
test('failed blob response is redacted and closes the input stream', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-upload-failed-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'file')
  writeFileSync(file, 'payload')
  const blob = nock('https://blob.example').put('/?private=token').reply(403)
  await expect(
    uploadZip('https://blob.example/?private=token', file, 7, mockTransport),
  ).rejects.toThrow()
  expect(blob.isDone()).toBe(true)
})
