import { expect, test } from 'vitest'
import { selectorApiCoverage } from '../../../../scripts/repo/check/selector-api-coverage.mts'

const api =
  '| [`registerSelector(name)`](source) | entry |\n\n' +
  '### Configuration\n\n| `CACHE_LIMIT` | default | value |\n</details>'

function parity(selectorStatus: string) {
  return (
    '**1/2 (50.0%) have a Rust route**: 0 direct Rust and 1 through Node/WASM or host bridge.\n\n' +
    '| Documented API entry | Status | Rust evidence or boundary |\n' +
    '|---|---|---|\n' +
    `| \`registerSelector\` | ${selectorStatus} | Callback bridge boundary. |\n` +
    '| `CACHE_LIMIT` | Bridge | Cache config bridge. |\n\n' +
    'Modules (`turbo_dom::rtdom::*`):\n'
  )
}

test('API inventory rejects direct Rust claims for JavaScript callback APIs', () => {
  expect(() => selectorApiCoverage(api, parity('Rust'))).toThrow(
    'Host callback and lifecycle contracts require a JS or Bridge classification: registerSelector.',
  )
})

test('API inventory accepts honest callback-boundary classifications', () => {
  expect(selectorApiCoverage(api, parity('JS'))).toMatchObject({
    total: 2,
    javascript: 1,
    bridge: 1,
    rustBacked: 1,
  })
})

test('API inventory counts a host callback bridge separately from direct Rust', () => {
  const routed = parity('Bridge')
    .replace('1/2 (50.0%)', '2/2 (100.0%)')
    .replace('1 through', '2 through')
  expect(selectorApiCoverage(api, routed)).toMatchObject({
    direct: 0,
    bridge: 2,
    rustBacked: 2,
  })
})
