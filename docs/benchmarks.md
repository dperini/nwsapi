# Selector benchmarks

Compare the first stable v2 release (2.0.0), the latest published release
(2.2.27), the current source, and jsdom's selector engine in one run.
The current source is labeled with its commit, not an unpublished version.

Extract the published baseline packages into separate directories, then run:

```sh
pnpm run bench --baseline /path/to/nwsapi-2.0.0/package --baseline /path/to/nwsapi-2.2.27/package
```

Results go to `assets/repo/bench/`. Each SVG contains at most four selectors
from one category. `results.json` records every timing sample, package
versions, source hashes, the fixture hash, and the test machine.

<details>
<summary>Comparison charts</summary>

![Basic selectors](../assets/repo/bench/identifiers-1.svg)
![Attribute selectors](../assets/repo/bench/attributes-1.svg)
![Relationships](../assets/repo/bench/relationships-1.svg)
![Position selectors](../assets/repo/bench/positional-1.svg)
![Logical selectors](../assets/repo/bench/logical-1.svg)
![Form state selectors](../assets/repo/bench/forms-1.svg)

</details>

<details>
<summary>How measurements work</summary>

All engines use their default settings and query the same component document.
Before timing, Chromium checks
the same fixture. Each engine must return the same elements in the same order,
using their document positions to compare across hosts. Install Chromium with
`pnpm exec playwright install chromium` before the first run.
Unsupported selectors and incorrect results have no timing bar. A candidate
mismatch also makes the command fail.

The runner warms each query, rotates engine order between rounds, and reports
the median time per query. Lower is better. These measurements cover warm
queries, not browser performance, cold starts, or memory use. Results depend
on the machine and fixture; compare engines from the same run.

Use `--rounds 3 --iterations 10 --output /tmp/nwsapi-bench` for a quick check.
Use the default nine rounds and 100 iterations for the recorded report.

</details>

<details>
<summary>Other measurements</summary>

The original selector presets, cache sweep, host-access checks, and memory
measurements are also available. Run `pnpm run build` first.

```sh
pnpm run bench:selectors --list
pnpm run bench:accessors --doc components
pnpm run bench:cache --limits 1000,4096
pnpm run bench:memory --count 200
```

The selector preset runner uses jsdom as a reference. Use `pnpm run bench`
for the browser-checked comparison charts. Cache and memory commands enable
garbage collection through the repository launcher.

</details>
