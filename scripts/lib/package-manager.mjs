export function invokedByNonNpm(env = process.env) {
  const agent = env['npm_config_user_agent']?.trim()
  return Boolean(agent && !agent.startsWith('npm/'))
}

export function nonNpmPackageManagerMessage() {
  return (
    'This repository uses npm-compatible tooling; a non-npm package manager invoked this script.\n' +
    'Use `npm install` to preserve the workspace catalog, lockfile, and install policies.'
  )
}
