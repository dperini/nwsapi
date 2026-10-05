import { REPO_ROOT } from '../lib/paths.mts'
import { checked, execute } from '../lib/command.mts'
import type { CommandRunner } from '../lib/command.mts'
import { RELEASE } from './config.mts'
import { npmCommand, npmRead } from './registry.mts'

export interface Publisher {
  id: string
  type: string
  permissions: string[]
  claims: {
    repository?: string
    environment?: string
    workflow_ref?: { file?: string }
  }
}

export function parsePublisher(value: unknown): Publisher {
  if (!value || typeof value !== 'object') {
    throw new Error('Unrecognized trusted-publisher configuration.')
  }
  const row = value as Record<string, unknown>
  if (
    typeof row['id'] !== 'string' ||
    typeof row['type'] !== 'string' ||
    !Array.isArray(row['permissions']) ||
    row['permissions'].some(permission => typeof permission !== 'string')
  ) {
    throw new Error('Unrecognized trusted-publisher configuration.')
  }
  const claims = row['claims'] ?? {
    repository: row['repository'],
    environment: row['environment'],
    workflow_ref: { file: row['file'] },
  }
  if (!claims || typeof claims !== 'object') {
    throw new Error('Unrecognized trusted-publisher claims.')
  }
  return {
    id: row['id'],
    type: row['type'],
    permissions: row['permissions'],
    claims,
  }
}

export function parsePublishers(output: string): Publisher[] {
  if (!output.trim()) {
    return []
  }
  // npm prints separate pretty-printed objects, with a blank line between publishers.
  return output
    .trim()
    .split(/\r?\n[ \t]*\r?\n/)
    .flatMap(block => {
      const data: unknown = JSON.parse(block)
      return (Array.isArray(data) ? data : [data]).map(parsePublisher)
    })
}

export function isV3Publisher(publisher: Publisher) {
  return (
    publisher.type === 'github' &&
    publisher.claims.repository === RELEASE.repository &&
    publisher.claims.environment === RELEASE.environment &&
    publisher.claims.workflow_ref?.file === RELEASE.workflow
  )
}

export function matchesPublisher(publisher: Publisher) {
  return (
    isV3Publisher(publisher) &&
    publisher.permissions.length === 1 &&
    publisher.permissions[0] === 'createStagedPackage'
  )
}

export function trustArguments() {
  return [
    'trust',
    'github',
    RELEASE.package,
    '--file',
    RELEASE.workflow,
    '--repository',
    RELEASE.repository,
    '--environment',
    RELEASE.environment,
    '--allow-stage-publish',
    '--yes',
  ]
}

export function environmentPlan(environment: unknown, policies: unknown) {
  const current = environment as
    | {
        deployment_branch_policy?: {
          custom_branch_policies?: boolean
          protected_branches?: boolean
        }
      }
    | undefined
  const branches = policies as
    | { branch_policies?: Array<{ name: string; type: string }> }
    | undefined
  if (
    current &&
    (current.deployment_branch_policy?.custom_branch_policies !== true ||
      current.deployment_branch_policy.protected_branches !== false)
  ) {
    throw new Error(
      'The existing publish-npm environment needs custom branch policies. Preserve its review rules and add the v3 branch before continuing.',
    )
  }
  const rows = branches?.branch_policies ?? []
  if (rows.some(row => row.type !== 'branch' || /[*!?\[\]]/.test(row.name))) {
    throw new Error(
      'The publishing environment has a broad or non-branch policy. Review it before continuing.',
    )
  }
  return {
    create: !current,
    addBranch: !rows.some(row => row.name === RELEASE.branch),
    branch: RELEASE.branch,
  }
}

export function setupEnvironment(
  apply: boolean,
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  const endpoint = `repos/${RELEASE.repository}/environments/${RELEASE.environment}`
  const result = run('gh', ['api', endpoint], { cwd: root })
  if (result.status !== 0 && !/HTTP 404/.test(result.stderr)) {
    throw new Error('Cannot read the GitHub publishing environment.')
  }
  const current: unknown =
    result.status === 0 ? JSON.parse(result.stdout) : undefined
  const policies = current
    ? JSON.parse(
        checked(
          'gh',
          ['api', `${endpoint}/deployment-branch-policies`],
          { cwd: root },
          run,
        ),
      )
    : undefined
  const plan = environmentPlan(current, policies)
  if (apply && plan.create) {
    checked(
      'gh',
      [
        'api',
        '--method',
        'PUT',
        endpoint,
        '-F',
        'deployment_branch_policy[protected_branches]=false',
        '-F',
        'deployment_branch_policy[custom_branch_policies]=true',
      ],
      { cwd: root },
      run,
    )
  }
  if (apply && plan.addBranch) {
    checked(
      'gh',
      [
        'api',
        '--method',
        'POST',
        `${endpoint}/deployment-branch-policies`,
        '-f',
        `name=${RELEASE.branch}`,
        '-f',
        'type=branch',
      ],
      { cwd: root },
      run,
    )
  }
  if (apply) {
    const observed = JSON.parse(
      checked('gh', ['api', endpoint], { cwd: root }, run),
    )
    const observedPolicies = JSON.parse(
      checked(
        'gh',
        ['api', `${endpoint}/deployment-branch-policies`],
        { cwd: root },
        run,
      ),
    )
    const verified = environmentPlan(observed, observedPolicies)
    if (verified.create || verified.addBranch) {
      throw new Error('GitHub publishing environment did not verify.')
    }
  }
  return plan
}

export function configureTrust(
  apply: boolean,
  root = REPO_ROOT,
  run: CommandRunner = execute,
) {
  const environment = setupEnvironment(apply, root, run)
  const read = () =>
    parsePublishers(
      npmRead(['trust', 'list', RELEASE.package, '--json'], { run }),
    )
  const before = read()
  const matching = before.filter(matchesPublisher)
  const stale = before.filter(
    publisher => isV3Publisher(publisher) && !matchesPublisher(publisher),
  )
  if (matching.length > 1) {
    throw new Error(
      'Multiple canonical v3 publishers exist. Resolve the duplicate before updating trust.',
    )
  }
  if (apply && matching.length === 0) {
    npmCommand(trustArguments(), { run, interactive: true })
    if (read().filter(matchesPublisher).length !== 1) {
      throw new Error(
        'The new stage-only OIDC binding did not verify. Existing publishers were retained.',
      )
    }
  }
  if (apply) {
    for (const publisher of stale) {
      npmCommand(['trust', 'revoke', RELEASE.package, `--id=${publisher.id}`], {
        run,
        interactive: true,
      })
    }
    const final = read().filter(isV3Publisher)
    if (final.length !== 1 || !matchesPublisher(final[0]!)) {
      throw new Error(
        'Stage-only OIDC settings did not verify after migration.',
      )
    }
  }
  return {
    environment,
    publisher: RELEASE,
    apply,
    staleIds: stale.map(publisher => publisher.id),
    matches: matching.length === 1 && stale.length === 0,
  }
}
