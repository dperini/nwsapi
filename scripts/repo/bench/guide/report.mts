import { readFileSync, writeFileSync } from 'node:fs'

interface Audit {
  displayValue?: string
  numericValue?: number
}
interface Report {
  lighthouseVersion: string
  fetchTime: string
  categories: Record<string, { score: number }>
  audits: Record<string, Audit>
}
const directory = new URL(
  '../../../../assets/repo/bench/guide-rendering-2026-10-08/',
  import.meta.url,
)
const cases = [
  ['Guide mobile before', 'guide-before'],
  ['Guide mobile after', 'guide-after'],
  ['Reader mobile before', 'reader-before'],
  ['Reader mobile after', 'reader-after'],
  ['Guide desktop after', 'guide-desktop-after'],
  ['Reader desktop after', 'reader-desktop-after'],
] as const
const categories = ['performance', 'accessibility', 'best-practices', 'seo']
const rows = cases.map(([name, file]) => {
  const report = JSON.parse(
    readFileSync(new URL(`${file}.json`, directory), 'utf8'),
  ) as Report
  const scores = categories.map(key =>
    Math.round(report.categories[key]!.score * 100),
  )
  const metrics = ['first-contentful-paint', 'largest-contentful-paint'].map(
    key => `${Math.round(report.audits[key]!.numericValue!)}ms`,
  )
  const shift =
    report.audits['cumulative-layout-shift']!.numericValue!.toFixed(3)
  return `| [${name}](${file}.json) | ${scores.join(' | ')} | ${metrics.join(' | ')} | ${shift} |`
})
const report = `# Model guide rendering measurements

## Lighthouse

| Page and profile | Performance | Accessibility | Best practices | SEO | FCP | LCP | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

These are individual local Lighthouse navigation audits of the production build at http://127.0.0.1:4390. Mobile uses Lighthouse's default simulated mobile profile. Desktop uses --preset=desktop. The browser's default appearance is light. These are lab scores, not field Core Web Vitals or battery measurements. Results vary with the machine and run. The linked raw reports record Lighthouse/Chrome versions, timestamps, settings, and individual findings.

## Rendering changes

- Restore TOC state before module initialization to avoid initial resizing. Native CSS sticky positioning now also needs no JavaScript header-offset listener.
- Inline the small built CSS assets into production HTML to remove stylesheet request chains. This trades shared CSS caching across these two pages for fewer first-render dependencies.
- Preload the code font and the reader's text font. Preserve the guide's existing text-font preload.
- Download narration only on playback and show durations from recorded metadata. Fetch teaching datasets when their section becomes visible.
- Read layout before writing styles. Avoid repeated spotlight updates within the same color step and scope its position properties to the spotlight element.
- Animate reading progress with CSS scroll timelines where supported, retaining a JavaScript fallback.
- Animate slider glow opacity rather than shadow geometry. Keep interaction wiggles, but finish decorative shimmer, spotlight breathing, direction cues, and loading animations instead of running them indefinitely.
- Correct light-theme contrast and include the TOC's visible label in its accessible name.
- Reserve the GitHub control's loading space and add its external-link arrow.

## Browser checks

See [browser-checks.json](browser-checks.json). Both page types were checked at 412px, 1000px, and 1440px widths. The TOC starts 16px below the header and sticks 16px from the viewport top after scrolling. All six cases toggled successfully, produced no page errors, and made zero initial audio requests. After 40 seconds at rest, the guide had zero running Web Animations entries. This measures idle animation activity, not GPU utilization or energy consumption. Native macOS rubber-band gestures were not simulated.

## Commands

Build with \`pnpm run guide:build\`. Audit each URL with \`npx lighthouse <url> --chrome-flags='--headless' --output=json --output-path=<report> --quiet\`, adding \`--preset=desktop\` for desktop. Regenerate this table with \`node scripts/repo/bench/guide/report.mts\`.

## Further opportunities

Mobile performance still falls short of 100. The shared React/Radix control bundle and asynchronous Markdown rendering remain candidates for a separate loading/architecture change. Apply rendering containment selectively: skipping offscreen layout can conflict with code that reads every heading's geometry. Avoid blanket GPU promotion, which adds layer memory rather than guaranteeing faster rendering.

Reviewed guidance: the local GoogleChrome/modern-web-guidance-src checkout at 2785cde, especially motion, complex-layout interactions, deferred rendering, and lazy media loading. Primary references: [compositor properties and layer count](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count), [animation performance](https://web.dev/articles/animations-and-performance), and [Lighthouse scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring).
`
writeFileSync(new URL('report.md', directory), report)
