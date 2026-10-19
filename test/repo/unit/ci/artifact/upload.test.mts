import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { afterEach, expect, test, vi } from 'vitest'
import type * as Fs from 'node:fs'
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
function mockTransport(create: object, final: object, uploadStatus = 201) {
  return vi.fn<typeof fetch>(async (input, options) => {
    const url =
      typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url)
    if (options?.method === 'PUT') {
      return new Response(null, { status: uploadStatus })
    }
    return Response.json(
      url.pathname.endsWith('CreateArtifact') ? create : final,
    )
  })
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
    const paths: string[] = []
    const request: typeof fetch = async (input, options) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input
      const pathname = new URL(url).pathname
      paths.push(pathname)
      if (options?.method === 'PUT') {
        return new Response(null, { status: 201 })
      }
      const payload = pathname.endsWith('CreateArtifact')
        ? { ok: true, ...create }
        : { ok: true, ...final }
      return Response.json(payload)
    }
    await expect(
      uploadArtifact('report', [], 14, env, request),
    ).rejects.toThrow()
    expect(paths).toEqual(
      'signed_upload_url' in create
        ? [endpoint + 'CreateArtifact', '/', endpoint + 'FinalizeArtifact']
        : [endpoint + 'CreateArtifact'],
    )
  },
)
test('alternate service fields and numeric artifact ID are accepted', async () => {
  const request = mockTransport(
    { ok: true, signed_upload_url: 'https://blob.example/' },
    { ok: true, artifact_id: 42 },
  )
  expect(await uploadArtifact('report', [], 14, env, request)).toBe('42')
  expect(
    request.mock.calls.map(
      ([input]) =>
        new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        ).pathname,
    ),
  ).toEqual([endpoint + 'CreateArtifact', '/', endpoint + 'FinalizeArtifact'])
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
  const request = mockTransport(
    { ok: true, signedUploadUrl: 'https://blob.example/' },
    { ok: true, artifactId: '42' },
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await runUpload(['--name', 'report', '--path', root], request)
  expect(request).toHaveBeenCalledTimes(3)
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
  let upload: Readable | undefined
  const request = vi.fn<typeof fetch>(async (_input, options) => {
    upload = options?.body as unknown as Readable
    return new Response(null, { status: 403 })
  })
  await expect(
    uploadZip('https://blob.example/?private=token', file, 7, request),
  ).rejects.toThrow()
  expect(request).toHaveBeenCalledOnce()
  expect(upload?.destroyed).toBe(true)
})
