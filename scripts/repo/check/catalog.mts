import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse, parseAllDocuments } from 'yaml'
import { REPO_ROOT } from '../lib/paths.mts'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }

export function checkCatalog(root = REPO_ROOT) {
  const workspace = parse(
    readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'),
  ) as { catalog: Record<string, string> }
  const pkg = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as {
    packageManager: string
    devDependencies: Record<string, string>
    devEngines: { packageManager: Array<{ version: string }> }
  }
  for (const [name, spec] of Object.entries(pkg.devDependencies)) {
    if (name.startsWith('@socketsecurity/lib')) {
      throw new Error('Inline the required Socket library helpers locally.')
    }
    if (
      spec !== 'catalog:' ||
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(workspace.catalog[name] ?? '')
    ) {
      throw new Error(`${name} must use an exact pinned catalog version.`)
    }
  }
  if (
    pkg.packageManager !== `pnpm@${manifest.tools.pnpm.version}` ||
    pkg.devEngines.packageManager[0]?.version !== manifest.tools.pnpm.version
  ) {
    throw new Error(
      'The pnpm package-manager pin differs from external-tools.json.',
    )
  }
  if (
    workspace.catalog['ecc-agentshield'] !== manifest.tools.agentshield.version
  ) {
    throw new Error('AgentShield catalog and external-tool pins differ.')
  }
  const documents = parseAllDocuments(
    readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8'),
  )
  const packages = documents.flatMap(document => {
    if (document.errors.length) {
      throw new Error('Invalid pnpm lockfile.')
    }
    const data = document.toJSON() as {
      packages?: Record<string, { resolution: { integrity?: string } }>
    }
    return Object.entries(data.packages ?? {})
  })
  const lock = { packages: Object.fromEntries(packages) }
  if (
    lock.packages[`ecc-agentshield@${manifest.tools.agentshield.version}`]
      ?.resolution.integrity !== manifest.tools.agentshield.integrity
  ) {
    throw new Error(
      'AgentShield lockfile integrity differs from external-tools.json.',
    )
  }
}
