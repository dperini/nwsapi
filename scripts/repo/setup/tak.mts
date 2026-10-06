import { execFileSync } from 'node:child_process'
import { isMainModule } from '../lib/run-node.mts'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }
import { toolPlan, toolPlatform, toolVersions } from '../external-tools.mts'
import { installTool } from './install.mts'
import { activateTool } from './tools.mts'

export async function setupTak() {
  const platform =
    toolPlatform() as keyof (typeof manifest.tools)['tak']['platforms']
  if (!manifest.tools['tak'].platforms[platform]) {
    throw new Error(`tak has no pinned binary for ${platform}.`)
  }
  const executable = await installTool(toolPlan('tak', platform))
  const actual = execFileSync(executable, ['--version'], {
    encoding: 'utf8',
  }).trim()
  const expected = toolVersions()['tak']!
  if (!actual.includes(expected)) {
    throw new Error(`Expected tak ${expected}, received ${actual}.`)
  }
  activateTool('tak', executable)
  return executable
}

if (isMainModule(import.meta.url)) {
  await setupTak()
  console.log(`Verified tak ${toolVersions()['tak']}.`)
}
