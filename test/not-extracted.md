# Regression tests

Inline compound `:not()` arguments; keep lists and combinators on the general matcher path.

Run with Node.js ≥ 22, using a jsdom-supported release: 22.22.2+, 24.15.0+, or 26+.

```sh
pnpm install
pnpm run test:extracted
```

Extracted from #167. Assertions cover both results and the optimized route.
These tests do not establish an end-to-end speedup.

## Integration with ancestor filtering

When combining this PR with #189, preserve the outer compiler's filter state
around the nested `compileSelector()` call. Declare `A_KEEP`, `A_HOLD`, and
`A_MOVE` as locals of the outer compiler, then wrap that call:

```js
A_KEEP = A_REQD.slice();
A_HOLD = A_PEND.slice();
A_MOVE = A_WALK;
nested = compileSelector(argument, flag + '=true;', mode, callback);
A_REQD.length = 0;
A_REQD.push.apply(A_REQD, A_KEEP);
A_PEND.length = 0;
A_PEND.push.apply(A_PEND, A_HOLD);
A_WALK = A_MOVE;
```

Negated tags are not positive ancestor requirements. The nested compile must
also retain the outer helper-alias set when combined with legacy DOM support.
Reset `H_USED` in `compile()`, not in `compileSelector()`.

Integration tests should verify results and the ancestor-filter guard for
`main section p:not(article)`, including legacy attribute and sibling reads
inside a compound negation.
