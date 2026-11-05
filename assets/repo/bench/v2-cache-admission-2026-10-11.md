# V2 selector cache admission measurements

Recorded 2026-10-11T23:06:08.705Z on Node.js v26.11.0, `jsdom` 26.1.0, darwin/arm64 (Apple M1 Max). Baseline revision: `ffe3bade81732e6d4e1d4993393483871692d28b`. Candidate base: `ffe3bade81732e6d4e1d4993393483871692d28b`. Candidate source modified: true.

Baseline SHA-256: `ddf74cd622e311bb29399eaf9a3e5b8a869358a5f3783d00b0aa37fe145d0541`. Candidate SHA-256: `89478e37218b8fd618e6d81ca90034d2aeae1aad31c77245c8d5365ce493b1b3`. [Full recording](v2-cache-admission-2026-10-11.json).

<details>
<summary>Shared measurement method and cases</summary>

Each timing sample runs in a fresh process. There are three samples per case and source, and the table reports medians. A separate process validates every match result before timing. Another separate counts process instruments actual `matchResolvers.get()` calls and `Function` construction in the source VM. It checks both exposed caches against their configured entry and byte bounds after each query. No extra cache reads are used to measure hits. Timing excludes validation and counting instrumentation.

The small warm case makes 64,000 repeated calls over 32 selectors. The exact-cap and overflow cases use 1,000, 1,001, and 2,300 class selectors. The byte-pressure case uses 2,300 complex selectors with a 100,000-entry limit and a 2MiB byte limit. The hot-with-one-offs case mixes 32 warmed selectors with unique selectors. The changed-stylesheet case warms 2,300 old selectors and then repeats 2,300 replacements.

Query hit rate counts whether the first resolver-cache lookup for each `match()` call found a compiled resolver. Raw lookup hit rate counts individual `matchResolvers.get()` calls. A miss may perform two reads. Ordinary cases use the configured 1,000-entry and 2MiB limits per cache. The byte-pressure case raises only the entry limit to isolate the byte bound.

</details>

| Case | Query hit rate, baseline → candidate | Raw lookup hit rate, baseline → candidate | Baseline median | Candidate median | Function constructions baseline → candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| small-warm | 100.0% → 100.0% | 100.0% → 100.0% | 27.0ms | 24.7ms | 0 → 0 |
| class-1000 | 100.0% → 100.0% | 100.0% → 100.0% | 7.2ms | 9.6ms | 0 → 0 |
| class-1001 | 0.0% → 99.9% | 0.0% → 99.8% | 93.4ms | 8.0ms | 10010 → 11 |
| class-2300 | 0.0% → 35.4% | 0.0% → 21.5% | 223.5ms | 111.0ms | 23000 → 8069 |
| byte-pressure-complex-2300 | 0.0% → 43.6% | 0.0% → 27.9% | 277.9ms | 146.5ms | 23000 → 6686 |
| hot-with-one-offs | 50.0% → 50.0% | 33.3% → 33.3% | 663.4ms | 690.3ms | 23000 → 23000 |
| changed-stylesheet | 0.0% → 32.0% | 0.0% → 19.0% | 515.0ms | 294.4ms | 46000 → 19840 |

The exact-cap scan stays fully warm in both versions. Just over the entry cap, sampled admission recovers nearly all query hits and cuts measured `Function` constructions from 10,010 to 11. The 2,300-selector scans improve query hit rates and medians under both entry pressure and byte pressure. The hot subset remains fully cached in the mixed workload. The changed-stylesheet workload trades some cold misses for fewer repeated compilations. Small timing differences are machine-sensitive and should not be generalized beyond these cases.

| Retained cache | Ordinary maximum entries, baseline → candidate | Ordinary maximum bytes, baseline → candidate | Byte-pressure entries, baseline → candidate | Byte-pressure bytes, baseline → candidate |
| --- | ---: | ---: | ---: | ---: |
| matchResolvers | 1000 → 1000 | 592680B → 591084B | 1161 → 1163 | 2096766B → 2097150B |
| matchLambdas | 1000 → 1000 | 560000B → 558404B | 1184 → 1185 | 2095604B → 2096424B |

Values are the largest end-of-run cache sizes across cases in each workload class. The counts process checks each cache against its configured entry and byte bounds after every query. Ordinary cases use 1000 entries and 2MiB per cache. Byte-pressure measurements use the configured higher entry cap and keep the same byte limit. Estimated bytes are the cache's own accounting, not total process memory.
