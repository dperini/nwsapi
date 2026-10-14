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
  for (const variable of repositoryContextVariables) {
    delete childEnvironment[variable]
  }
  return childEnvironment
}
import path from 'node:path'

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
