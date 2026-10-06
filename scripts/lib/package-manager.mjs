export function requireNpm(userAgent) {
  if (!userAgent || userAgent.trim().startsWith('npm/')) return

  const error = new Error('Non-npm package manager detected: run `npm install`.')
  error.code = 'ERR_NON_NPM_PACKAGE_MANAGER'
  throw error
}
