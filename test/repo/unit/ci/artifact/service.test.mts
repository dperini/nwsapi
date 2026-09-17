import { expect, test, vi } from 'vitest'
import {
  artifactExpiration,
  artifactPost,
  readArtifactService,
  requireHttps,
} from '../../../../../scripts/repo/ci/artifact/service.mts'

const token =
  'header.' +
  Buffer.from(
    JSON.stringify({ scp: 'other Actions.Results:run:job' }),
  ).toString('base64url') +
  '.signature'
const env = {
  ACTIONS_RESULTS_URL: 'https://results.example/',
  ACTIONS_RUNTIME_TOKEN: token,
}

test('the artifact service requires runner-scoped credentials and HTTPS', () => {
  expect(readArtifactService(env)).toEqual({
    url: env.ACTIONS_RESULTS_URL,
    token,
    workflow_run_backend_id: 'run',
    workflow_job_run_backend_id: 'job',
  })
  expect(() =>
    readArtifactService({ ...env, ACTIONS_RUNTIME_TOKEN: 'invalid' }),
  ).toThrow('token is invalid')
  expect(() =>
    readArtifactService({ ...env, ACTIONS_RUNTIME_TOKEN: 'x.e30.x' }),
  ).toThrow('no run and job IDs')
  for (const url of [
    'http://results.example/',
    'https://user:password@results.example/',
  ]) {
    expect(() => requireHttps(url)).toThrow('HTTPS URL without credentials')
  }
})

test('retention respects repository policy and rejects invalid periods', () => {
  expect(artifactExpiration(14, { GITHUB_RETENTION_DAYS: '7' }, 0)).toBe(
    '1970-01-08T00:00:00.000Z',
  )
  expect(artifactExpiration(14, {}, 0)).toBe('1970-01-15T00:00:00.000Z')
  for (const value of [0, 401, 1.5, NaN]) {
    expect(() => artifactExpiration(value)).toThrow('whole days')
  }
})

test('protocol calls authenticate, require acknowledgment, and redact service failures', async () => {
  const config = readArtifactService(env)
  const request = vi.fn(
    async () => new Response(JSON.stringify({ ok: true, artifactId: '42' })),
  )
  expect(
    await artifactPost(config, 'FinalizeArtifact', { size: '12' }, request),
  ).toMatchObject({ artifactId: '42' })
  expect(request).toHaveBeenCalledWith(
    new URL(
      'https://results.example/twirp/github.actions.results.api.v1.ArtifactService/FinalizeArtifact',
    ),
    expect.objectContaining({
      method: 'POST',
      redirect: 'error',
      body: '{"size":"12"}',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }),
  )
  await expect(
    artifactPost(
      config,
      'CreateArtifact',
      {},
      async () => new Response('private details', { status: 403 }),
    ),
  ).rejects.toThrow('HTTP 403')
  await expect(
    artifactPost(
      config,
      'CreateArtifact',
      {},
      async () => new Response('{"ok":false}'),
    ),
  ).rejects.toThrow('not acknowledged')
})
