import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { assertHarnessResult, parseHarnessJson } from './protocol.mts'
import type { GuideOutcome } from './scenario.mts'

export async function startGuide(
  file: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  execution: string[],
  redact: (value: string) => string,
): Promise<GuideOutcome> {
  const port = await unusedPort()
  const args = execution.slice(1)
  const url = `http://127.0.0.1:${port}/`
  const child = spawn(node, args, {
    cwd: checkout,
    env: { ...env, NWSAPI_GUIDE_NO_OPEN: '1', PORT: String(port) },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  let spawnFailure: Error | undefined
  child.stdout.setEncoding('utf8').on('data', chunk => {
    stdout += chunk
  })
  child.stderr.setEncoding('utf8').on('data', chunk => {
    stderr += chunk
  })
  child.once('error', error => {
    spawnFailure = error
  })
  let cancelled: NodeJS.Signals | undefined
  const cancel = (signal: NodeJS.Signals) => {
    cancelled = signal
    terminateTree(child, signal)
  }
  const onInterrupt = () => cancel('SIGINT')
  const onTerminate = () => cancel('SIGTERM')
  process.once('SIGINT', onInterrupt)
  process.once('SIGTERM', onTerminate)
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>(resolve =>
    child.once('close', (code, signal) => resolve({ code, signal })),
  )
  let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined
  try {
    const page = await waitForGuide(
      url,
      child,
      () => spawnFailure,
      () => stderr,
    )
    const moduleStatuses = await verifyGuidePage(page, url)
    terminateTree(child, 'SIGTERM')
    exit = await stopBounded(child, closed)
    const result = parseHarnessJson(stdout)
    assertHarnessResult(result, 'stopped', exit.code, 'guide')
    await writeFile(
      file,
      redact(
        `\n## guide persistent session\nHTTP ${page.status}; modules HTTP ${moduleStatuses.join(',')}; SIGTERM child code=${exit.code} signal=${exit.signal}\nstdout=${stdout}\nstderr=${stderr}\n`,
      ),
      { flag: 'a' },
    )
    if (exit.code !== 143 && exit.signal !== 'SIGTERM') {
      throw new Error(
        `Guide runner cleanup unexpected: ${JSON.stringify(exit)}.`,
      )
    }
    await assertGuideStopped(url)
    if (cancelled) {
      throw new Error(`Guide runner cancelled by ${cancelled}.`)
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      terminateTree(child, 'SIGTERM')
      await stopBounded(child, closed)
    }
    process.removeListener('SIGINT', onInterrupt)
    process.removeListener('SIGTERM', onTerminate)
  }
  if (!exit) {
    throw new Error('Guide task finished without a shutdown result.')
  }
  return { command: execution.join(' '), code: exit.code }
}

async function waitForGuide(
  url: string,
  child: ReturnType<typeof spawn>,
  getSpawnFailure: () => Error | undefined,
  getStderr: () => string,
) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (response.ok) {
        return response
      }
    } catch {
      /* server is still starting */
    }
    await delay(300)
  }
  throw new Error(
    `Guide did not become ready. ${getSpawnFailure()?.message ?? getStderr().slice(-2000)}`,
  )
}

async function verifyGuidePage(page: Response, url: string) {
  const contentType = page.headers.get('content-type') ?? ''
  const html = await page.text()
  if (
    !contentType.includes('text/html') ||
    !/<html\b/i.test(html) ||
    !/<title\b/i.test(html)
  ) {
    throw new Error('Guide route returned an invalid HTML document.')
  }
  const modulePaths = [
    ...html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/gi),
  ].map(match => match[1]!)
  if (modulePaths.length === 0) {
    throw new Error('Guide page has no module entry point.')
  }
  return fetchGuideModules(modulePaths, url)
}

async function assertGuideStopped(url: string) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) })
  } catch {
    return
  }
  throw new Error(
    'Guide server is still accepting connections after runner shutdown.',
  )
}

async function fetchGuideModules(modulePaths: string[], baseUrl: string) {
  const statuses: number[] = []
  for (const modulePath of modulePaths) {
    const response = await fetch(new URL(modulePath, baseUrl), {
      signal: AbortSignal.timeout(5000),
    })
    const body = await response.text()
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('javascript') ||
      !body.trim()
    ) {
      throw new Error(`Guide module ${modulePath} did not load as JavaScript.`)
    }
    statuses.push(response.status)
  }
  return statuses
}

async function stopBounded(
  child: ReturnType<typeof spawn>,
  closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>,
) {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    closed,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        terminateTree(child, 'SIGKILL')
        reject(
          new Error('Guide harness did not stop within 10s after SIGTERM.'),
        )
      }, 10_000)
    }),
  ]).finally(() => clearTimeout(timer))
}

function terminateTree(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
) {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      /* the process group may have exited */
    }
  }
  if (process.platform === 'win32' && child.pid) {
    const taskkill = path.join(
      process.env['SystemRoot'] ?? 'C:\\Windows',
      'System32',
      'taskkill.exe',
    )
    const result = spawnSync(
      taskkill,
      ['/PID', String(child.pid), '/T', '/F'],
      {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5000,
      },
    )
    if (result.status === 0) {
      return
    }
  }
  child.kill(signal)
}

function delay(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}

async function unusedPort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Cannot allocate an ephemeral guide port.')
  }
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
  return address.port
}
