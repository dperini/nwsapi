import path from 'node:path'
import { parseArgs } from 'node:util'

export const PROFILE_PHASES = [
  'cold',
  'first',
  'first-class',
  'match',
  'resolver',
  'select',
] as const

export type ProfilePhase = (typeof PROFILE_PHASES)[number]

function isProfilePhase(value: string): value is ProfilePhase {
  return PROFILE_PHASES.includes(value as ProfilePhase)
}

export function parseProfileArgs(args: string[], defaultOutput: () => string) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      phase: { type: 'string', short: 'p' },
    },
    strict: true,
  })
  if (positionals.length > 2) {
    throw new Error('Expected at most a phase and output file.')
  }
  if (values.phase !== undefined && positionals[0] !== undefined) {
    throw new Error('Use either --phase or the positional phase, not both.')
  }
  if (values.output !== undefined && positionals[1] !== undefined) {
    throw new Error(
      'Use either --output or the positional output file, not both.',
    )
  }
  const phase = values.phase ?? positionals[0] ?? 'select'
  if (!isProfilePhase(phase)) {
    throw new Error(
      `Unknown phase ${JSON.stringify(phase)}. Use ${PROFILE_PHASES.join(', ')}.`,
    )
  }
  const output = values.output ?? positionals[1]
  if (output !== undefined && output.trim() === '') {
    throw new Error('--output must name a .cpuprofile file.')
  }
  return {
    output: path.resolve(output ?? defaultOutput()),
    phase,
  }
}
