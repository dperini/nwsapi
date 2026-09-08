# Performance rules

Measure the operation affected by a change and check its behavior. Follow the [performance practices](../perf/practices.md) for experiment design, source identification, and result storage. Keep implementation details in `docs/repo/perf/design.md` and experiment results in `docs/repo/perf/journal.md`.

## Measure representative work

Compare variants with the same runtime, inputs, and measurement steps. Alternate variants in one process when possible to reduce drift between runs. Check correctness outside the timed operation, and report where the result applies.

Use the [profiling practices](../perf/profiling.md) to distinguish elapsed time, allocation, retained memory, and total process memory. Record the command and enough input data to reproduce the result.

## Order conditions by measured cost

Measure both the cost of a condition and how often it rejects an input. A cheap condition can avoid an expensive check. A more selective condition can also justify running first. Selectivity means the fraction of inputs that a condition rejects.

Reorder conditions only when their side effects and observable behavior stay the same. Property access can invoke a getter, and a function call can change state or throw. Check these behaviors before changing evaluation order.

Use information already available, such as a count or a parsed tag, before computing it again. Review the emitted order when a generator wraps conditions around earlier output. Source order alone does not establish execution order.

## Avoid work before starting it

Reject an operation early when an inexpensive check proves that it cannot succeed. Check known input sizes before constructing a result that will be discarded.

Use an existing index or summary when it can avoid visiting individual items. A filter that rejects a possible match changes correctness. A filter that retains extra candidates can still be useful if a later check verifies the result.

Measure how many candidates a filter removes. Disable or bypass the filter when maintaining and reading it costs more than the work it saves. Reassess that choice when the input changes.

## Record the decision

Record the hypothesis, measured operation, command, result, decision, and correctness checks. Keep rejected ideas and inconclusive results with their evidence. Give each entry a title that identifies the behavior under study.

Follow the [cache practices](../perf/caching.md) when reusing results. Follow the [asynchronous work practices](../perf/async-work.md) when work retains handlers, queued values, or resources after it finishes.
