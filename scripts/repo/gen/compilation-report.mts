import { readFileSync, writeFileSync } from 'node:fs'

interface Row {
  name: string
  selector: string
  operation: string
  size: number
  milliseconds: number[]
  ratio: number
  samples: Array<Array<{ p50Ns: number }>>
}

const root = new URL('../../../', import.meta.url)
const report = JSON.parse(
  readFileSync(
    new URL('assets/repo/bench/compilation-followup-2026-10-01.json', root),
    'utf8',
  ),
) as {
  node: string
  cpu: string
  settings: { rounds: number; milliseconds: number; batch: number }
  sources: Array<{ sha256: string }>
  rows: Row[]
}
const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const time = (value: number) => value.toFixed(value < 0.01 ? 6 : 4) + 'ms'
const ratio = (name: string) =>
  report.rows.find(row => row.name === name)!.ratio.toFixed(2)
const rows = report.rows
  .map(row => {
    const rounds = row.samples[1]!.map(sample => sample.p50Ns / 1e6)
    return `<tr data-operation="${row.operation}"><th scope="row">${escape(row.name)}<small><code>${escape(row.selector)}</code> · ${row.size} elements</small></th><td>${time(row.milliseconds[0]!)}</td><td>${time(row.milliseconds[1]!)}</td><td>${time(Math.min(...rounds))}–${time(Math.max(...rounds))}</td><td class="gain">${row.ratio.toFixed(2)}×</td></tr>`
  })
  .join('\n')
const highlights = [
  ['first nth miss', 'Missing positional match', '512 siblings · first()'],
  [
    'select logical valid',
    'Prepared logical branches',
    '256 candidates · select()',
  ],
  [
    'raw logical valid',
    'Saved resolver execution',
    '256 fixed candidates · compile()',
  ],
  [
    '.card mutation and query',
    'Class query after mutation',
    '1,000 candidates · select()',
  ],
]
  .map(
    ([name, label, scope]) =>
      `<article class="metric"><p>${label}</p><strong>${ratio(name!)}<span>×</span></strong><small>${scope}</small></article>`,
  )
  .join('')
const chart = [
  'first nth miss',
  'select logical valid',
  'raw logical valid',
  '.card mutation and query',
]
  .map(name => {
    const row = report.rows.find(item => item.name === name)!
    return `<div class="bar-row"><div><b>${escape(name)}</b><span>${row.ratio.toFixed(2)}× faster</span></div><div class="track baseline" aria-label="Baseline: ${time(row.milliseconds[0]!)}"><i></i><span>${time(row.milliseconds[0]!)}</span></div><div class="track patched" aria-label="Patched: ${time(row.milliseconds[1]!)}"><i style="width:${100 / row.ratio}%"></i><span>${time(row.milliseconds[1]!)}</span></div></div>`
  })
  .join('')

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>nwsapi — Compilation &amp; memory report</title>
<style>
:root{color-scheme:light;--paper:#f5f5ef;--ink:#152b32;--muted:#596c70;--line:#d5dfda;--green:#08775f;--soft:#e4eee7;--nav:#122f35}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:90px}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--green);text-underline-offset:4px}code{font:0.88em ui-monospace,SFMono-Regular,Consolas,monospace}nav{background:var(--nav);color:white;padding:18px max(24px,calc((100vw - 1180px)/2));display:flex;justify-content:space-between;gap:24px;position:sticky;top:0;z-index:5}nav a{color:#d7e9e2;text-decoration:none;font-size:13px}nav div{display:flex;gap:24px}.brand{font-size:18px;font-weight:750;letter-spacing:-.5px}main{max-width:1180px;padding:0 24px;margin:auto}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:750;color:var(--green)}header{padding:65px 0 34px}h1{font-size:clamp(38px,6vw,68px);line-height:1.04;letter-spacing:-.045em;max-width:900px;margin:18px 0 24px}h2{font-size:30px;line-height:1.2;letter-spacing:-.025em;margin:8px 0 20px}h3{font-size:20px;line-height:1.3;margin:10px 0}.lede{font-size:20px;max-width:830px;color:var(--muted)}meta{display:none}.meta{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin:25px 0}.pill{border:1px solid var(--line);border-radius:30px;padding:4px 12px}.status{color:var(--green);background:var(--soft);border-color:var(--soft)}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.metric{background:white;border:1px solid var(--line);padding:24px}.metric p{font-size:13px;margin:0 0 20px}.metric strong{display:block;font-size:49px;line-height:1;letter-spacing:-.045em;font-weight:650;color:var(--green)}.metric strong span{font-size:29px}.metric small{display:block;margin-top:18px;font-size:11px;color:var(--muted)}.scope{font-size:13px;color:var(--muted)}section{padding:45px 0;border-bottom:1px solid var(--line)}.section-head{display:flex;justify-content:space-between;gap:24px;align-items:center}.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}.card{padding:25px;background:white;border:1px solid var(--line)}.card p{margin:10px 0;font-size:15px;color:var(--muted)}.number{font:12px ui-monospace,monospace;color:var(--green)}.tag{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:.1em;padding:3px 8px;background:var(--soft);color:var(--green);float:right}.flow{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.flow p{font-size:14px;color:var(--muted)}details{border:1px solid var(--line);padding:16px 20px;background:#fff;margin:16px 0}summary{cursor:pointer;font-weight:600;font-size:14px}details p,details li{font-size:14px;color:var(--muted)}.chart{display:grid;grid-template-columns:1fr 1fr;gap:30px 50px;background:#fff;padding:28px;border:1px solid var(--line);margin:20px 0}.legend{display:flex;gap:25px;font-size:12px}.legend span:before{content:"";display:inline-block;width:10px;height:10px;background:#a8b6b8;margin-right:7px}.legend span:last-child:before{background:var(--green)}.bar-row>div:first-child{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px;font-size:12px}.bar-row>div:first-child span{color:var(--green);white-space:nowrap}.track{height:25px;position:relative;margin:5px 0;padding-right:100px}.track i{display:block;height:17px;background:#a8b6b8;width:100%;border-radius:2px}.track.patched i{background:var(--green);min-width:2px}.track span{position:absolute;right:0;top:-3px;font-size:11px;font-variant-numeric:tabular-nums}.table-wrap{overflow:auto;border:1px solid var(--line);background:white}table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:right;padding:15px 16px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;white-space:nowrap}thead th{font-size:10px;letter-spacing:.07em;text-transform:uppercase;background:var(--soft);color:var(--muted)}th:first-child{text-align:left}tbody th{font-weight:600}th small{display:block;white-space:normal;font-weight:400;color:var(--muted);font-size:11px;margin-top:4px;max-width:350px}.gain{color:var(--green);font-weight:750}.filter{display:flex;gap:10px;align-items:center;font-size:12px}select,button{font:inherit;color:var(--ink);background:white;border:1px solid var(--line);padding:9px 12px;border-radius:5px}button{cursor:pointer}a:focus-visible,summary:focus-visible,select:focus-visible,button:focus-visible{outline:3px solid #ed9d40;outline-offset:4px}.checks{display:flex;gap:14px;flex-wrap:wrap;margin:22px 0}.checks span{font-size:12px;border-left:3px solid var(--green);padding:4px 12px;background:var(--soft)}.caution{padding:20px 24px;background:#ece9df;border-left:3px solid #9e813d;font-size:14px;color:#554a30}.links{display:flex;flex-wrap:wrap;gap:12px 25px;font-size:13px}.hash{overflow-wrap:anywhere;font-size:11px}footer{padding:32px 0 55px;display:flex;justify-content:space-between;gap:25px;color:var(--muted);font-size:12px}[hidden]{display:none!important}
@media(max-width:850px){.metrics{grid-template-columns:repeat(2,1fr)}.two,.chart,.flow{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}nav div{gap:14px}nav a{font-size:11px}.metric strong{font-size:42px}header{padding-top:40px}.flow{gap:5px}}
@media(max-width:480px){main{padding:0 16px}nav{padding:14px 16px}nav div a:nth-child(2){display:none}.metric{padding:18px 14px}.metric strong{font-size:35px}.metric p{min-height:40px;margin-bottom:10px}.lede{font-size:18px}footer{flex-direction:column}}
@media print{nav,.filter,button{display:none}body{background:white;font-size:11px}main{max-width:none}header,section{padding:20px 0}h1{font-size:38px}.metrics{grid-template-columns:repeat(4,1fr)}.metric strong{font-size:30px}.card,.metric{break-inside:avoid}.table-wrap{overflow:visible}th,td{padding:7px;font-size:9px}details{break-inside:avoid}a{color:inherit}footer{padding:20px 0}}
</style></head><body>
<nav><a class="brand" href="#top">nwsapi<span style="color:#89baaa"> / research</span></a><div><a href="#changes">Changes</a><a href="#results">Measurements</a><a href="#next">Next opportunities</a><a href="#evidence">Evidence</a></div></nav>
<main><header id="top"><div class="eyebrow">Engineering report · 01 October 2026</div><h1>Less repeated work.<br>Faster compiled selectors.</h1><p class="lede">Four targeted improvements to compilation, first-match execution, route selection, and memory bounds. Measured against the original <code>v3</code> build.</p><div class="meta"><span class="pill status">Implemented · local changes</span><span class="pill">Baseline f04f47f</span><span class="pill">${escape(report.node)} · ${escape(report.cpu)}</span><span class="pill">jsdom 30.0.1</span></div></header>
<div class="metrics">${highlights}</div><p class="scope">Selected warm-query results. Speedup = baseline time ÷ patched time. These are targeted Node/<code>jsdom</code> workloads, not application-wide or browser timing claims.</p>
<section id="changes"><div class="eyebrow">01 / Implemented</div><h2>Four causes of repeated work removed</h2><div class="two">
<article class="card"><span class="number">01</span><span class="tag">Execution</span><h3>Share forward sibling positions</h3><p>Previously, a positional <code>first()</code> scan counted preceding siblings again for every candidate. The audit recorded 131,328 sibling reads across a 512-element no-match fixture.</p><p>A cursor now remembers the previous candidate and its position within each first-match group. Late and absent matches improve by <strong>${ratio('first nth late')}–${ratio('first nth miss')}×</strong>. Single-element matching retains its existing counting path. Reverse, of-type, filtered, and constant positions retain their existing helpers. Selector and combinator extensions disable this optimization.</p></article>
<article class="card"><span class="number">02</span><span class="tag">Compilation</span><h3>Prepare forgiving branches once</h3><p>Fallback <code>:is()</code> and <code>:where()</code> now prepare branch resolvers during outer compilation. Invalid branches become nonmatching entries instead of repeatedly parsing and throwing for every candidate.</p><p>Dependencies live in a bounded cache and invalidate on document, configuration, and extension changes. Saved resolvers rebuild dependencies after cache clearing. Valid raw execution improves <strong>${ratio('raw logical valid')}×</strong>. The invalid-branch stress case improves ${ratio('raw logical invalid branch')}×.</p></article>
<article class="card"><span class="number">03</span><span class="tag">Memory bounds</span><h3>Cap two overlooked memo tables</h3><p>The engine-owned tag-hash table and module-shared language-range table now hold at most <strong>256 entries each</strong>. A miss at the limit replaces the table. Evicted entries recompute deterministically.</p><p>The original audit retained 10,001 tag keys after compiling 10,000 distinct selectors. Regression checks verify bounded growth and correct behavior across turnover, HTML/XML matching, and modified intrinsics. Entry bounds are established; retained-byte savings were not measured.</p></article>
<article class="card"><span class="number">04</span><span class="tag">Query routing</span><h3>Reject the route before scanning the tree</h3><p>Descent, sibling-chain, and direct-child routes check the selector shape before inspecting the document for foreign element types. Unrelated class and attribute queries avoid whole-tree work after mutation.</p><p>Eligible routes keep their namespace protection. The measured append/query/remove cases improve <strong>${ratio('[data-hit] mutation and query')}×</strong> for attributes and <strong>${ratio('.card mutation and query')}×</strong> for classes across 1,000 candidates.</p></article>
</div></section>
<section><div class="eyebrow">02 / Compilation model</div><h2>What “compiled” includes</h2><div class="flow"><article><h3>Warm public query</h3><p>Cached plans reuse parsing and generated functions. Dispatch, scope checks, candidate acquisition, predicates, and result assembly still run.</p></article><article><h3>Saved resolver</h3><p><code>compile()</code> returns an engine-bound function. It iterates supplied candidates and executes predicates. Forgiving dependencies are now prepared and can be rebuilt after eviction.</p></article><article><h3>Build-time artifact</h3><p>A complete standalone precompiled format remains future work. CLI output still depends on captured helpers and runtime state. General <code>:has()</code> can still prepare a nested plan on first execution.</p></article></div></section>
<section id="results"><div class="eyebrow">03 / Measured results</div><h2>Targeted gains, with controls</h2>
<details><summary>Methodology and measurement scope</summary><p>Both readable bundled builds ran sequentially in one process on ${escape(report.cpu)}, Node ${escape(report.node)}, and <code>jsdom</code> 30.0.1. Each variant owned an equivalent document. ${report.settings.rounds} rounds rotated execution order using Mitata, a ${report.settings.milliseconds}ms minimum CPU time, and batches of ${report.settings.batch} calls. Tests and other benchmarks did not run during timing.</p><p>Setup and identity checks occurred outside measurement. Raw resolvers received fixed candidate arrays. Mutation cases include appending an unrelated element, querying, and removing it. The table reports the median of round medians and the patched build’s minimum–maximum round medians. All raw samples, fixture markup, settings, and build hashes are available below.</p><p>Cold compilation was not timed. Preparing logical dependencies eagerly trades work at compilation for faster execution. Small control differences with overlapping ranges do not establish meaningful regressions or improvements.</p></details>
<div class="legend"><span>Baseline</span><span>Patched</span></div><div class="chart">${chart}</div><p class="scope">Each pair uses its own baseline as 100%, so bar lengths compare versions within a case. The first case scans 512 siblings, logical cases use 256 candidates, and the mutation case uses 1,000. Labels give actual median query time; absolute bar lengths are not comparable across cases.</p>
<div class="section-head"><h3>All 13 measured cases</h3><label class="filter">Show operation <select id="operation"><option value="all">All operations</option><option value="first">First match</option><option value="select">All results</option><option value="raw">Saved resolver</option><option value="match">Single match</option></select></label></div>
<div class="table-wrap"><table><thead><tr><th scope="col">Case / selector</th><th scope="col">Baseline</th><th scope="col">Patched</th><th scope="col">Patched range</th><th scope="col">Speedup</th></tr></thead><tbody>${rows}</tbody></table></div><p id="count" class="scope" aria-live="polite">Showing all 13 cases.</p>
</section>
<section><div class="eyebrow">04 / Validation</div><h2>Behavior checked across execution modes</h2><div class="checks"><span>985 unit tests passed</span><span>6 focused logical tests passed afterward</span><span>62 integration tests passed</span><span>8 Chromium tests passed</span><span>Types · lint · formatting · naming passed</span></div><p>Coverage includes nested queries, extension mutation, saved-resolver cache clearing, formerly invalid registered selectors, quiet and strict validation, memo turnover, HTML/XML, namespaces, legacy behavior, mutations, and detached fragments. Browser checks used pinned Chrome for Testing 154.0.8037.0.</p><div class="caution">The browser run checks correctness. It is not a browser benchmark. The memory change bounds table entries; there is no retained-heap or allocation-rate measurement for this patch. The new forgiving dependency cache has its own bounded memory cost.</div></section>
<section id="next"><div class="eyebrow">05 / Remaining opportunities</div><h2>The next work should stay evidence-led</h2><p>The first four audit findings are implemented. These proposals remain unimplemented and have no measured replacement speedup.</p>
<details><summary>05 · Borrow internal candidate snapshots and improve existence queries</summary><p>Cached tag and class candidates can be copied before a resolver filters them into another array. An internal borrowing path could reduce allocation while preserving fresh public arrays. General <code>:has()</code> still materializes candidates on snapshot misses before it can stop at the first result. The audit observed 1,000 collection reads even when the first child matched.</p><p>Experiment with immutable borrowed snapshots or a bounded early probe. Preserve result isolation, callback behavior, extensions, nested queries, and detached-node collection. Earlier experiments rejected blanket live-collection iteration.</p></details>
<details><summary>06 · Cache successful chain syntax and prepare closest() matching</summary><p>One hundred warm descendant-chain queries reparsed their chain 100 times. One hundred <code>closest()</code> calls also parsed 100 times. Cache immutable syntax separately from mutation-sensitive routing decisions, and reuse prepared matcher arrays through ancestor walks. Preserve validation, scope, callbacks, and document switching.</p></details>
<details><summary>07 · Localize generated identifiers and immutable compiler constants</summary><p>The engine-wide generated-name counter produces different source after cache clearing. A compilation-local allocator could make output deterministic. Nested predicates also retain opportunities to hoist immutable regexes and lists. Runtime optimization means source-level object creation is not itself a measured heap allocation.</p><p>A small prepared representation could carry normalized groups, candidate tokens, dependencies, constants, and positional strategy between modes. Measure the benefit before retaining a full AST or rewriting the parser.</p></details>
<details><summary>08 · Separate reusable code from engine-bound execution state</summary><p>A complete build-time artifact would need candidate strategy, nested factories, constants, helper dependencies, and compatibility keys. Current resolver closures retain their engine state and can retain a document. Sharing unbound factories is a different lifetime model from globally sharing those closures.</p><p>The audit observed repeated compilation across alternating documents. A bounded factory cache could help direct multi-document users, but the adapter already owns one engine per document. Existing 4,096-entry cache limits are per cache, not total byte budgets. Do not substitute a heavier cache without representative evidence.</p></details>
<details><summary>Other conditional opportunities</summary><p>Mixed-type sibling indexing, balanced sparse type-union merging, inherited language and disabled-state reuse, and tiered execution for one-off selectors warrant targeted workloads first. Existing grouped merging, weak snapshot ownership, early probes, and adaptive ancestor filtering should be preserved.</p></details>
</section>
<section id="evidence"><div class="eyebrow">06 / Evidence &amp; reproduction</div><h2>Inspect the inputs behind the results</h2><div class="links"><a href="compilation-followup-2026-10-01.json" download>Download measured samples</a><a href="compilation-review-2026-10-01.json" download>Download original audit evidence</a><a href="../../../docs/repo/perf/compilation-review-2026-10-01.md">Original detailed review</a><a href="../../../docs/repo/perf/journal.md">Performance journal</a><a href="../../../scripts/repo/bench/compilation-followup.mts">Benchmark runner</a></div><details><summary>Build hashes and reproduction command</summary><p>Baseline commit: <code>f04f47f8bb8cc4a86df33c41c141ace83d5ca963</code>. Patched code is local and uncommitted.</p><p class="hash">Baseline SHA-256<br><code>${report.sources[0]!.sha256}</code></p><p class="hash">Patched SHA-256<br><code>${report.sources[1]!.sha256}</code></p><p>Save the baseline and patched readable builds, then run:</p><p class="hash"><code>node scripts/repo/bench/compilation-followup.mts before.cjs after.cjs assets/repo/bench/compilation-followup-2026-10-01.json</code></p><p>The original audit JSON includes source hashes, diagnostic scripts, probe outputs, and dependency lock data. Original audit probes loaded source modules directly; the follow-up timing above measures bundled builds.</p></details></section>
<footer><span><code>nwsapi</code> · Compilation and memory review · v3</span><button type="button" id="print">Print / save PDF</button></footer></main>
<script>
document.getElementById('operation').addEventListener('change', function () {
  let count = 0;
  document.querySelectorAll('tbody tr').forEach(row => {
    row.hidden = this.value !== 'all' && row.dataset.operation !== this.value;
    if (!row.hidden) count++;
  });
  document.getElementById('count').textContent = 'Showing ' + count + ' of 13 cases.';
});
document.getElementById('print').addEventListener('click', () => window.print());
</script></body></html>`

const output = new URL('assets/repo/bench/compilation-report.html', root)
writeFileSync(output, html)
console.log(output.pathname)
