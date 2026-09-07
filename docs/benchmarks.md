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
<summary>How measurements work</summary>

All engines query the same component document. Before timing, their results
must contain the same nodes in the same order as jsdom's independent engine.
Unsupported selectors and incorrect results have no timing bar. A candidate
mismatch also makes the command fail.

The runner warms each query, rotates engine order between rounds, and reports
the median time per query. Lower is better. These measurements cover warm
queries, not browser performance, cold starts, or memory use. Results depend
on the machine and fixture; compare engines from the same run.

Use `--rounds 3 --iterations 10 --output /tmp/nwsapi-bench` for a quick check.
Use the default nine rounds and 100 iterations for the recorded report.

</details>
