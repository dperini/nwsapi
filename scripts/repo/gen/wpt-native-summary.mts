import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'

export interface NativeSummary {
  durationMs: number
  planned: number
  processes: number
  platform: string
  arch: string
  nativePassing: number
  selected: number
  selectedPages: number
  totals: Record<string, number>
}

export function nativeSummaryDocumentation(
  text: string,
  summary: NativeSummary,
) {
  const start = '<!-- native-summary:start -->'
  const end = '<!-- native-summary:end -->'
  const before = text.indexOf(start)
  const after = text.indexOf(end)
  if (before < 0 || after < before) {
    throw new Error('Native summary documentation markers are missing.')
  }
  const count = (value: number) => value.toLocaleString('en-US')
  const seconds = Math.round(summary.durationMs / 1000)
  const duration = (value: number, unit: string) =>
    `${value} ${unit}${value === 1 ? '' : 's'}`
  const platform = summary.platform === 'mac' ? 'macOS' : summary.platform
  const rows = [
    [
      'selector-matching',
      'Selector matching',
      'Retain the selector assertions.',
    ],
    ['selector-parsing', 'Selector parsing', 'Retain syntax assertions.'],
    [
      'mixed-selector',
      'Mixed selector callbacks',
      'Extract selector assertions from the other checks.',
    ],
    ['rendering', 'Rendering', 'Exclude rendering assertions.'],
    [
      'css-values',
      'CSS property values and CSSOM',
      'Exclude assertions outside selector parsing and matching.',
    ],
    [
      'other-api',
      'Other APIs and fixture setup',
      'Exclude assertions that do not test selector results.',
    ],
  ]
  const body = [
    `The finalized classification contains ${count(summary.selected)} selector-related cases across ${count(summary.selectedPages)} URLs. It accounts for all ${count(summary.nativePassing)} qualified native passes, with no unresolved cases. These are requirements inferred from native results, not engine compliance results.`,
    'Choose the timing for the operation you need. These estimates cover the native qualification stage. Dependency updates, installation, and other checks have their own costs.',
    '| Operation | Work performed | Time to allow |\n| --- | --- | --- |\n' +
      '| Check unchanged inputs | Verify the committed contract. No discovery or browser tests run. | Under 1 second in local measurements. |\n' +
      '| Replay saved results with unchanged pins | Rescan discovery and classify recorded results. Chrome stays closed. | About 1 minute in local measurements. |\n' +
      '| Resume after discovery adds candidates with unchanged pins | Run only URLs absent from the saved execution plans, then classify the combined results. | Replay time plus browser time for the added URLs. |\n' +
      `| Refresh after a Chrome or WPT pin change, or when required cached results are missing | Qualify the full candidate pool. | About ${duration(Math.ceil(seconds / 60), 'minute')} for browser work at this pool size, plus preparation and classification. |`,
    'Normal setup and checks use the committed pool. Missing temporary reports alone do not trigger a browser run. Regeneration needs matching saved reports or a full qualification run. The updater checks for this after dependency installation. A changed browser or WPT pin requires full qualification even when older reports remain cached.',
    `<details>\n<summary>Full qualification timing reference</summary>\n\nThe browser execution reference covers ${count(summary.planned)} URLs and totals ${duration(Math.floor(seconds / 60), 'minute')} ${duration(seconds % 60, 'second')} with ${summary.processes} workers on ${platform} ${summary.arch.toUpperCase()}. It excludes checkout, browser installation, and classification. Use it for the full browser phase. It is not the duration of a routine check or cached replay. Hardware, load, candidate count, and timeout-heavy tests affect elapsed time.\n\n</details>`,
    '| Category | Cases | Treatment |\n| --- | ---: | --- |\n' +
      rows
        .map(
          ([key, label, treatment]) =>
            `| ${label} | ${count(summary.totals[key!] || 0)} | ${treatment} |`,
        )
        .join('\n'),
  ].join('\n\n')
  return (
    text.slice(0, before + start.length) +
    '\n\n' +
    body +
    '\n\n' +
    text.slice(after)
  )
}

export function writeNativeSummaryDocumentation(summary: NativeSummary) {
  const file = path.join(REPO_ROOT, 'docs/repo/testing/wpt-inventory.md')
  writeFileSync(
    file,
    nativeSummaryDocumentation(readFileSync(file, 'utf8'), summary),
  )
}

if (isMainModule(import.meta.url)) {
  const summary = JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, 'assets/repo/bench/wpt-native-summary.json'),
      'utf8',
    ),
  )
  writeNativeSummaryDocumentation(summary)
}
