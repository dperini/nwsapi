Build the QSA wrapper argument list in one allocation

The wrappers install() puts on the DOM prototypes forward their arguments to parseQSArgs as [].slice.call(arguments).concat(resolver), which allocates twice for a call that carries at most three arguments. argsWith() sizes the list by arity in a single allocation, unrolled to eight and falling through to the general form beyond that.
 Measured in isolation, building the list drops from ~113ns to ~9ns, and with the apply included from ~119ns to ~14ns.
 End to end in Chromium, three rounds with the order swapped, an installed querySelector('#root') against a 200-element document:
 before 175ns 174ns 168ns (wrapper 98ns, 97ns, 94ns) after 95ns 92ns 90ns (wrapper 19ns, 17ns, 17ns)
 That is 1.85x on a cheap query, where fixed overhead is most of the call and the wrapper was 56% of it. On an expensive one it disappears into the query: the same change against a 200-match 'p.x' is ~1% of 11.7us and not separable from run-to-run noise.
