import { spawnSync } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { sha256 } from './isolation.mts'

export async function hashes(root: string, names: string[]) {
  const result: Record<string, string | null> = {}
  for (const name of names) {
    try {
      result[name] = sha256(await readFile(path.join(root, name)))
    } catch {
      result[name] = null
    }
  }
  return result
}

export async function externalToolVersion(
  checkout: string,
  name: 'node' | 'npm' | 'pnpm',
) {
  const config = JSON.parse(
    await readFile(path.join(checkout, '.config/external-tools.json'), 'utf8'),
  ) as {
    tools: Record<string, { version: string }>
  }
  return config.tools[name]!.version
}

export function findGit() {
  const result = spawnSync(
    process.platform === 'win32' ? 'where.exe' : 'which',
    ['git'],
    {
      encoding: 'utf8',
    },
  )
  const executable = result.stdout.trim().split(/\r?\n/)[0]
  if (result.status !== 0 || !executable) {
    throw new Error('Git is required as an onboarding prerequisite.')
  }
  return executable
}

export async function stageCommands(
  bin: string,
  node: string,
  scenario: 'bootstrap' | 'npm' | 'pnpm' | 'journey',
  manager?: string,
) {
  for (const name of ['npm', 'pnpm', 'npx', 'corepack', 'nub', 'mise']) {
    const selected = manager && name === scenario
    const suffix = process.platform === 'win32' ? '.cmd' : ''
    const target = path.join(bin, `${name}${suffix}`)
    let body: string
    if (selected) {
      if (/\.(?:c|m)?js$/i.test(manager)) {
        if (process.platform === 'win32') {
          body = `@echo off\r\n"%~dp0node.exe" "${manager}" %*\r\nexit /b %ERRORLEVEL%\r\n`
        } else {
          const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
          body = `#!/bin/sh\nexec ${quote(node)} ${quote(manager)} "$@"\n`
        }
      } else if (process.platform === 'win32') {
        body = `@echo off\r\ncall "${manager}" %*\r\nexit /b %ERRORLEVEL%\r\n`
      } else {
        const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
        body = `#!/bin/sh\nexec ${quote(manager)} "$@"\n`
      }
    } else if (process.platform === 'win32') {
      body = `@echo onboarding isolation blocked undeclared command ${name} 1>&2\r\nexit /b 125\r\n`
    } else {
      body = `#!/bin/sh\nprintf '%s\\n' 'onboarding isolation blocked undeclared command ${name}' >&2\nexit 125\n`
    }
    writeFileSync(target, body)
    if (process.platform !== 'win32') {
      chmodSync(target, 0o755)
    }
  }
}

export function redact(value: string) {
  let result = value
  for (const [name, secret] of Object.entries(process.env)) {
    if (
      secret &&
      /(TOKEN|PASSWORD|SECRET|PRIVATE_KEY|PROXY|CA_CERT)/i.test(name)
    ) {
      result = result.replaceAll(secret, '[redacted]')
    }
  }
  return result
}
