import path from 'node:path'

const repositoryContextVariables = [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
] as const

export function externalGitEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const childEnvironment = { ...environment }
  clearExternalGitContext(childEnvironment)
  return childEnvironment
}

export function clearExternalGitContext(environment: NodeJS.ProcessEnv): void {
  for (const variable of repositoryContextVariables) {
    delete environment[variable]
  }
}

export async function withoutExternalGitContext<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const inherited = new Map(
    repositoryContextVariables.map(variable => [
      variable,
      process.env[variable],
    ]),
  )
  clearExternalGitContext(process.env)
  try {
    return await operation()
  } finally {
    for (const [variable, value] of inherited) {
      if (value === undefined) {
        delete process.env[variable]
      } else {
        process.env[variable] = value
      }
    }
  }
}

const externalWptRunnerEntries = new Set([
  'scripts/repo/check/wpt/native/run.mts',
  'scripts/repo/check/wpt/native/pool.mts',
  'scripts/repo/check/wpt/native/scope.mts',
  'scripts/repo/wpt/native/update.mts',
])

export function isExternalWptRunner(entry: string, repositoryRoot: string) {
  const relative = path
    .relative(path.resolve(repositoryRoot), path.resolve(entry))
    .split(path.sep)
    .join('/')
  return externalWptRunnerEntries.has(relative)
}

export function targetsWptRepository(
  cwd: string,
  args: string[],
  repositoryRoot: string | undefined,
): boolean {
  if (!repositoryRoot) {
    return false
  }
  const wptCheckout = path.resolve(repositoryRoot, 'upstream/wpt')
  if (path.resolve(cwd) === wptCheckout) {
    return true
  }
  const checkoutIndex = args.indexOf('-C')
  if (
    checkoutIndex >= 0 &&
    args[checkoutIndex + 1] &&
    path.resolve(cwd, args[checkoutIndex + 1]!) === wptCheckout
  ) {
    return true
  }
  return (
    args[0] === 'clone' && path.resolve(cwd, args.at(-1) ?? '') === wptCheckout
  )
}
