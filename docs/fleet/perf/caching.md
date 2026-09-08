# Build caching

A build cache saves an output so a later build can reuse it. Reuse is correct only when the inputs that affect the output still match.

## Describe the complete input

Include source content, relevant configuration, toolchain versions, build options, and dependencies that affect the output in the cache key. A cache key is the identifier used to find a saved result. Include the target platform and architecture for compiled outputs. During cross-compilation, the target can differ from the machine running the build.

Hash file contents instead of relying only on modification times. Git operations can change those times without changing the contents. Sort inputs before hashing them so directory enumeration order cannot change the result.

Represent an intentionally missing input explicitly so deletion changes the key. Fail on unexpected read errors. An unreadable file must not silently become equivalent to an absent file.

## Preserve the right path information

Include file names and directory layout when they affect the output. Use paths relative to the artifact root when a saved artifact must remain valid after extraction into a different directory. Include other path context when the build actually depends on it.

A cache identifier does not establish that a downloaded artifact is trusted. Preserve the repository's integrity checks and expected digests. Keep protocol-specific hash formats with their owning package.

## Validate before saving a checkpoint

A checkpoint is a saved build stage that a later run can resume. Build the stage, run a focused smoke test, and save the checkpoint only after the test passes. Record the inputs and target that produced it.

Track dependencies for each stage. A source change should invalidate every dependent stage while leaving independent stages reusable. Verify restored artifacts before treating the stage as complete.

## Test invalidation

Check unchanged inputs, changed contents, deleted inputs, renamed files, changed targets, and failed validation. Confirm that a failed build cannot become a reusable successful checkpoint. Measure cache hits and misses separately when reporting build performance.

Keep exact key formats, cache locations, checkpoint APIs, and benchmark results in `docs/repo/`. Follow the [performance practices](practices.md) when measuring build changes.
