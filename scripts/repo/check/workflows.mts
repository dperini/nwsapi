import { existsSync, globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { REPO_ROOT } from '../lib/paths.mts'

export function actionReferences(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return []
  }
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'uses' ? [String(child)] : actionReferences(child),
  )
}

export function checkInlineWorkflows(root = REPO_ROOT) {
  const files = globSync('.github/{workflows,actions}/**/*.{yml,yaml}', {
    cwd: root,
  })
  const actions = path.join(root, '.github', 'actions') + path.sep
  for (const file of files) {
    const data = parse(readFileSync(path.join(root, file), 'utf8'))
    for (const reference of actionReferences(data)) {
      const directory = path.resolve(root, reference)
      if (
        !reference.startsWith('./.github/actions/') ||
        !directory.startsWith(actions)
      ) {
        throw new Error(`${file}: ${reference} must use a local action.`)
      }
      if (
        !['action.yml', 'action.yaml'].some(name =>
          existsSync(path.join(directory, name)),
        )
      ) {
        throw new Error(`${file}: local action is missing: ${reference}`)
      }
    }
  }
}
