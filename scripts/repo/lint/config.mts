export const OXLINT_CONFIG = '.config/oxlint.json'
export const OXLINT_CI_CONFIG = '.config/oxlint.ci.json'

export function lintConfigPath(environment: NodeJS.ProcessEnv = process.env) {
  return environment['NWSAPI_LINT_ALLOW_WARNINGS'] === 'true'
    ? OXLINT_CI_CONFIG
    : OXLINT_CONFIG
}
