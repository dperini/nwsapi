import { format } from 'oxfmt'
import { outputFormat } from '../../../../.config/build.config.mts'

export async function formatOutput(file: string, code: string) {
  const result = await format(file, code, outputFormat)
  if (result.errors.length) {
    throw new Error(
      `Could not format ${file}:\n` +
        result.errors.map(error => error.message).join('\n'),
    )
  }
  return result.code
}
