Let a pseudo-class be followed by a quoted attribute selector

The combinator alternative inside the validator's pseudo-class pattern is '[>+~][^>+~]', which consumes the character after the combinator. When that character is the '[' of an attribute selector, the attribute can no longer be parsed: the validator stops mid-selector and the whole selector is rejected. The top-level combinator pattern already uses a lookahead, so this makes the two agree.
 "[class*='a' i]:not(:empty) + [class*='b']" is #175. It reaches jsdom users through @testing-library/user-event, which matches every stylesheet rule when checking pointer-events, so one such rule in a stylesheet breaks unrelated tests.
 The error it raises names '[class*='a' i]:not(:empty)+[class*,,,b,,' as the offending selector, because emit() is passed the array of fragments the validator did match rather than the selector; String() then joins them with commas, which reads as corrupted quotes. It now names the selector.

Closes #175
