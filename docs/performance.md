# Performance

This is what we learned making this engine fast, kept next to the code so the
next change does not re-learn it. Every number here was measured with
`bench/report.mjs` or `bench/selectors.bench.mjs`, and the ones with a `->`
compare two builds in one process. If you are about to optimize something,
read [How to measure](#how-to-measure) first, then
[What did not work](#what-did-not-work) so you do not spend a day on
something already ruled out.

## Where the time goes

A query has two halves:

1. **Fetch.** Ask the host for a candidate list — `getElementsByTagName`,
   `getElementsByClassName`, `getElementById`. `collect()` picks the part of
   the selector to fetch by, and it picks the rightmost one.
2. **Filter.** Run the compiled resolver over that list. The resolver is
   JavaScript this engine generated for that one selector, so the selector is
   parsed once and matched many times.

Almost all of the cost is **calls across the host boundary**: reading
`localName`, calling `getAttribute`, stepping to `parentElement`. In jsdom
each of those goes through a wrapper object; in a browser each is a call into
C++. Ordinary JavaScript around them is close to free by comparison, and that
one fact decides most of what follows. Over 6344 elements in jsdom, one read
per element and nothing else, with the value consumed so it cannot be
optimized away:

| read                       | cost     |
| -------------------------- | -------- |
| `e.localName`              | 0.240 ms |
| `e.nodeName`               | 0.346 ms |
| `e.className`              | 0.400 ms |
| `e.id`                     | 0.478 ms |
| `e.parentElement`          | 0.520 ms |
| `e.firstElementChild`      | 0.649 ms |
| `e.hasAttribute('href')`   | 0.652 ms |
| `e.getAttribute('id')`     | 0.669 ms |
| `e.nextElementSibling`     | 0.700 ms |
| `e.previousElementSibling` | 0.716 ms |
| `e.getAttribute('href')`   | 0.814 ms |
| `e.getAttribute('class')`  | 0.826 ms |
| `e.classList.length`       | 2.028 ms |
| `e.attributes.length`      | 2.481 ms |
| `e.children.length`        | 2.605 ms |

Run `pnpm run bench:accessors` for the current version of that table, and
`-- --markdown` to print it ready to paste.

So: **fewer host calls beats cleverer JavaScript**, and a property read beats
a method call that answers the same question.

## The rules that paid

### Fetch the smallest list you can, and let the index do the work

`getElementsByClassName` over 800 elements carrying 12 classes each costs
0.042 ms. Testing the same class per element costs 0.123 ms with a regular
expression, 0.141 ms with a hand-rolled scan, and 0.297 ms with
`classList.contains`. Asking the host for a named index is cheaper than any
per-element test, so the fetch does as much of the work as it can and the
resolver only tests what is left.

### Sometimes the direction is wrong, not the code

`div ul li a` matched right to left starts from every `<a>` and rejects them
one at a time: 2370 candidates to return 10. Descending from the leftmost tag
asks each level for the next, and the set shrinks before it grows —
94 -> 6 -> 21 -> 10. Same answer, two orders of magnitude apart:

| selector      | right to left | descending |
| ------------- | ------------- | ---------- |
| `div ul li a` | 1.189 ms      | 0.098 ms   |
| `div p a`     | 1.277 ms      | 0.139 ms   |
| `dl dd a`     | 1.181 ms      | 0.075 ms   |

Descending is not always cheaper: it costs one scoped lookup per element of
every level it iterates, so a level that explodes pays more than the pass it
replaced. `descendChain()` budgets the lookups against the size of the pass
it is replacing, and bounds the levels still to come by how many elements of
their part the whole context holds. That is what takes `ul li a`
(160 + 604 lookups against 2370 anchors, 1.56 ms -> 0.63 ms) and declines
`.app .card .row a` (1 + 400 + 800 against 430) before it has spent 400
lookups finding out.

### Reject a candidate before walking its ancestors

A candidate can only match `div ul li a` if a div, a ul and a li all appear
above it, and that is much cheaper to answer than the match. The tags above
an element are summarized as bits in one integer; an element's summary is its
parent's summary plus the parent's own bit, so a chain is walked once rather
than once per candidate. Bits collide, which only costs a candidate that was
going to be rejected — the filter never decides a match, it only skips work.
This is what Blink does for CSS with
[`selector_filter.h`](https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/css/selector_filter.h).

| selector       | before  | after    |
| -------------- | ------- | -------- |
| `div ul li a`  | 2.66 ms | 1.08 ms  |
| `ul li a span` | 1.28 ms | 0.382 ms |
| `dl dd a`      | 1.68 ms | 1.07 ms  |

A filter that rejects nothing is pure overhead, so it samples its own keep
rate over the first 64 candidates and switches off when it is not earning,
retrying after 4096. Without that, `main section ul li a` paid 0.660 ms for a
filter that kept everything; with it, 0.329 ms.

### Cheapest check first, in generated code especially

When several conditions have to hold, the first one decides what the rest
cost. Source order is written for a reader; execution order is what the
machine pays, and a code generator emits conditions in the order it parses
them — which here meant the last one emitted ran first, so `div[data-x="1"]`
tested the attribute on every candidate before asking whether it was a `div`.
Holding the tag test and applying it when the compound ends measured
1.09x-1.27x on the selectors it affects.

The same reasoning one level up: read the size of a batch before touching it.
A budget that drains *while* the work happens is worse than no budget, since
it pays for most of the work and then throws it away — measured 3x slower
than not descending at all on one such path.

### Prefer the property to the call, and the comparison to the pattern

Three cases of the same lesson in the generated conditions. The numbers are
for the whole test, pattern or comparison included, over the same 6344
elements:

- A class test called `getAttribute('class')`; the attribute is reflected as
  a property, so it reads `e.className` and falls back when the reflection is
  not a string (in a browser, SVG gives an `SVGAnimatedString`). 0.578 ms
  against 0.851 ms. Once the value comes from a property, the regular
  expression, a hand-rolled scan and the helper call are level with each other
  — 0.601, 0.588 and 0.578 ms — so the spelling of the test stopped mattering
  and only the source of the value did.
- An id test ran `/^title$/.test(e.getAttribute('id'))`. An exact comparison
  is what the selector means: `e.id == "title"`, 0.383 ms against 0.717 ms.
- An attribute value test built a regular expression for `[data-x="1"]`,
  where the DOM already hands back a string. A string comparison is
  1.05-1.08x — small, because the cost is `getAttribute` rather than the
  match, but it is free to take.

### Keep the legacy path out of the common one

Two of those changes trade a host call for a reflected property, so they
depend on the reflection being what the DOM says it is. Where that is only
true of hosts newer than some version, the old handling belongs behind a flag
rather than in the middle of the hot expression.

**`Config.LEGACY`, off by default**, is that flag, and it is the only option
this work adds — `FORGIVING` is upstream's and is about whether `:is()` and
`:where()` swallow an item they cannot read, which has nothing to do with the
host. With it off, the generated code reads the host directly. With it on,
every one of those reads becomes a call to a helper that knows what the older
hosts did instead, and the helpers are declared as locals of the resolver so a
candidate costs one call rather than a property load and a call.
[`docs/legacy.md`](legacy.md) describes the whole layer, the quirks it
handles and how it is tested; what follows is why it is an option and not a
default.

How old that is: IE 8 shipped in March 2009, over 17 years ago. Node.js was
two months from its first release, npm was a year away, the first iPad was a
year away, Instagram was 18 months away, and *Game of Thrones* was two years
from airing. IE 9 stopped putting comments in that collection 15 years ago,
and Microsoft retired the last IE in June 2022. Which is the point of putting
this behind an option rather than in the middle of a per-candidate test: it is
a promise to a host nobody here can test against, so it should cost nothing to
the hosts we can.

Note what the flag is *not* about: the language. A build tool can lower the
syntax in this file to anything, and `Map` and `WeakSet` have polyfills, so
the way the source is written sets no floor for where it runs. What a build
tool cannot do is change how the host behaves — a collection that hands back
comment nodes keeps doing it — and that is exactly the kind of difference an
option has to carry. Toggling it clears the compiled resolvers, since the flag
is read while a selector compiles.

The one exception that is **not** legacy stays in the default path, and is
moved out of line instead of behind a flag:

- **`className` on an SVG element is not a string.** SVG 1.1 defined
  `SVGElement.className` as an `SVGAnimatedString`, SVG 2 deprecated it, and
  Chrome, Safari, Firefox and jsdom all still expose it. Reading it without
  checking the type matches the class against `[object SVGAnimatedString]` and
  quietly finds nothing. So a class test calls `s.classOf(e)`, one function
  that reads the property and asks for the attribute when it is not a string,
  rather than writing that choice into every generated resolver. Measured
  against the inline form, the call is free: 0.504 ms, where the inline check
  is 0.557 ms and no check at all is 0.517 ms. A test covers it (`the class of
  an SVG element is not a string`) and it fails without the check.
- **Before DOM4, `className` lived on `HTMLElement`, not `Element`.** In
  those browsers an XML or MathML element had no `className` at all, so the
  same type check is what makes the fallback correct there rather than an
  accident.
- **In IE up to 7, `getAttribute('class')` returned null** — the attribute
  had to be asked for as `className`, the same mapping that made `for` into
  `htmlFor`. That era also had `getAttribute` hand back property values
  rather than attribute strings: `href` came back resolved to an absolute
  URL unless you passed the non-standard second argument, `style` came back
  as an object. So the property read this engine now prefers was also the
  more reliable of the two on the browsers that had those quirks. (History,
  not something this engine still handles: it cannot run there, see below.)
- **`e.id` has no such exception.** `id` is a string on `Element` for every
  element kind, SVG included, and a form's named-property getter does not
  shadow it, because named properties are only exposed for names that are
  not already on the prototype chain.

**How far back this code can run at all.** Not a syntax question, since a
build tool lowers syntax and `Map` and `WeakSet` have polyfills. The floor is
set by the DOM this engine calls, which no build step supplies, and
`Config.LEGACY` is what stands in for most of it. Printed by
`pnpm run browsers:share`:

| what the engine needs | first shipped in | how long ago | usage without it | used by |
| --- | --- | --- | --- | --- |
| `getElementsByClassName` | chrome 4, firefox 3, safari 4 | 17 years ago | 0.00% | the class fetch |
| `closest()` | chrome 41, firefox 35, safari 9 | 12 years ago | 0.33% | installing over the host |
| `matches()` | chrome 34, firefox 34, safari 8 | 12 years ago | 0.28% | handing a state pseudo-class back |
| `getAttributeNames()` | chrome 61, firefox 45, safari 10.1 | 9 years ago | 0.82% | namespaced attribute selectors |
| `isConnected` | chrome 51, firefox 49, safari 10 | 10 years ago | 0.57% | `:lang()` |

With the option on, the first three of those are shimmed and the last two are
answered from `attributes` and from a walk to the root, so the floor is a host
with `getElementsByTagName`, `getElementById` and node-level traversal —
which is every browser that ever shipped. Without it the engine wants a DOM
from about a decade ago. What the option cannot supply is the HTML5 properties
behind pseudo-classes like `:checked` and `:valid`; see
[`docs/legacy.md`](legacy.md).

**And how much of the web that is.** `pnpm run browsers:share` prints it from
the `caniuse-lite` in devDependencies. From 1.0.30001810, whose newest browser
release is dated 2026-07-30, as a share of the 96.7% of usage it records:

| browsers                                       | share of usage |
| ---------------------------------------------- | -------------- |
| IE 8 and older — the quirk `LEGACY` exists for | 0.0000%        |
| IE 9 to 11, which do not have that quirk       | 0.2663%        |
| any browser released before 2016               | 0.4877%        |
| any browser released before September 2017     | 0.8229%        |
| any browser released before 2020               | 1.1240%        |

Read the first two rows together: what is left of Internet Explorer is IE 11,
and IE 11 puts elements in an element collection like everything else. So the
global sample has nothing left that needs this option at all, and the newest
DOM feature the engine wants is missing from under 1% of page views.

The per-place tables in the same package are sampled separately and are
coarser, and they do still record some. Share of each place's own page views:

| place                | IE 8 and older | all IE |
| -------------------- | -------------- | ------ |
| China                | 0.900%         | 5.398% |
| Ireland              | 0.357% (IE 7)  | 0.357% |
| Japan                | 0.154%         | 0.206% |
| Russia               | 0.088%         | 0.146% |
| Taiwan               | 0.050%         | 0.099% |
| Netherlands, Germany, Ukraine, Algeria, Cambodia, French Guiana, Cape Verde | under 0.02% each | |

Twelve of the 232 places in the data record any of it. Multiplied by roughly
how many people are online in each — about 1.09 billion in China, 104 million
in Japan, 130 million in Russia, 4.6 million in Ireland — the whole set comes
to something like ten million people, and 97% of that is the one Chinese line
item. The two views disagree because they are different samples at the same
noise floor, so the size of this population is somewhere between nothing and
ten million, and shrinking either way: the dataset from a year earlier put the
global figure at 0.0332%, or about two million.

Which is the shape of the trade. The option costs the other 99.9% one property
read per candidate if it is on by default, and costs those users nothing when
it is off, because one flag turns it back on.

### Do not pay for what an earlier stage guarantees

- An attribute test asked the candidate for `getAttribute` before calling
  it. Selecting works through a list of elements this engine fetched itself,
  so the read only confirms what the fetch already guarantees; dropping it
  measures 0.586 ms against 0.614 ms on the test alone, and 2-3% end to end.
  Matching keeps the guard, since that is where a caller's own node arrives.
- A selector whose only part was used for the fetch still compiled a resolver
  that copied its input — `div`, `.example`, one item of `label, [aria-label]`.
  There is no resolver for that now, 1.03x on wide selections.
- `:not(.a)` called back into `match()` per candidate, which costs a cache
  lookup and a resolver call to answer what one inlined condition answers. A
  compound argument compiles in place; one carrying a combinator keeps the
  call, because walking inside the negation would move the element the
  surrounding loop is holding.

### Watch what the JIT does with the generated code

`--trace-deopt` on a mixed workload reported "reason: out of bounds" against
`Resolver` on **every call**: the candidate loop was written
`while((e=c[++k]))`, which finds the end of a list by reading one index past
it, and V8 answers an out-of-bounds load by throwing away the optimized code.
Bounding the loop with the length removed it. The throughput change was
modest (1.31x on one shape, noise on others), but a function that deoptimizes
per call cannot be reasoned about at all.

Re-run that check after touching codegen:

```sh
node --expose-gc --trace-deopt bench/report.mjs --rounds 1 2>&1 |
  grep 'JSFunction Resolver'
```

A whole report run — 21 cases, thousands of queries — currently prints one
line, `reason: wrong map`, which is a resolver seeing its second kind of
element and settling. What must not appear is `out of bounds`, or a count
that scales with the number of queries: that is a resolver being thrown away
and rebuilt per call.

### Caches: measure the size, and do not hold the DOM

- A strict LRU evicted with `Map.delete`, and V8 keeps a deleted entry in the
  backing store until the map rehashes, so finding the oldest entry walked
  every tombstone. `Map.set` was 28% of run time on an 8000-selector
  workload. Two generations — fill the young one, promote it, drop the old one
  whole — took 3000 selectors from 22.72 ms to 0.973 ms.
- A cached plan must not carry results or a context, or a query keeps every
  element it matched alive. The retention rule is checked by a test using
  `WeakRef`, not by review.
- The ancestor filter's summaries key on elements, so they are dropped with
  the call that built them: an element that moved in between would otherwise
  carry a summary describing where it used to be.

### Skip work whole queries do not need

- `#id` walked the document, because nwsapi reaches for `document.all` and
  jsdom does not implement it. `getElementById` cannot answer alone (a
  document may hold an id twice, and `querySelectorAll` matches all of them),
  but it settles in constant time whether the id exists at all —
  `select('#missing')` 2.19 ms -> 0.0007 ms — and where the first one is,
  which is all `querySelector` wants: 3.74 ms -> 0.0007 ms.
- `:hover` needs two capture-phase listeners and a reference to the last
  hovered element. They are installed the first time a `:hover` selector is
  compiled, not for every document the engine attaches to.
- A constant `:nth-child(3)` needs no index: the generated code counts
  siblings and stops as soon as the index is exceeded. 116 us -> 46.5 us. The
  of-type forms keep the cached list, since comparing the name of every
  sibling stepped over costs more than the list avoids (measured 2.0x and
  2.6x slower).

## What did not work

Each of these was implemented and measured, and each is here so it stays
dead:

| idea                                             | result                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| Greedy ancestor walks for descendant chains      | 10 walks and 885 walks cost the same once the filter rejects first    |
| Memoized chain state per candidate               | 2.16 ms against 1.31 ms                                              |
| One document-order pass with a level stack       | the bare traversal of 6344 elements costs 1.9 ms, more than the query |
| `:nth-of-type` counting via a scoped tag lookup  | 1.3x on `div`, 1.7x worse on `p` and `li`                            |
| `collection.item(i)` or `Array.from` to copy     | quadratic through jsdom's proxy: 66 us per element at n=2370          |
| `classList.contains` for a class test            | 0.297 ms against 0.123 ms for the regular expression                 |
| Hoisting regular expression literals out of codegen | direction flipped between runs                                    |
| Dropping the `e&&` guard before a combinator walk | no measurable change; it is a local test, not a host call            |
| A result cache keyed by selector                 | not attempted on purpose, see below                                  |

The last one is a design decision rather than a measurement. jsdom 30's
engine keeps the result of a query until the document changes, which is worth
7x on a repeated query and is why some rows of the standing report need
reading twice (`bench/README.md` explains the star). Handing back a
remembered set means knowing every way the document could have changed since,
and getting that wrong returns a wrong answer rather than a slow one.

## How to measure

The full contract is in `bench/README.md`. The short version:

- **Interleave, in one process.** Absolute timings drift by tens of percent
  between runs, so two numbers measured minutes apart say nothing and the same
  two measured microseconds apart say everything. `bench/report.mjs
  --baseline <path>` runs two builds and jsdom's engine in one process; get a
  baseline with `git show <ref>:src/nwsapi.js > /tmp/before.js`.
- **Check the answer before the time.** The report compares every result
  against `querySelectorAll` and fails if they disagree. A fast wrong answer
  is not a fast answer.
- **Measure the shape you are claiming.** An ordering change only shows up
  when two conditions survive to run; a cache change only shows up on a
  working set that does not fit. Most compounds reach the matcher with one
  condition left, because the fetch already used the other one.
- **Write down what failed.** Add it to the table above with its number. The
  value of a performance pass is mostly in what it rules out.
