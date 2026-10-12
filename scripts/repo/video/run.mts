import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { prepareVideo, VIDEO_PROJECT } from './prepare.mts'
import { videoEnvironment } from './toolchain.mts'

export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
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

if (isMainModule(import.meta.url)) {
  await main()
}
