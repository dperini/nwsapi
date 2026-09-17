import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import type { ToolPlan } from '../../../../scripts/repo/external-tools.mts'
import { toolDirectory } from '../../../../scripts/repo/external-tools.mts'
import {
  installTool,
  stageTool,
} from '../../../../scripts/repo/setup/install.mts'

test('only verified archives are extracted and altered installed files are repaired', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tool-install-'))
  try {
    const source = path.join(directory, 'source')
    const cache = path.join(directory, 'cache')
    mkdirSync(source)
    writeFileSync(path.join(source, 'nub'), 'verified binary')
    mkdirSync(path.join(source, 'runtime'))
    writeFileSync(path.join(source, 'runtime', 'helper.js'), 'verified sidecar')
    const asset = 'nub-test.tar.gz'
    execFileSync('tar', ['-czf', path.join(directory, asset), '.'], {
      cwd: source,
    })
    const bytes = readFileSync(path.join(directory, asset))
    const plan: ToolPlan = {
      name: 'nub',
      version: '1.0.0',
      asset,
      binary: 'nub',
      integrity:
        'sha256-' + createHash('sha256').update(bytes).digest('base64'),
      url: 'https://github.com/example/tool/releases/download/v1.0.0/' + asset,
    }
    const corrupt = vi.fn(async () => new Response('not the release'))
    await expect(installTool(plan, cache, corrupt)).rejects.toThrow(
      'integrity mismatch',
    )
    expect(existsSync(toolDirectory(plan, cache))).toBe(false)
    const request = vi.fn(async () => new Response(bytes))
    const executable = await installTool(plan, cache, request)
    expect(readFileSync(executable, 'utf8')).toBe('verified binary')
    writeFileSync(executable, 'altered binary')
    const sidecar = path.join(path.dirname(executable), 'runtime', 'helper.js')
    writeFileSync(sidecar, 'altered sidecar')
    await installTool(plan, cache, request)
    expect(readFileSync(executable, 'utf8')).toBe('verified binary')
    expect(readFileSync(sidecar, 'utf8')).toBe('verified sidecar')
    expect(request).toHaveBeenCalledOnce()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('bare binaries are verified, cached, and repaired without archive extraction', async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-binary-install-'),
  )
  try {
    const bytes = Buffer.from('verified bare executable')
    const plan: ToolPlan = {
      name: 'sfw',
      version: '1.0.0',
      asset: 'sfw-test',
      binary: 'sfw',
      format: 'binary',
      integrity:
        'sha256-' + createHash('sha256').update(bytes).digest('base64'),
      url: 'https://github.com/example/sfw/releases/download/v1.0.0/sfw-test',
    }
    const request = vi.fn(async () => new Response(bytes))
    await expect(
      installTool(plan, directory, async () => new Response('corrupt')),
    ).rejects.toThrow('integrity mismatch')
    expect(existsSync(toolDirectory(plan, directory))).toBe(false)
    const executable = await installTool(plan, directory, request)
    expect(readFileSync(executable)).toEqual(bytes)
    writeFileSync(executable, 'altered')
    await installTool(plan, directory, request)
    expect(readFileSync(executable)).toEqual(bytes)
    expect(request).toHaveBeenCalledOnce()
    const staging = path.join(directory, 'staging')
    mkdirSync(staging)
    stageTool({ ...plan, binary: 'bin/sfw' }, bytes, staging)
    expect(readFileSync(path.join(staging, 'bin', 'sfw'))).toEqual(bytes)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
