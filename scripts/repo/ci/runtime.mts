import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'

export function escapeWorkflowValue(value: string) {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
}

export function exposeRuntime(
  env = process.env,
  output = (line: string) => {
    process.stdout.write(line)
  },
) {
  const url = env['ACTIONS_RESULTS_URL']
  const token = env['ACTIONS_RUNTIME_TOKEN']
  const file = env['GITHUB_ENV']
  if (!url || !token || !file) {
    throw new Error('The runner did not provide the Actions artifact runtime.')
  }
  output(`::add-mask::${escapeWorkflowValue(token)}\n`)
  const values = { ACTIONS_RESULTS_URL: url, ACTIONS_RUNTIME_TOKEN: token }
  for (const [name, value] of Object.entries(values)) {
    const delimiter = `artifact_${randomUUID()}`
    appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`)
  }
}
