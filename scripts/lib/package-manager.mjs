export function invokedByNonNpm(env = process.env) {
  const agent = env['npm_config_user_agent']?.trim()
  return Boolean(agent && !agent.startsWith('npm/'))
}

export function nonNpmPackageManagerMessage() {
  return (
    'This v2 checkout uses npm and package-lock.json. A different package manager invoked installation.\n' +
    'Run `node scripts/setup.mjs` to provision compatible checkout tools and install dependencies.\nDo not install a package named preinstall. It is an install hook, not a prerequisite.'
  )
}
