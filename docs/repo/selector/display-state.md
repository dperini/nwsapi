# Display-state matching

The `:modal` selector follows the browser's modal state. It matches a dialog opened with `showModal()` and an element in fullscreen. A dialog opened with `show()` is not modal. The [HTML selector rules](https://html.spec.whatwg.org/multipage/semantics-other.html#selector-modal) define these cases.

An `aria-modal="true"` attribute describes accessibility semantics. It does not set the browser's modal flag. A real modal dialog still matches `:modal` if its ARIA attribute says `"false"`. The [ARIA definition](https://www.w3.org/TR/wai-aria-1.3/#aria-modal) describes the accessibility contract. Applications can query the attribute separately with `[aria-modal="true"]`.

The old expression `getAttribute("aria-modal") === true` also compared incompatible values. Attribute reads return text or `null`, not a boolean. Changing the comparison to the string `"true"` would fix that type mismatch but would still implement the wrong selector behavior. A user-added `.modal` property and the `open` attribute do not establish modal state either.

## Native matching and delegated hosts

`nwsapi` first checks for a known absence of fullscreen. That rejects non-dialog HTML elements without calling native matching. Dialogs still need native confirmation, even when `open` is false. Removing the `open` attribute from a modal dialog does not clear its modal flag.

A positive `fullscreenElement` value also needs native confirmation. The document can return a retargeted shadow host instead of the element with the fullscreen flag. Chrome 154 does not match that host with `:modal` or `:fullscreen`. The [Fullscreen Standard](https://fullscreen.spec.whatwg.org/#:fullscreen-pseudo-class) defines broader shadow-host matching for `:fullscreen`, so this path preserves the host browser’s result. A different fullscreen element does not prove absence either, because multiple elements can retain fullscreen flags. Observable fullscreen properties provide a fallback only when native matching is unavailable. If the host routes `Element.matches()` back into the same selector engine, the engine records that delegation and stops calling it recursively. The record is tied to the selected function and document, so replacing the host matcher or switching documents does not reuse stale detection.

The installed `jsdom` 30.0.1 has no `show()`, `showModal()`, or internal dialog modal state exposed by its dialog implementation. Its `idlUtils` helpers cannot supply a state that the host does not implement. In that environment, `nwsapi` does not infer modal state from ARIA or an open dialog. This is a host limitation, rather than a reason to reinterpret `:modal`.

## Investigation of commit 24cdab6aa

[Commit 24cdab6aa](https://github.com/dperini/nwsapi/commit/24cdab6aa6b6e0a483197d30b09bfeed892256ef) replaced the old display-state expressions with helpers that called `Element.matches()`. The helper caught exceptions but did not detect calls that delegated back into `nwsapi`. A `:modal` query could recursively enter the same matcher. Its fullscreen fallback could enter the matcher again while the stack unwound.

The [recorded reproduction](../../../assets/repo/bench/display-state-reentry.json) compares that commit, its parent, and the current built engine using one element whose `matches()` method delegates back into the engine. The unbounded case recorded:

| Engine               | Delegation calls | One cold query |
| -------------------- | ---------------: | -------------: |
| Parent of the change |                0 |         3.73ms |
| Commit 24cdab6aa     |        2,717,975 |       463.92ms |
| Current build        |                1 |         3.75ms |

These are diagnostic single-query observations, not throughput benchmarks. Each case runs in a fresh subprocess with a 3,000ms deadline that includes startup. The query timer excludes setup. Additional cases deliberately stop delegation at 10, 100, and 1,000 calls. The historical engine keeps recursing up to those limits, while the current engine makes one call in each case.

Both historical and current factories made zero matcher calls during initialization in this reproduction. The demonstrated regression starts when display-state matching runs, not during factory construction. The roughly 200-second result in [issue #214](https://github.com/dperini/nwsapi/issues/214) is the reporter's application-suite timing, including test timeouts. This reproduction demonstrates the recursive mechanism without claiming to reproduce that complete application.

Run `node scripts/repo/build/run.mts`, then `node scripts/repo/bench/display-state/reentry/run.mts` to regenerate the report. It needs local Git history for the historical commit. It uses no network requests.

## Regression checks

Direct-engine unit tests cover both modern and legacy modes. They reject ARIA and `.modal` expando false positives, distinguish `:open` from `:modal`, and check the fullscreen fallback.

Chrome tests compare against native matching across factory forms, document changes, and installation order. They exercise `show()`, `showModal()`, closing, visible popovers, ARIA attributes, and user-added `.modal` properties. They also cover manual removal of `open` and fullscreen inside a closed shadow root.

The adapter suite inserts a dialog into the document body through a click handler and repeats public queries while changing `open`. `pnpm run test:package` runs this case from a real temporary installation that overrides `@asamuzakjp/dom-selector` with the packed `nwsapi` package. The delegation tests separately enforce bounded call counts, including when the host throws after reentry.
