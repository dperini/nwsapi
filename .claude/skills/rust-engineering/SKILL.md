---
name: rust-engineering
description: >-
  Apply project-aware Rust design when writing, changing, debugging, or reviewing
  Rust code, Cargo manifests, tests, or unsafe and FFI boundaries.
---

# Rust engineering

Read the repository instructions and the relevant workspace or crate manifest
before changing Rust. Check the crate's role, edition, MSRV, toolchain, feature
use, error conventions, and configured checks. Follow that project's build and
test workflow instead of applying a universal command list.

## Design

- Model state with Rust types and ownership. Use enums or newtypes when they
  clarify invariants, `Option` for absence, and `Result` for expected failures.
- Do not clone only to silence a borrow-checker error. First see whether a
  borrow can end sooner, fields can be split, or ownership can move. Clone when
  shared or copied data is part of the design.
- Keep application code direct. Design public library APIs for callers, with
  stable error types, documented failure behavior, and only as much genericity
  as real use requires.
- Preserve standard trait contracts. In particular, keep `Eq`, `Ord`, and
  `Hash` consistent, and preserve resource cleanup through ownership and `Drop`.
- Use standard library behavior where it matches the product's contract. When
  compatibility requires different behavior, cover the meaningful edge cases.

## Unsafe code, FFI, and concurrency

- Keep unsafe code small and state the invariant that makes each operation
  valid. A `SAFETY` comment should explain the requirement, not merely say the
  operation is safe. Keep unsafe obligations visible at the boundary.
- Check pointer validity, alignment, aliasing, lifetimes, thread-safety, and
  destruction across FFI boundaries. Validate external values before exposing
  them as safe Rust types.
- For async or concurrent code, check lock scope, cancellation, panic behavior,
  and ownership across threads. Do not hold a synchronous lock across `.await`
  unless the project's runtime and design explicitly require it.

## Performance and review

- Start with a representative workload and measurements before changing data
  structures, adding unsafe code, or introducing caching for speed.
- For reviews, prioritize correctness, memory safety, error handling, and
  compatibility before style. Make findings actionable, cite the affected
  code, and explain the smallest useful fix. Separate measured problems from
  risks that have not been reproduced.
- Use the checks required by the project and the user's request. Do not run a
  test suite just because this skill was loaded. State which relevant checks
  were run and what remains unverified.

For deeper reference, see:

- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/).
- [Rust Reference](https://doc.rust-lang.org/reference/).
- [Rustonomicon](https://doc.rust-lang.org/nomicon/) for unsafe Rust.
