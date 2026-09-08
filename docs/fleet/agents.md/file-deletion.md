# File deletion

Use the deletion helpers in this order. These examples target `@socketsecurity/lib` 7.0.2. A repository can use its stable alias when that alias provides the same API.

1. Prefer `strictDelete` and `strictDeleteSync` from `@socketsecurity/lib/fs/strict`. For a target inside a directory the operation owns, pass that directory as `base`. The helper rejects the base itself and targets outside it. It also rejects empty targets and filesystem roots.
2. Use `safeDelete` and `safeDeleteSync` from `@socketsecurity/lib/fs/safe` when the strict helper does not fit the operation. For example, the safe helpers accept lists and glob patterns. Use `cwd` or `allowedDirs` to name the intended directory when needed. The allowed roots already include the operating system's temporary directory.
3. Reserve `forceDelete` and `forceDeleteSync` from `@socketsecurity/lib/fs/force` for an explained exception. These helpers bypass the location guard. Do not use them as an automatic retry after a stricter helper refuses a target.

Use asynchronous deletion in asynchronous code. Use the synchronous equivalent when the surrounding code is synchronous. Delete only resources owned by the operation. The [test isolation practices](../testing/isolation.md) show fixture cleanup.

## Lint enforcement

`socket/no-force-delete` reports calls to `forceDelete` and `forceDeleteSync`. An exception needs a narrow lint suppression with a reason:

```ts
// oxlint-disable-next-line socket/no-force-delete -- explain why this operation requires forced deletion
```

The reason must explain the operation and why a stricter helper cannot handle it. The comment suppresses a diagnostic. It does not validate the target.

Route direct filesystem deletion through these helpers. `socket/prefer-safe-delete` reports direct filesystem calls and recommends strict deletion first. Its automatic fix uses the safe helpers supported by the installed tooling dependency. Review the target and choose strict deletion when the installed API supports it. `socket/no-force-delete` also detects `force: true` on deletion helpers.
