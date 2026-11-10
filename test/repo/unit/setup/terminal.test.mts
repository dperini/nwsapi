import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as nodePty from 'node-pty'
import { createTerminal } from '@termless/core'
import { createXtermBackend } from '@termless/xtermjs'
import { optimize } from 'svgo'
import { expect, test } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const gallery = path.join(repoRoot, 'test/repo/unit/setup/gallery')
const cols = process.stdout.columns || 100
const rows = process.stdout.rows || 24

const pty = nodePty as unknown as {
  spawn: (
    file: string,
    args: string[],
    options: {
      cwd: string
      cols: number
      rows: number
      env: NodeJS.ProcessEnv
    },
  ) => {
    kill: () => void
    onData: (listener: (chunk: string) => void) => void
    onExit: (
      listener: (event: {
        exitCode: number
        signal: number | undefined
      }) => void,
    ) => void
  }
}

function runSetupHelp() {
  const terminal = createTerminal({
    backend: createXtermBackend(),
    cols,
    rows,
  })
  terminal.feed('\u001b[1;32m❯\u001b[0m pnpm run go -- --help\r\n')

  return new Promise<{
    exitCode: number
    signal: number | undefined
    output: string
    terminal: ReturnType<typeof createTerminal>
  }>((resolve, reject) => {
    let output = ''
    let settled = false
    const child = pty.spawn(
      path.join(repoRoot, '.cache/bin/pnpm'),
      ['run', 'go', '--', '--help'],
      {
        cwd: repoRoot,
        cols,
        rows,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          NO_COLOR: '1',
          SOCKET_SHIM_ACTIVE_PNPM: '1',
        },
      },
    )
    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error('pnpm setup help command timed out'))
    }, 10_000)

    function finish(
      error?: Error,
      result?: {
        exitCode: number
        signal: number | undefined
        output: string
        terminal: ReturnType<typeof createTerminal>
      },
    ) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error) {
        reject(error)
      } else if (result) {
        resolve(result)
      }
    }

    child.onData(chunk => {
      output += chunk
      terminal.feed(chunk)
    })
    child.onExit(({ exitCode, signal }) => {
      finish(undefined, { exitCode, signal, output, terminal })
    })
  })
}

test('v3 setup help runs through pnpm and generates optimized terminal gallery art', async () => {
  await mkdir(gallery, { recursive: true })
  const { exitCode, signal, output, terminal } = await runSetupHelp()
  try {
    const screen = terminal.getText()
    expect(exitCode, output).toBe(0)
    expect(signal).toBe(0)
    expect(screen).toContain('Usage: node scripts/repo/setup/bootstrap.mts')
    expect(screen).toContain('pnpm run go -- --help')
    expect(screen).toContain('pnpm run setup:tools')
    expect(screen).not.toContain('--tools-only')
    expect(screen).toContain('--dry-run')
    expect(screen).toContain('\n\n-h, --help')
    expect(screen).not.toContain('--no-voiceover')
    expect(screen.toLowerCase()).not.toMatch(/\bnpm\b/)

    // The command has exited. Place the emulator cursor on a clean line so it
    // cannot cover the final character in the screenshot.
    terminal.feed('\r\n')
    const usedRows = Math.min(rows, Math.max(1, terminal.getCursor().row + 1))
    terminal.resize(cols, usedRows)
    const svg = terminal.screenshotSvg({
      windowBar: 'colorful',
      fontFamily: "'SF Mono', 'Cascadia Code', monospace",
      fontSize: 14,
      padding: 18,
      borderRadius: 12,
    })
    const optimized = optimize(svg, { multipass: true }).data
    expect(optimized).toMatch(/^<svg\b/)
    expect(optimized).toContain('viewBox=')
    await writeFile(path.join(gallery, 'setup-bootstrap-help.svg'), optimized)
  } finally {
    await terminal.close()
  }

  await writeFile(
    path.join(gallery, 'index.html'),
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NWSAPI v3 Setup Terminal Gallery</title>
  <style>
    :root { color-scheme: dark; font: 16px/1.5 system-ui, sans-serif; background: #101319; color: #edf1f8; }
    body { max-width: 1100px; margin: 0 auto; padding: 40px 24px 64px; }
    h1 { margin: 0 0 8px; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    p { color: #aab4c4; margin: 0 0 28px; }
    figure { max-width: 1000px; margin: 0; padding: 14px; border: 1px solid #303846; border-radius: 16px; background: #191e27; }
    img { display: block; width: 100%; height: auto; border-radius: 10px; }
    figcaption { padding: 12px 4px 2px; color: #c8d1df; }
    code { color: #a8d8ff; }
  </style>
</head>
<body>
  <h1>NWSAPI v3 setup terminal</h1>
  <p>Captured from the pinned pnpm setup command with node-pty, rendered by Termless, and optimized by SVGO. Open this file directly; it needs no server.</p>
  <figure><img src="setup-bootstrap-help.svg" alt="Terminal screenshot of pnpm run go -- --help"><figcaption><code>pnpm run go -- --help</code></figcaption></figure>
</body>
</html>
`,
  )
})
