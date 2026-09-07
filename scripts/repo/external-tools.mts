import { appendFileSync } from 'node:fs'
import manifest from '../../.config/external-tools.json' with { type: 'json' }
import { isMainModule } from './lib/run-node.mts'

export function toolVersions(data = manifest) {
  const versions: Record<string, string> = { __proto__: null }
  for (const name of ['node', 'npm', 'pnpm']) {
    const tool = data.tools[name]
    if (
      tool?.origin !== 'system' ||
      typeof tool.version !== 'string' ||
      !/^[0-9]+(?:\.[0-9]+){0,2}$/.test(tool.version)
    ) {
      throw new Error(`Invalid external tool configuration: ${name}`)
    }
    versions[name] = tool.version
  }
  return versions
}

if (isMainModule(import.meta.url)) {
  const versions = toolVersions()
  if (process.argv.includes('--github-output')) {
    if (!process.env.GITHUB_OUTPUT) {
      throw new Error('GITHUB_OUTPUT is required.')
    }
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(versions)
        .map(([name, version]) => `${name}=${version}\n`)
        .join(''),
    )
  } else {
    console.log(JSON.stringify(versions))
  }
}
