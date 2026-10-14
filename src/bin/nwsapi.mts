#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { runCli } from '../../scripts/repo/cli.mts'
import { interactiveActions } from '../../scripts/repo/cli/ui/actions.mts'
import { currentOpenTuiTarget } from '../../scripts/repo/cli/ui/target.mts'
import {
  canStartTui,
  launchTui,
  selectTuiRuntime,
} from '../../scripts/repo/cli/ui/launcher.mts'
import type { TuiRuntime } from '../../scripts/repo/cli/ui/launcher.mts'
import {
  formatCliOutput,
  isCompatibleNodeVersion,
  jsonArguments,
  shouldUseColor,
} from '../../scripts/repo/cli/ui/terminal.mts'

const ACTIONS = interactiveActions

function nativeAssetPath(directory: string) {
  const library =
    process.platform === 'darwin'
      ? 'libopentui.dylib'
      : process.platform === 'linux'
        ? 'libopentui.so'
        : 'opentui.dll'
  const suffix =
    process.platform === 'linux' && currentOpenTuiLibc() === 'musl'
      ? '-musl'
      : ''
  const packageName = `@opentui/core-${process.platform}-${process.arch}${suffix}`
  return path.join(directory, 'assets', packageName, library)
}

function currentOpenTuiLibc() {
  try {
    return currentOpenTuiTarget().libc
  } catch {
    return undefined
  }
}

function probeRuntime(command: string): TuiRuntime | undefined {
  const version = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    timeout: 3000,
    windowsHide: true,
  })
  if (version.status !== 0 || !version.stdout) {
    return undefined
  }
  const value = version.stdout.trim()
  if (!isCompatibleNodeVersion(value)) {
    return undefined
  }
  const ffi = spawnSync(command, ['--experimental-ffi', '-e', ''], {
    encoding: 'utf8',
    timeout: 3000,
    windowsHide: true,
  })
  return ffi.status === 0 ? { command, version: value } : undefined
}

function tuiRuntime(directory: string) {
  const libc = currentOpenTuiLibc()
  if (
    !canStartTui({
      inputIsTTY: Boolean(process.stdin.isTTY),
      outputIsTTY: Boolean(process.stdout.isTTY),
      columns: process.stdout.columns,
      rows: process.stdout.rows,
      platform: process.platform,
      arch: process.arch,
      ...(libc === undefined ? {} : { libc }),
      env: process.env,
      assetAvailable: existsSync(nativeAssetPath(directory)),
    })
  ) {
    return undefined
  }
  return selectTuiRuntime(
    process.execPath,
    process.env['NODE_EXECUTABLE'],
    probeRuntime,
  )
}

function selectedAction(value: string) {
  const selected = Number(value.trim() || '1') - 1
  return Number.isInteger(selected) && ACTIONS[selected] ? selected : undefined
}

function showOutput(output: string, argv: readonly string[]) {
  const color = shouldUseColor({
    isTTY: Boolean(process.stdout.isTTY),
    env: process.env,
    json: jsonArguments(argv),
  })
  console.log(formatCliOutput(output, color))
}

async function runPlainMenu() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    showOutput(await runCli([]), [])
    return 0
  }
  const color = shouldUseColor({ isTTY: true, env: process.env })
  console.log(formatCliOutput('nwsapi / Command menu', color))
  for (let index = 0, length = ACTIONS.length; index < length; index += 1) {
    const action = ACTIONS[index]!
    console.log(`  ${index + 1}. ${action.label}  ${action.command}`)
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    const answer = await prompt.question(
      'Choose 1–4, or press Enter for help: ',
    )
    const index = selectedAction(answer)
    if (index === undefined) {
      console.error(`Choose a number from 1 to ${ACTIONS.length}.`)
      return 1
    }
    const action = ACTIONS[index]!
    console.log(`Command: ${action.command}`)
    const args = [...action.args]
    if (action.prompt) {
      const selector = (await prompt.question(action.prompt)).trim()
      if (!selector) {
        console.log('No selector entered. No command was run.')
        return 0
      }
      args.push(selector)
    }
    try {
      showOutput(await runCli(args), args)
      return 0
    } catch (error) {
      const message = `nwsapi: ${error instanceof Error ? error.message : String(error)}`
      const errorColor = shouldUseColor({
        isTTY: Boolean(process.stderr.isTTY),
        env: process.env,
        json: jsonArguments(args),
      })
      console.error(formatCliOutput(message, errorColor, true))
      return 1
    }
  } finally {
    prompt.close()
  }
}

async function runNoArguments() {
  const executable = process.argv[1] || '.'
  const directory = path.dirname(realpathSync(executable))
  const runtime = tuiRuntime(directory)
  if (!runtime) {
    return runPlainMenu()
  }
  const exitCode = await launchTui(
    runtime,
    path.join(directory, 'tui.mjs'),
    path.join(directory, 'assets'),
  )
  if (exitCode !== 78) {
    return exitCode
  }
  console.error('The visual menu is unavailable. Opening the numbered menu.')
  return runPlainMenu()
}

async function main() {
  const argv = process.argv.slice(2)
  try {
    if (argv.length === 0) {
      return await runNoArguments()
    }
    showOutput(await runCli(argv), argv)
    return 0
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return 130
    }
    const message = `nwsapi: ${error instanceof Error ? error.message : String(error)}`
    const color = shouldUseColor({
      isTTY: Boolean(process.stderr.isTTY),
      env: process.env,
      json: jsonArguments(argv),
    })
    console.error(formatCliOutput(message, color, true))
    return 1
  }
}

main()
  .then(code => {
    process.exitCode = code
  })
  .catch(error => {
    console.error(
      `nwsapi: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  })
