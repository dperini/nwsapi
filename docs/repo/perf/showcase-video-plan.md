# V3 performance showcase video

## The story

Lead with the measured performance win, then explain the engineering lineage.
Close with a reproducible comparison and a link to the interactive routing
guide. The audience is programmers who know CSS selectors but have not read
the engine source.

Proposed opening: **“Nearly two decades of selector engineering. Still fast.”**
The first preserved `nwmatcher` commit is dated July 15, 2008 in
[its repository history](https://github.com/dperini/nwmatcher/commit/3d1641030b0e62cd7aeab2ce6c0deb0169b3f5d4).
That establishes the lineage. It does not establish an original release date.

The current production-build recording compares `nwsapi` from
`prerelease/3.0.0`, labeled `2.3.0-prerelease` in the package, with
`@asamuzakjp/dom-selector` 9.2.4. It records 5.01× geometric mean warm-query
speedup across 36 selectors, 86.3% less retained engine heap, and 40.4% less
Brotli-compressed browser JavaScript. Use **“fastest in this comparison”** beside
the measured ranking. An overall “#1 against the rest” title requires the
broader comparison described below.

## Format and storyboard

Make a 60s, 1920×1080, 30fps main film. Use captions throughout so it works
without sound. Prepare a separate portrait cut after the landscape composition
is approved. Keep the dark navy and green visual language of `perf-hero.svg`.

| Time   | Screen and motion                                                                                 | Caption / narration                                                                           |
| ------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 0–6s   | Two warm-query bars settle, then the measured 5.01× ratio appears.                                | “CSS queries. Less waiting.” Scope: 36 selectors, native Chromium DOM.                        |
| 6–12s  | A single line connects `nwmatcher` in 2008 to the V3 development branch today.                    | “Nearly two decades of selector engineering.”                                                 |
| 12–18s | `.card:has(.badge)` becomes a small DOM diagram. Matching cards light up.                         | “Same selector. Same ordered results.”                                                        |
| 18–24s | An anchor-first search visits cards. A witness-first search starts at badges. Counters increment. | “Choose where to start. Avoid unnecessary work.”                                              |
| 24–30s | The diagram becomes measured query bars. Keep one scale and show individual cases.                | “Measure complete queries, not just one shortcut.”                                            |
| 30–36s | A separate chart shows retained heap after the recorded query workload.                           | “86.3% less retained engine heap in this workload.”                                           |
| 36–42s | The file-size chart appears with compressed sizes and bundle labels.                              | “40.4% less browser JavaScript after Brotli.”                                                 |
| 42–48s | A broader engine comparison shows only verified, equivalent cases.                                | “Fastest among these tested engines.” Use this scene only after the broader recording exists. |
| 48–54s | Highlight the saved input JSON, build hash, versions, and reproduction command.                   | “Recorded inputs. Reproducible results.”                                                      |
| 54–60s | Project name, repository link, and routing-guide preview.                                         | “Explore `nwsapi` V3.”                                                                        |

The query scenes use the recorded warm all-results workload with setup excluded.
The DOM animation explains search steps and is labeled illustrative. It is not
a timed simulation. Memory and size have their own scales and measurement
boundaries. Keep the scope visible while each chart is on screen.

## Evidence and comparison expansion

Load the numbers from recorded inputs during video preparation:

- [Query samples](../../../assets/repo/bench/results.json) and the separate
  [documentation fixture](../../../assets/repo/bench/documentation/results.json).
- [Retained heap](../../../assets/repo/bench/memory-footprint.json).
- [Browser bundle sizes](../../../assets/repo/bench/file-size.json).
- [Current summary graphic](../../../assets/repo/bench/perf-hero.svg) and
  [measurement methodology](benchmarks.md).

Before the broad ranking scene, pin the additional libraries and run them on
the same host, DOM fixtures, selectors, result contract, and production build.
Start by assessing `nwmatcher`, `sizzle`, and other actively used selector
libraries for that contract. Engines needing a different DOM representation
belong in a separate comparison. Report unsupported selectors and wrong
results explicitly. Keep native browser queries as a separately labeled
reference. Preserve unfavorable cases and samples, rotate engine order, and
repeat in fresh processes before selecting a headline.

Show warm queries separately from cold compilation and startup. Compare
memory separately from allocation. Keep browser and `jsdom` measurements
separate. The current recording has two libraries and cannot establish a
ranking across an unmeasured field.

## Production with `fframes`

Use the pinned development-only Rust project in `.config/perf-video/` and the
installed `fframes-video` skill. Author scenes in Rust and SVG. Prepare measured
values once before rendering frames. Keep values, labels, and source hashes in
a generated manifest under `assets/repo/bench/video/` so a chart or caption
cannot drift from its source recording.

Use one focal movement at a time, 300–600ms entrances, short transitions, and
at least 1–2s of reading time after the scene settles. Ship fonts with the
project. Use large text, ample margins, and exact package names on charts.
The optional PyTorch policy can be a separate explainer segment. It should not
be credited with the whole benchmark result.

Review scene timing with `timeline`, automatic issues with `inspect`, and
composition with per-scene `strip` contact sheets and full-size `frame` images.
Render a draft before the final MP4. Supply a caption transcript and a static
poster with the video. Verify the final dimensions, frame count, duration,
and sound levels before publishing.
