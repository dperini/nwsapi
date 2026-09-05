# Media and time state: draft extraction

This branch preserves #167's media and time changes for review. It is not
production-ready. The full `state-pseudos.spec.mts` and fixture remain here;
only their fixture URL changed to avoid requiring a WPT checkout or server.
Their six passing tests do not validate media playback or loading semantics.

The archive's `:buffering` and `:stalled` predicates require `!isPlaying()`.
The [resource-state specification](https://drafts.csswg.org/selectors/#resource-pseudos)
requires both states to imply `:playing`. It also distinguishes buffering
from a timed stall. Two expected-failure tests expose the contradiction. The inherited
helper's ready-state threshold and `:paused` complement need correction.

The volume-lock fallback cannot observe host or operating-system state.
The [time-state definition](https://drafts.csswg.org/selectors-5/#time-pseudos)
permits no matches when no timeline exists, but this engine also accepts
live hosts. Review that boundary and the functional `:current()` form.
The unchanged `:muted` implementation also needs separate validation.

Before merge, replace approximations with host-supported behavior and test
real media playback, seeking, starvation, stalls, muting, and resumption.
Retain native-browser assertions rather than equating synthetic properties
with browser state. Display-state work remains with #178.

Run with Node.js ≥ 22:

```sh
pnpm install
pnpm exec playwright install chromium
pnpm run test:node test/media-state-gaps.test.mts
pnpm run test:media
```
