import { setTimeout } from 'node:timers/promises'

export interface ArtifactService {
  url: string
  token: string
  workflow_run_backend_id: string
  workflow_job_run_backend_id: string
}

export function requireHttps(url: string) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(
      'The artifact service requires an HTTPS URL without credentials.',
    )
  }
  return parsed
}

export function readArtifactService(env = process.env): ArtifactService {
  const url = env['ACTIONS_RESULTS_URL'] ?? ''
  const token = env['ACTIONS_RUNTIME_TOKEN'] ?? ''
  requireHttps(url)
  let scope: unknown
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
    )
    scope = payload.scp
  } catch {
    throw new Error('The Actions artifact runtime token is invalid.')
  }
  const ids =
    typeof scope === 'string'
      ? scope
          .split(' ')
          .find(item => item.startsWith('Actions.Results:'))
          ?.split(':')
      : undefined
  if (ids?.length !== 3 || !ids[1] || !ids[2]) {
    throw new Error(
      'The Actions artifact runtime token has no run and job IDs.',
    )
  }
  return {
    url,
    token,
    workflow_run_backend_id: ids[1],
    workflow_job_run_backend_id: ids[2],
  }
}

export function artifactExpiration(
  days: number,
  env = process.env,
  now = Date.now(),
) {
  if (!Number.isInteger(days) || days < 1 || days > 400) {
    throw new Error('Artifact retention must be 1 through 400 whole days.')
  }
  const maximum = Number(env['GITHUB_RETENTION_DAYS'])
  const allowed =
    Number.isInteger(maximum) && maximum > 0 ? Math.min(days, maximum) : days
  return new Date(now + allowed * 86_400_000).toISOString()
}

export async function artifactPost(
  config: ArtifactService,
  method: 'CreateArtifact' | 'FinalizeArtifact',
  body: object,
  request: typeof fetch = fetch,
) {
  const url = new URL(
    `/twirp/github.actions.results.api.v1.ArtifactService/${method}`,
    requireHttps(config.url),
  )
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response
    try {
      response = await request(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch {
      if (attempt === 2) {
        throw new Error(`Artifact ${method} request failed.`)
      }
      await setTimeout(1000)
      continue
    }
    if (!response.ok) {
      if (response.status >= 500 && attempt < 2) {
        await response.body?.cancel()
        await setTimeout(1000)
        continue
      }
      throw new Error(`Artifact ${method} failed: HTTP ${response.status}.`)
    }
    const result: unknown = await response.json()
    if (
      !result ||
      typeof result !== 'object' ||
      !('ok' in result) ||
      result.ok !== true
    ) {
      throw new Error(`Artifact ${method} was not acknowledged.`)
    }
    return result as Record<string, unknown>
  }
  throw new Error(`Artifact ${method} request failed.`)
}
