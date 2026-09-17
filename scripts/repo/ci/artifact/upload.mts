import { createReadStream, lstatSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import { parseArgs } from 'node:util'
import { isMainModule } from '../../lib/run-node.mts'
import {
  artifactExpiration,
  artifactPost,
  readArtifactService,
  requireHttps,
} from './service.mts'
import { createZipFile } from './zip/file.mts'
import type { ZipFileEntry } from './zip/file.mts'

export function collectFiles(
  directory: string,
  root = directory,
): ZipFileEntry[] {
  const stat = lstatSync(directory, { throwIfNoEntry: false })
  if (!stat) {
    return []
  }
  if (stat.isSymbolicLink()) {
    throw new Error('Artifact inputs must not contain symbolic links.')
  }
  if (stat.isDirectory()) {
    return readdirSync(directory)
      .toSorted()
      .flatMap(name => collectFiles(path.join(directory, name), root))
  }
  if (!stat.isFile()) {
    throw new Error('Artifact inputs must contain only regular files.')
  }
  return [
    {
      name:
        path.relative(root, directory).split(path.sep).join('/') ||
        path.basename(directory),
      path: directory,
      size: stat.size,
    },
  ]
}

export async function uploadZip(
  url: string,
  file: string,
  size: number,
  request: typeof fetch = fetch,
) {
  const stream = createReadStream(file)
  try {
    const options: RequestInit & { duplex: 'half' } = {
      method: 'PUT',
      redirect: 'error',
      signal: AbortSignal.timeout(30 * 60_000),
      headers: {
        'Content-Length': String(size),
        'x-ms-blob-type': 'BlockBlob',
      },
      body: stream as unknown as BodyInit,
      duplex: 'half',
    }
    const response = await request(requireHttps(url), options)
    if (!response.ok) {
      throw new Error('Upload failed')
    }
    await response.body?.cancel()
  } catch {
    // Signed blob URLs contain credentials and must never appear in errors.
    throw new Error('The artifact archive upload failed.')
  } finally {
    stream.destroy()
    await finished(stream, { cleanup: true }).catch(() => {})
  }
}

export async function uploadArtifact(
  name: string,
  entries: ZipFileEntry[],
  retention: number,
  env = process.env,
  request: typeof fetch = fetch,
) {
  if (!name || /[\\/:"<>|*?\r\n]/.test(name)) {
    throw new Error('Invalid artifact name.')
  }
  const config = readArtifactService(env)
  const ids = {
    workflow_run_backend_id: config.workflow_run_backend_id,
    workflow_job_run_backend_id: config.workflow_job_run_backend_id,
  }
  const expires = artifactExpiration(retention, env)
  const directory = await mkdtemp(
    path.join(env['RUNNER_TEMP'] ?? os.tmpdir(), 'nwsapi-artifact-'),
  )
  const file = path.join(directory, 'artifact.zip')
  try {
    const zip = await createZipFile(entries, file)
    const created = await artifactPost(
      config,
      'CreateArtifact',
      {
        ...ids,
        name,
        version: 7,
        mime_type: 'application/zip',
        expires_at: expires,
      },
      request,
    )
    const url = created['signedUploadUrl'] ?? created['signed_upload_url']
    if (typeof url !== 'string') {
      throw new Error('The artifact service did not provide an upload URL.')
    }
    await uploadZip(url, file, zip.sizeBytes, request)
    const finalized = await artifactPost(
      config,
      'FinalizeArtifact',
      {
        ...ids,
        name,
        size: String(zip.sizeBytes),
        hash: `sha256:${zip.sha256}`,
      },
      request,
    )
    const value = finalized['artifactId'] ?? finalized['artifact_id']
    const id =
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : ''
    if (!/^\d+$/.test(id)) {
      throw new Error('The artifact service did not provide an artifact ID.')
    }
    return id
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function runUpload(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      name: { type: 'string' },
      path: { type: 'string' },
      'retention-days': { type: 'string', default: '14' },
      'if-no-files-found': { type: 'string', default: 'warn' },
    },
  })
  if (
    !values.name ||
    !values.path ||
    !['warn', 'error', 'ignore'].includes(values['if-no-files-found']!)
  ) {
    throw new Error(
      'Usage: upload.mts --name <name> --path <directory> [--retention-days <days>] [--if-no-files-found warn|error|ignore]',
    )
  }
  const entries = collectFiles(path.resolve(values.path))
  if (!entries.length) {
    if (values['if-no-files-found'] === 'error') {
      throw new Error('No artifact files found.')
    }
    if (values['if-no-files-found'] === 'warn') {
      console.warn('::warning::No artifact files found.')
    }
    return
  }
  const id = await uploadArtifact(
    values.name,
    entries,
    Number(values['retention-days']),
  )
  console.log(`Artifact uploaded: ${values.name} (id ${id})`)
}

if (isMainModule(import.meta.url)) {
  await runUpload()
}
