import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { prepareVideo, VIDEO_PROJECT } from './prepare.mts'
import { videoEnvironment } from './toolchain.mts'

export function describeVideo() {
  return {
    schemaVersion: 1,
    type: 'command',
    name: 'video',
    description: 'Build or run the locked video renderer.',
    options: ['--json', '--describe', '--dry-run'],
    mutates: true,
  }
}

export function videoPlan(args: string[], root = REPO_ROOT) {
  const setup = args.includes('--setup')
  const actionArgs = args.filter(
    arg => !['--setup', '--dry-run', '--json'].includes(arg),
  )
  const cargoArgs = [
    setup ? 'build' : 'run',
    '--release',
    '--locked',
    '--manifest-path',
    path.join(root, '.config/video/Cargo.toml'),
    '--example',
    'walkthrough',
    ...(setup ? [] : ['--', ...actionArgs]),
  ]
  return {
    schemaVersion: 1,
    type: 'preview',
    command: setup ? 'setup/video' : 'video',
    steps: [
      'Download and verify the pinned fframes crate.',
      setup
        ? 'Build the locked release renderer.'
        : 'Run the requested video renderer action.',
    ],
    invocation: { command: 'cargo', args: cargoArgs },
    targets: [
      path.join(root, '.cache/fframes/archives'),
      path.join(root, '.cache/fframes/target'),
    ],
  }
}

export async function main(args = process.argv.slice(2)) {
  const controls = parseVideoArguments(args)
  if (!controls.args.length || controls.help) {
    console.log(`Usage: pnpm run video <command> [options]
Commands: timeline, inspect, strip, frame, render, preview, audio
pnpm run setup:video    Download locked dependencies and build the renderer.
pnpm run video:render   Render assets/repo/video/v3-walkthrough.mp4.
pnpm run video:preview  Open the video webpage through Portless.
pnpm run video:player   Open the native frame-by-frame player.
Requires Rust/Cargo 1.98+ and native fframes GPU/FFmpeg prerequisites.
See docs/repo/development/video.md.`)
    return
  }
  if (controls.describe) {
    const description = describeVideo()
    console.log(
      controls.json ? JSON.stringify(description) : description.description,
    )
    return
  }
  if (controls.dryRun) {
    const plan = videoPlan(controls.args)
    console.log(controls.json ? JSON.stringify(plan) : formatVideoPlan(plan))
    return
  }
  args = controls.args
  await prepareVideo()
  const { cargo, env } = videoEnvironment()
  const setup = args[0] === '--setup'
  const command = [
    setup ? 'build' : 'run',
    '--release',
    '--locked',
    '--manifest-path',
    path.join(VIDEO_PROJECT, 'Cargo.toml'),
    '--example',
    'walkthrough',
    ...(setup ? [] : ['--', ...args]),
  ]
  const result = spawnSync(cargo, command, {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  process.exitCode = result.status ?? 1
}

export function parseVideoArguments(args: string[]) {
  const controls = { json: false, describe: false, dryRun: false, help: false }
  const forwarded: string[] = []
  for (const arg of args) {
    if (arg === '--json') {
      controls.json = true
    } else if (arg === '--describe') {
      controls.describe = true
    } else if (arg === '--dry-run') {
      controls.dryRun = true
    } else if (arg === '--help' || arg === '-h') {
      controls.help = true
    } else {
      forwarded.push(arg)
    }
  }
  if (controls.describe && controls.dryRun) {
    throw new Error('Choose --describe or --dry-run.')
  }
  return { ...controls, args: forwarded }
}

export function formatVideoPlan(plan: ReturnType<typeof videoPlan>) {
  return [
    `Would run ${plan.command}:`,
    `  ${plan.invocation.command} ${plan.invocation.args.join(' ')}`,
    ...plan.steps.map(step => `  ${step}`),
    'Targets:',
    ...plan.targets.map(target => `  ${target}`),
  ].join('\n')
}

if (isMainModule(import.meta.url)) {
  await main()
}
