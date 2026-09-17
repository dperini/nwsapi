import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import {
  collectFiles,
  runUpload,
  uploadArtifact,
  uploadZip,
} from '../../../../../scripts/repo/ci/artifact/upload.mts'

test('artifact upload creates, transfers, and finalizes the ZIP with its digest', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-artifact-'))
  try {
    const corpus = path.join(directory, 'corpus')
    mkdirSync(corpus)
    writeFileSync(path.join(corpus, '.hidden'), 'seed')
    const entries = collectFiles(corpus)
    expect(entries.map(entry => entry.name)).toEqual(['.hidden'])
    const token =
      'x.' +
      Buffer.from(JSON.stringify({ scp: 'Actions.Results:run:job' })).toString(
        'base64url',
      ) +
      '.y'
    const env = {
      ACTIONS_RESULTS_URL: 'https://results.example/',
      ACTIONS_RUNTIME_TOKEN: token,
      RUNNER_TEMP: directory,
    }
    const calls: string[] = []
    let archive = Buffer.alloc(0)
    const request: typeof fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString()
      calls.push(init?.method ?? '')
      if (init?.method === 'PUT') {
        expect(init.headers).not.toHaveProperty('Authorization')
        expect(url).toBe('https://blob.example/archive?signature=private')
        const chunks: Buffer[] = []
        for await (const chunk of init.body as unknown as AsyncIterable<Buffer>) {
          chunks.push(chunk)
        }
        archive = Buffer.concat(chunks)
        expect(new Headers(init.headers).get('content-length')).toBe(
          String(archive.length),
        )
        return new Response(null, { status: 201 })
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        `Bearer ${token}`,
      )
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON request body')
      }
      const body = JSON.parse(init.body)
      expect(body).toMatchObject({
        workflow_run_backend_id: 'run',
        workflow_job_run_backend_id: 'job',
        name: 'corpus',
      })
      if (url.endsWith('/CreateArtifact')) {
        expect(body).toMatchObject({ version: 7, mime_type: 'application/zip' })
        expect(Date.parse(body.expires_at)).toBeGreaterThan(
          Date.now() + 13 * 86_400_000,
        )
        return new Response(
          JSON.stringify({
            ok: true,
            signedUploadUrl: 'https://blob.example/archive?signature=private',
          }),
        )
      }
      expect(body).toMatchObject({
        size: String(archive.length),
        hash: 'sha256:' + createHash('sha256').update(archive).digest('hex'),
      })
      return new Response('{"ok":true,"artifactId":"42"}')
    }
    expect(await uploadArtifact('corpus', entries, 14, env, request)).toBe('42')
    expect(calls).toEqual(['POST', 'PUT', 'POST'])
    expect(readdirSync(directory)).toEqual(['corpus'])
    await expect(
      uploadZip(
        'https://blob.example/?secret=value',
        entries[0]!.path,
        4,
        async () => {
          throw new Error('https://blob.example/?secret=value')
        },
      ),
    ).rejects.toThrow('The artifact archive upload failed.')
    symlinkSync(entries[0]!.path, path.join(corpus, 'link'))
    expect(() => collectFiles(corpus)).toThrow('symbolic links')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('missing corpus files follow the selected warning, ignore, or error policy', async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-artifact-empty-'),
  )
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const args = ['--name', 'corpus', '--path', directory]
    await runUpload(args)
    expect(warn).toHaveBeenCalledWith('::warning::No artifact files found.')
    await runUpload([...args, '--if-no-files-found', 'ignore'])
    expect(warn).toHaveBeenCalledOnce()
    await expect(
      runUpload([...args, '--if-no-files-found', 'error']),
    ).rejects.toThrow('No artifact files')
    await expect(runUpload(['--name', 'corpus'])).rejects.toThrow('Usage:')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
