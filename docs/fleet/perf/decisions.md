# Decide whether to keep a performance change

Keep a change when its useful gains justify its measured costs and maintenance burden. Record the decision and its limits in `docs/repo/perf/journal.md`.

## Set the success criteria

Name the target operation, runtime, representative inputs, and primary metric before changing code. Include common inputs and cases that stress the changed behavior.

Set practical limits for startup, latency, allocation, retained memory, and artifact size where those limits matter. Use application requirements to set limits. A universal percentage cannot replace those requirements.

Correctness and supported behavior must pass before accepting a performance gain. Check result identity, order, mutation, cleanup, errors, and supported runtimes where applicable.

## Check that the measurements support the claim

Use the same dependencies, build settings, fixtures, and measurement code for both variants. Record source hashes and runtime versions. Separate setup and correctness checks from measured work.

Rotate variant order within each run. Repeat the comparison in fresh processes. Keep individual rounds and their pairing. Samples from one process share runtime state, so do not treat them as independent experiments.

Compare an unchanged build with itself under the same settings. This control shows observed variation from the harness and runtime. Its range is descriptive. It does not establish statistical significance or a confidence interval.

Report absolute changes with percentages. A 20% reduction from 5µs saves 1µs. Explain why that saving matters to the measured operation.

Preserve unfavorable runs and controls. Investigate results that change direction or have large variation. Mark the outcome inconclusive when the measurements do not support a stable conclusion.

## Evaluate the costs separately

| Measurement               | Decision question                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Timing                    | Does the target operation improve under normal conditions and important edge cases?           |
| Allocation                | Does temporary memory traffic increase, and does that affect GC work or latency?              |
| Retained memory           | Do caches remain bounded, and can removed objects be collected?                               |
| Artifact size and startup | Does the change increase transfer, parsing, loading, or initialization costs?                 |
| Maintenance               | Does the measured benefit justify branches, state, runtime assumptions, and additional tests? |

Allocation and retained memory answer different questions. Increased allocation does not prove a leak, but it can still increase collection costs. Measure both when a change affects object creation or ownership.

Keep profiling separate from timing. Record whether allocation sampling includes collected objects. For retained memory, allow cleanup tasks to finish before collection. Inspect retaining references when objects survive.

## State where the decision applies

Evaluate each supported runtime separately. A browser gain does not establish a Node gain. A microbenchmark gain does not establish an application gain.

Use measured operation frequencies when estimating application impact. Weight absolute costs using the same workload mix for both builds. Account for work outside the optimized operation. Do not average unrelated percentages into an overall speedup.

Without workload frequencies, describe the measured cases and make the acceptance judgment explicit. A benchmark summary with equal case weights describes that benchmark suite. It does not describe typical application use.

## Record the outcome

| Outcome              | Required explanation                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Keep                 | State the repeatable benefit, accepted costs, and workload where the change applies.       |
| Keep with a tradeoff | Name the slower or larger cases and explain why the supported gains justify them.          |
| Reject               | Identify the failed requirement, unacceptable cost, or complexity that outweighs the gain. |
| Inconclusive         | Identify the uncertainty and the next measurement needed to resolve it.                    |

Include before and after values, commands, raw reports, controls, and correctness checks. Name the evidence that would change the decision. Large gains elsewhere do not automatically excuse a severe regression in a supported workload.

Use `scripts/fleet/bench/comparison.mts` to summarize paired measurements and controls. The helper reports descriptive values. The maintainer makes the acceptance decision.
