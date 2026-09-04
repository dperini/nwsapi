Stop state pseudo-classes from re-entering the engine

matchesNative() reaches for node.matches at match time, on the assumption that it is the host's own implementation. jsdom wires Element.prototype.matches back into nwsapi, so resolving ':modal' calls jsdom, which calls nwsapi, which resolves ':modal' again, until the stack is exhausted — and the RangeError is then swallowed and reported as a plain false.
 Measured against 2.2.27, one NW.match(':modal', element) makes 5,428,790 re-entrant calls to Element.prototype.matches. It is 0 with this change.
 Provenance is established once, when the factory runs, from global.Element.prototype, and node.matches is never consulted. A host that passes only a document, as jsdom does, has no native matcher and therefore no native state to read, which is the correct outcome rather than a workaround. A re-entrancy guard stays in place for hosts that pass their window as the global, where the captured matcher can itself be a delegating wrapper.
 This combines the two approaches already proposed in #176 and #170.

Closes #172
Closes #171
Closes #177
