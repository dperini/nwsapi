# Comparing the optional extension with jQuery

Run the direct comparison with the pinned, development-only jQuery 4.0.0 slim reference, loaded from the npm package through `jquery/factory-slim`:

```sh
pnpm run test:integration test/repo/integration/jquery-reference.test.mts
```

Given paragraphs `a, b, c, d` within a container, jQuery's positional selectors filter that ordered result set using zero-based indexes. `p:eq(1)` returns `b`, `p:even` returns `a, c`, and `p:odd` returns `b, d`. These are jQuery extensions, unlike the standard CSS `:nth-child()` selector, which counts siblings from one. See [jQuery's positional selector explanation](https://api.jquery.com/eq-selector/).

The comparison tests assert seven supported query patterns against the actual jQuery implementation, repeat warmed queries, and reorder the DOM. A separate test records five known differences with explicit expected results for both implementations. For a container holding `a, b, c, d`, with additional paragraphs outside it and only `a, c` carrying class `picked`:

| Query            | jQuery 4.0.0               | Optional extension                                    |
| ---------------- | -------------------------- | ----------------------------------------------------- |
| `p:eq(-1)`       | `d`                        | Empty                                                 |
| `p:first`        | `a`                        | Empty: the first paragraph is outside the container   |
| `p:last`         | `d`                        | Empty: the last paragraph is outside the container    |
| `p:nth(1)`       | `b`                        | `a`: document-wide same-tag index                     |
| `p:eq(1).picked` | Empty: `b` lacks the class | `c`: the class is filtered before the positional step |

These difference assertions document limitations, not successful compatibility checks. Full code coverage does not imply full jQuery compatibility. The original extension remains optional and jQuery is not a runtime dependency of NWSAPI.
