import { execFileSync } from 'node:child_process'

export function powerState() {
  return process.platform === 'darwin'
    ? execFileSync('/usr/bin/pmset', ['-g', 'batt'], {
        encoding: 'utf8',
      }).trim()
    : 'unknown'
}

export function checkedPower() {
  const state = powerState()
  if (
    process.env['NWSAPI_REQUIRE_AC'] === '1' &&
    !state.includes("Now drawing from 'AC Power'")
  ) {
    throw new Error('AC power is required for this measurement.\n' + state)
  }
  return state
}
