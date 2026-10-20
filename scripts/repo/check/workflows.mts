import { existsSync, globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { REPO_ROOT } from '../lib/paths.mts'

const PINNED_EXTERNAL_ACTIONS = new Map([
  ['actions/cache', '55cc8345863c7cc4c66a329aec7e433d2d1c52a9'],
  ['actions/checkout', 'de0fac2e4500dabe0009e67214ff5f5447ce83dd'],
  ['actions/setup-node', '249970729cb0ef3589644e2896645e5dc5ba9c38'],
])

export function actionReferences(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return []
  }
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'uses' ? [String(child)] : actionReferences(child),
  )
}

export function checkReusableWorkflow(
  root: string,
  source: string,
  reference: string,
  workflows: string,
) {
  if (!reference.startsWith('./.github/workflows/')) {
    return false
  }

  const workflow = path.resolve(root, reference)
  if (
    !workflow.startsWith(workflows) ||
    !existsSync(workflow) ||
    !['.yml', '.yaml'].includes(path.extname(workflow))
  ) {
    throw new Error(
      `${source}: local reusable workflow is missing: ${reference}`,
    )
  }
  const reusable = parse(readFileSync(workflow, 'utf8'))
  if (!Object.hasOwn(reusable.on ?? {}, 'workflow_call')) {
    throw new Error(`${source}: local workflow is not reusable: ${reference}`)
  }
  return true
}

export function checkInlineWorkflows(root = REPO_ROOT) {
  const files = globSync('.github/{workflows,actions}/**/*.{yml,yaml}', {
    cwd: root,
  })
  const actions = path.join(root, '.github', 'actions') + path.sep
  const workflows = path.join(root, '.github', 'workflows') + path.sep
  for (const file of files) {
    const data = parse(readFileSync(path.join(root, file), 'utf8'))
    for (const reference of actionReferences(data)) {
      if (checkReusableWorkflow(root, file, reference, workflows)) {
        continue
      }
      const [action, revision, ...extra] = reference.split('@')
      if (
        action &&
        revision &&
        !extra.length &&
        PINNED_EXTERNAL_ACTIONS.get(action) === revision
      ) {
        continue
      }
      const directory = path.resolve(root, reference)
      if (
        !reference.startsWith('./.github/actions/') ||
        !directory.startsWith(actions)
      ) {
        throw new Error(
          `${file}: ${reference} must use a local action or an approved immutable pin.`,
        )
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
