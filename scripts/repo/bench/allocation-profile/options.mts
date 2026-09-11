import { positiveInteger } from '../../lib/positive-integer.mts'

export function resolveSamplingInterval(
  value?: string,
  alias?: string,
): number {
  if (value !== undefined && alias !== undefined) {
    throw new Error(
      'Use either --sampling-interval or --interval, not both. Values are measured in bytes.',
    )
  }
  return positiveInteger(
    value ?? alias ?? '512',
    '--sampling-interval (bytes)',
    32_768,
  )
}
