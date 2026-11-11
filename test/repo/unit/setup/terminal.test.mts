import {
  TASKS,
  REVIEW_TASKS,
  taskDisplayCommand,
} from '../../../../scripts/repo/develop/actions.mts'
import { createHash } from 'node:crypto'
import { mkdir, access } from 'node:fs/promises'
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
    write: (data: string) => void
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

async function matchGallerySnapshot(file: string, content: string) {
  const target = path.join(gallery, file)
  if (expect.getState().snapshotState.snapshotUpdateState !== 'all') {
    // Require explicit -u/--update even for a brand new image.
    await access(target)
  }
  await expect(content).toMatchFileSnapshot(target)
}

function runSetupHelp(
  displayCommand: string,
  args: string[],
  captureRows = rows,
) {
  const terminal = createTerminal({
    backend: createXtermBackend(),
    cols,
    rows: captureRows,
  })
  terminal.feed(`\u001b[1;32m❯\u001b[0m ${displayCommand}\r\n`)

  return new Promise<{
    exitCode: number
    signal: number | undefined
    output: string
    terminal: ReturnType<typeof createTerminal>
  }>((resolve, reject) => {
    let output = ''
    let settled = false
    const child = pty.spawn(path.join(repoRoot, '.cache/bin/pnpm'), args, {
      cwd: repoRoot,
      cols,
      rows: captureRows,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        NO_COLOR: '1',
        SOCKET_SHIM_ACTIVE_PNPM: '1',
        NWSAPI_WIZARD_ANIMATIONS: '0',
      },
    })
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

function runDeveloperWizard(
  previewKey?: string,
  fixture?: { selected: number; scenario: string },
) {
  const terminal = createTerminal({
    backend: createXtermBackend(),
    cols,
    rows,
  })
  const wizardCommand = 'pnpm run dev'
  terminal.feed(`\u001b[1;32m❯\u001b[0m ${wizardCommand}\r\n`)

  return new Promise<{
    exitCode: number
    signal: number | undefined
    svg: string
  }>((resolve, reject) => {
    let settled = false
    let svg: string | undefined
    const child = pty.spawn(
      fixture ? process.execPath : path.join(repoRoot, '.cache/bin/pnpm'),
      fixture
        ? [
            '--experimental-ffi',
            'test/repo/unit/setup/fixture/wizard.mts',
            String(fixture.selected),
            fixture.scenario,
          ]
        : ['run', 'dev'],
      {
        cwd: repoRoot,
        cols,
        rows,
        env: {
          ...process.env,
          TERM:
            fixture?.scenario === 'fallback-error' ? 'linux' : 'xterm-256color',
          NO_COLOR: '1',
          SOCKET_SHIM_ACTIVE_PNPM: '1',
          NWSAPI_WIZARD_ANIMATIONS: '0',
        },
      },
    )
    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error('pnpm developer wizard timed out'))
    }, 15_000)
    const preview = previewKey
      ? setTimeout(() => child.write(previewKey), 1500)
      : undefined
    const capture = setTimeout(() => {
      svg = terminal.screenshotSvg({
        windowBar: 'colorful',
        fontFamily: "'SF Mono', 'Cascadia Code', monospace",
        fontSize: 14,
        padding: 18,
        borderRadius: 12,
      })
      child.write('q')
    }, 2500)

    function finish(
      error?: Error,
      result?: { exitCode: number; signal: number | undefined },
    ) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      clearTimeout(capture)
      clearTimeout(preview)
      if (error) {
        reject(error)
      } else if (result && svg) {
        resolve({ ...result, svg })
      } else {
        reject(
          new Error('Developer wizard exited before its terminal capture.'),
        )
      }
      void terminal.close()
    }

    child.onData(chunk => terminal.feed(chunk))
    child.onExit(({ exitCode, signal }) =>
      finish(undefined, { exitCode, signal }),
    )
  })
}

test('v3 setup help and wizard match the optimized terminal gallery snapshots', async () => {
  await mkdir(gallery, { recursive: true })
  const plain = await runSetupHelp('pnpm run go --help', [
    'run',
    'go',
    '--help',
  ])
  const separated = await runSetupHelp('pnpm run go -- --help', [
    'run',
    'go',
    '--',
    '--help',
  ])
  const { exitCode, signal, output, terminal } = plain
  try {
    const screen = terminal.getText()
    const separatedScreen = separated.terminal.getText()
    const helpText = screen.slice(screen.indexOf('NWSAPI v3 setup wizard'))
    const separatedHelpText = separatedScreen.slice(
      separatedScreen.indexOf('NWSAPI v3 setup wizard'),
    )
    expect(exitCode, output).toBe(0)
    expect(signal).toBe(0)
    expect(separated.exitCode, separated.output).toBe(0)
    expect(separated.signal).toBe(0)
    expect(helpText).toBe(separatedHelpText)
    expect(screen).toContain('NWSAPI v3 setup wizard 🧙')
    expect(screen).toContain('NWSAPI v3 setup wizard 🧙\n\nUsage:')
    expect(screen).toContain('Usage: pnpm run go [')
    expect(screen).toContain('pnpm run go --help')
    expect(screen).toContain('pnpm run setup:tools')
    expect(screen).toContain('scripts/repo/setup/bootstrap.mts')
    expect(screen).toContain('\n\n  --voiceover')
    expect(screen).toMatch(/--voiceover\s+Opt in/)
    expect(screen).toMatch(/--dry-run\s+List planned/)
    expect(screen).not.toContain('--tools-only')
    expect(screen).toContain('--dry-run')
    expect(screen).toContain('  -h, --help')
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
    await matchGallerySnapshot('setup-bootstrap-help.svg', optimized)
  } finally {
    await terminal.close()
    await separated.terminal.close()
  }

  const wizard = await runDeveloperWizard(undefined, {
    selected: 0,
    scenario: 'ready',
  })
  expect(wizard.exitCode).toBe(0)
  expect(wizard.signal).toBe(0)
  const optimizedWizard = optimize(wizard.svg, { multipass: true }).data
  expect(optimizedWizard).toMatch(/^<svg\b/)
  expect(optimizedWizard).toContain('viewBox=')
  await matchGallerySnapshot('developer-wizard.svg', optimizedWizard)

  const optional = await runDeveloperWizard('5', {
    selected: 0,
    scenario: 'ready',
  })
  expect(optional.exitCode).toBe(0)
  expect(optional.signal).toBe(0)
  const optimizedOptional = optimize(optional.svg, { multipass: true }).data
  await matchGallerySnapshot('developer-wizard-optional.svg', optimizedOptional)

  const captures: Array<{ file: string; title: string; svg: string }> = []
  for (const [selected, task] of TASKS.entries()) {
    const capture = await runDeveloperWizard(undefined, {
      selected,
      scenario: 'ready',
    })
    expect(capture.exitCode).toBe(0)
    captures.push({
      file: `task-${task.script.replaceAll(':', '-')}.svg`,
      title: `${task.name} — ${taskDisplayCommand(task)}`,
      svg: optimize(capture.svg, { multipass: true }).data,
    })
  }
  for (const [selected, task] of REVIEW_TASKS.entries()) {
    const capture = await runDeveloperWizard(undefined, {
      selected,
      scenario: 'review-checks',
    })
    expect(capture.exitCode).toBe(0)
    captures.push({
      file: `review-${task.script.replaceAll(':', '-')}.svg`,
      title: `More checks: ${task.name}`,
      svg: optimize(capture.svg, { multipass: true }).data,
    })
  }
  for (const [scenario, selected] of [
    ['language-picker', 0],
    ['italian', 0],
    ['attention', 2],
    ['error', 2],
    ['disabled', 5],
    ['success', 0],
    ['info', 0],
    ['fallback-error', 2],
  ] as const) {
    const capture = await runDeveloperWizard(undefined, { selected, scenario })
    expect(capture.exitCode).toBe(0)
    captures.push({
      file: `status-${scenario}.svg`,
      title: `Example state: ${scenario}`,
      svg: optimize(capture.svg, { multipass: true }).data,
    })
  }
  for (const script of [
    'setup',
    'dev',
    'guide',
    'review',
    'ci:local',
    'setup:check',
    'voiceover',
  ]) {
    const commandScript = script === 'setup' ? 'go' : script
    const label = `pnpm run ${commandScript} --help`
    const help = await runSetupHelp(label, ['run', commandScript, '--help'], 80)
    try {
      expect(help.exitCode, help.output).toBe(0)
    } finally {
      await help.terminal.close()
    }
    const capture = await runDeveloperWizard(undefined, {
      selected: 0,
      scenario: `help:${script}`,
    })
    expect(capture.exitCode).toBe(0)
    captures.push({
      file: `help-${script.replaceAll(':', '-')}.svg`,
      title: label,
      svg: optimize(capture.svg, { multipass: true }).data,
    })
  }
  for (const capture of captures) {
    await matchGallerySnapshot(capture.file, capture.svg)
  }

  // A design sample, not a claim about this checkout's current state.
  const palette = createTerminal({
    backend: createXtermBackend(),
    cols,
    rows: 13,
  })
  const samples = [
    ['4285f4', 'Neutral', 'Available'],
    ['34a853', 'Ready', 'Required tools are available'],
    ['fbbc05', 'Needs attention', 'Setup or configuration needed'],
    ['ea4335', 'Needs fixing', 'A task failed'],
    ['9aa0a6', 'Disabled', 'Cannot run'],
    ['c4b5fd', 'Optional', 'Preview label; status keeps its own color'],
  ]
  const colored = (hex: string, value: string) => {
    const rgb = hex.match(/../g)!.map(part => parseInt(part, 16))
    return `\u001b[38;2;${rgb.join(';')}m${value}\u001b[0m`
  }
  palette.feed('\r\n  Wizard colors — design sample\r\n\r\n')
  for (const [hex, label, description] of samples) {
    palette.feed(
      `  ${colored(hex!, '●')}  ${colored(hex!, label!.padEnd(18))} ${description}\r\n`,
    )
  }
  palette.feed(
    '\r\n  Status hints expand on highlight. Optional is a separate preview label.\r\n',
  )
  const optimizedPalette = optimize(
    palette.screenshotSvg({
      windowBar: 'colorful',
      fontFamily: "'SF Mono', 'Cascadia Code', monospace",
      fontSize: 14,
      padding: 18,
      borderRadius: 12,
    }),
    { multipass: true },
  ).data
  await palette.close()
  await matchGallerySnapshot('wizard-colors.svg', optimizedPalette)

  await matchGallerySnapshot(
    'index.html',
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
    figure { max-width: 1000px; margin: 0 0 20px; padding: 14px; border: 1px solid #303846; border-radius: 16px; background: #191e27; }
    img { display: block; width: 100%; height: auto; border-radius: 10px; }
    figcaption { padding: 12px 4px 2px; color: #c8d1df; }
    code { color: #a8d8ff; }
  </style>
</head>
<body>
  <h1>NWSAPI v3 setup terminal</h1>
  <p>All six wizard tasks, status states, and command options. Task previews use fixture data and never execute tasks. Help panels use the wizard UI; tests also check the real help commands. Rendered by Termless and optimized by SVGO.</p>
  <figure><img src="wizard-colors.svg?v=${createHash('sha256').update(optimizedPalette).digest('hex').slice(0, 12)}" alt="All six wizard colors with their meanings"><figcaption>Color mockup — all states shown together for comparison.</figcaption></figure>

  <figure><img src="developer-wizard.svg?v=${createHash('sha256').update(optimizedWizard).digest('hex').slice(0, 12)}" alt="Terminal screenshot of the NWSAPI v3 developer wizard"><figcaption><code>pnpm run dev</code></figcaption></figure>
  <figure><img src="developer-wizard-optional.svg?v=${createHash('sha256').update(optimizedOptional).digest('hex').slice(0, 12)}" alt="Optional task selected with Optional shown only in its preview"><figcaption>Optional task highlighted — press 5 to preview troubleshooting.</figcaption></figure>
  ${captures.map(capture => `<figure><img loading="lazy" src="${capture.file}?v=${createHash('sha256').update(capture.svg).digest('hex').slice(0, 12)}" alt="${capture.title}"><figcaption>${capture.title}</figcaption></figure>`).join('\n')}
</body>
</html>
`,
  )
}, 120_000)

test('the real pnpm wizard starts and quits without running a task', async () => {
  const result = await runDeveloperWizard()
  expect(result.exitCode).toBe(0)
  expect(result.signal).toBe(0)
})
