# Media and timeline states

Resource selectors use the host's native matcher when it exposes the requested
state. If native matching is unavailable, HTML audio and video elements use
observable properties for playing, paused, seeking, muted, and buffering.
Playback at time zero or while awaiting data can still be playing. Muting reads
the live `muted` property; setting volume to zero does not set that state.

The buffering fallback requires active playback, an active network load, and
insufficient data for the next frame. A paused element does not buffer. A network
load alone does not establish a timed stall: `:stalled` and `:volume-locked`
require native support and otherwise match nothing. No listeners or timers are
installed to approximate those host-only states.

Time selectors `:current`, `:past`, `:future`, and `:current(...)` delegate to
the host timeline and match nothing when it is unavailable. Functional
`:current()` accepts a nonempty list of compound selectors; its arguments are
validated even with no candidates or no native timeline. Nested invalid
arguments follow the existing forgiving-list configuration.

These behaviors follow the draft
[resource-state definitions](https://drafts.csswg.org/selectors/#resource-pseudos)
and [time-dimensional definitions](https://drafts.csswg.org/selectors-5/#time-pseudos).
They do not claim to emulate operating-system volume policy or a host timeline.

Run `pnpm test test/repo/unit/media-state.test.mts` for state contracts and
`pnpm run test:media` for all retained display-state assertions plus real media
playback, pause, seek, mute, and completion checks in Chromium. The default CI
browser command includes this suite. The upstream manifest also includes a
media/time fixture for combined coverage and both generated builds.
