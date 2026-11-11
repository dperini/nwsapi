import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { git, gitEnvironment } from './git.mts'
import { outcomes, queueJob, readJob, runJob, saveOutcome } from './worker.mts'
import { runQuality } from './quality.mts'

export function schedule(root: string) {
  const job = queueJob(root)
  if (!job) {
    return
  }
  const log = openSync(path.join(job.directory, 'worker.log'), 'a')
  try {
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), '--worker', job.directory],
      {
        cwd: root,
        detached: true,
        stdio: ['ignore', log, log],
        env: { ...gitEnvironment(), QUALITY_FOLLOWUP_WORKER: '1' },
      },
    )
    child.on('error', error =>
      saveOutcome(job, { state: 'failed', message: error.message }),
    )
    child.unref()
    console.log(
      `[follow-up] Queued ${job.source.slice(0, 9)}. Status and log: ${job.directory}`,
    )
  } finally {
    closeSync(log)
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args[0] === '--worker' && args[1]) {
    process.env['QUALITY_FOLLOWUP_WORKER'] = '1'
    await runJob(readJob(args[1]), runQuality)
    return
  }
  if (args.includes('--help')) {
    console.log(
      'Usage: pnpm run commit:followup [status]\nQueue scoped background fixes, or list all jobs.\nFor a ready result, review its branch, then git cherry-pick the reported commit.\nFor a failed result, inspect worker.log in its job directory and repair its retained worktree.',
    )
    return
  }
  if (args.length && (args.length !== 1 || args[0] !== 'status')) {
    throw new Error('Expected no arguments, status, or --help.')
  }
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()
  if (args[0] === 'status') {
    console.log(JSON.stringify(outcomes(root), null, 2))
  } else {
    schedule(root)
  }
}

export function isMainModule(url: string) {
  return (
    process.argv[1] && url === pathToFileURL(path.resolve(process.argv[1])).href
  )
}

if (isMainModule(import.meta.url)) {
  main().catch(error => {
    console.error(`[follow-up] ${String(error)}`)
    process.exitCode = process.argv.includes('--worker') ? 1 : 0
  })
}
