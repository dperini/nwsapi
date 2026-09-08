# Memory use in asynchronous work

Limiting the number of active tasks does not necessarily limit retained memory. Pending promise handlers, queued results, and unfinished cleanup can keep objects alive after other work completes.

## Avoid repeatedly racing the same pending promises

Each call to `Promise.race()` attaches handlers to the promises it receives. Completing the race does not remove handlers from promises that remain pending. Repeatedly racing a pool with one fast task and several slow tasks can accumulate handlers on the slow promises.

Use a completion queue when draining a pool that survives across iterations. Attach handlers once to each active operation. Have those handlers report completion to the queue, then let the consumer take the next result. The [promise rules](../agents.md/code-style.md#promiserace--promiseany-in-loops) describe the fleet requirement.

Bound the queue as well as the number of active operations. If producers finish faster than the consumer can process results, pause new work until capacity is available. Define how errors, cancellation, and early consumer exit stop work and release resources.

## Include buffers and cleanup in the memory budget

Streaming can avoid loading a whole file into memory, but streams still have buffers. Moving CPU work to a worker can keep the main event loop responsive, but the worker also uses memory. Measure the combined cost when evaluating the change.

Assign cleanup to a specific owner. Close streams and release temporary files when the operation succeeds, fails, or is cancelled. If a consumer stops reading early, close the producer and wait for its cleanup where the API supports it.

## Measure uneven workloads

Test a fast producer alongside a slow or stalled producer. Also test a slow consumer, rejection, cancellation, and early exit. Measure retained memory while work remains pending and again after cleanup.

Use the [performance practices](practices.md) to distinguish allocation from retained memory. Keep the implementation, workload, and measured results in the repository's performance documents.
