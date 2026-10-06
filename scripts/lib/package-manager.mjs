export function invokedByNonNpm(env = process.env) {
  const agent = env['npm_config_user_agent']?.trim()
  return Boolean(agent && !agent.startsWith('npm/'))
}

export function nonNpmPackageManagerMessage() {
  return (
    'Non-npm package manager detected: this repository uses npm tooling.\n' +
    'Use `npm install` to preserve the package lockfile and install policies.'
  )
}
