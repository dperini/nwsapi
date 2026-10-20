import { access, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CommandRunner } from './scenario.mts'

export type BuildInventory = (
  checkout: string,
) => Promise<Array<{ output: string }>>

export async function targetBuildInventory(checkout: string) {
  const { buildRequiredFiles } = await import(
    pathToFileURL(path.join(checkout, 'scripts/repo/setup/build.mts')).href
  )
  return buildRequiredFiles() as Array<{ output: string }>
}

export async function exists(target: string) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export async function verifyBuildOutputs(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
  buildInventory: BuildInventory = targetBuildInventory,
) {
  for (const item of await buildInventory(checkout)) {
    const output = path.join(checkout, item.output)
    if (!(await exists(output)) || (await stat(output)).size === 0) {
      throw new Error(`Build output is missing or empty: ${item.output}.`)
    }
  }
  await command(
    log,
    'package manifest and export check',
    node,
    ['scripts/repo/build/manifest.mts'],
    checkout,
    env,
  )
  await command(
    log,
    'built engine module load smoke check',
    node,
    ['-e', "require('./dist/nwsapi.js')"],
    checkout,
    env,
  )
}
