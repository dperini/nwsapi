# [NWSAPI](http://dperini.github.io/nwsapi/)

Fast CSS Selectors API Engine

![](https://img.shields.io/npm/v/nwsapi.svg?colorB=orange&style=flat) ![](https://img.shields.io/github/tag/dperini/nwsapi.svg?style=flat) ![](https://img.shields.io/npm/dw/nwsapi.svg?style=flat) ![](https://img.shields.io/github/issues/dperini/nwsapi.svg?style=flat)

NWSAPI is the development progress of [NWMATCHER](https://github.com/dperini/nwmatcher) aiming at [Selectors Level 4](https://www.w3.org/TR/selectors-4/) conformance. It has been completely reworked to be easily extended and maintained. It is a right-to-left selector parser and compiler written in pure Javascript with no external dependencies. It was initially thought as a cross browser library to improve event delegation and web page scraping in various frameworks but it has become a popular replacement of the native CSS selection and matching functionality in newer browsers and headless environments.

It uses [regular expressions](https://en.wikipedia.org/wiki/Regular_expression) to parse CSS selector strings and [metaprogramming](https://en.wikipedia.org/wiki/Metaprogramming) to transforms these selector strings into Javascript function resolvers. This process is executed only once for each selector string allowing memoization of the function resolvers and achieving unmatched performances.

## Installation

To include NWSAPI in a standard web page:

```html
<script type="text/javascript" src="nwsapi.js"></script>
```

To include NWSAPI in a standard web page and automatically replace the native QSA:

```html
<script type="text/javascript" src="nwsapi.js" onload="NW.Dom.install()"></script>
```

To use NWSAPI with Node.js:

```
$ npm install nwsapi
```

NWSAPI currently supports browsers (as a global, `NW.Dom`) and headless environments (as a CommonJS module).

## Supported Selectors

Here is a list of all the CSS2/CSS3/CSS4 [Supported selectors](https://github.com/dperini/nwsapi/wiki/CSS-supported-selectors).

State pseudo-classes from [Selectors Level 4](https://www.w3.org/TR/selectors-4/):

* `:open` and `:closed` — match `<details>`/`<dialog>` elements by their `open` DOM property; other host-language states (open `<select>` drop-downs, `<input>` pickers) are matched only when the host exposes the native pseudo-class.
* `:modal` and `:fullscreen` — match the document's `fullscreenElement` (including the vendor-prefixed forms) and otherwise defer to the host's native `:modal`/`:fullscreen`, since the `<dialog>` "is modal" flag has no DOM reflection.
* `:picture-in-picture` — matches the document's `pictureInPictureElement`, or the host's native pseudo-class.
* `:popover-open` (and its `:popover` alias) — requires the `popover` attribute plus the host's native `:popover-open`, because the attribute declares capability rather than the showing state.
* `:current`, `:past`, `:future` — parsed as valid but match nothing: these moved to Selectors Level 5, which mandates they must not match when no timeline is defined (a static DOM has none). Only the bare forms are supported; the functional `:current(<selector-list>)` form (which no browser ships) is a parse error.


## Features and Compliance

You can read more about NWSAPI [features and compliance](https://github.com/dperini/nwsapi/wiki/Features-and-compliance) on the wiki.


## API

### DOM Selection

#### `ancestor( selector, context, callback )`

Returns a reference to the nearest ancestor element matching `selector`, starting at `context`. Returns `null` if no element is found. If `callback` is provided, it is invoked for the matched element.

#### `first( selector, context, callback )`

Returns a reference to the first element matching `selector`, starting at `context`. Returns `null` if no element matches. If `callback` is provided, it is invoked for the matched element.

#### `match( selector, element, callback )`

Returns `true` if `element` matches `selector`, starting at `context`; returns `false` otherwise. If `callback` is provided, it is invoked for the matched element.

#### `select( selector, context, callback )`

Returns an array of all the elements matching `selector`, starting at `context`; returns empty `Array` otherwise. If `callback` is provided, it is invoked for each matching element.


### DOM Helpers

#### `byId( id, from )`

Returns a reference to the first element with ID `id`, optionally filtered to descendants of the element `from`.

#### `byTag( tag, from )`

Returns an array of elements having the specified tag name `tag`, optionally filtered to descendants of the element `from`.

#### `byClass( class, from )`

Returns an array of elements having the specified class name `class`, optionally filtered to descendants of the element `from`.


### Engine Configuration

#### `configure( options )`

The following is the list of currently available configuration options, their default values and descriptions, they are boolean flags that can be set to `true` or `false`:

* `IDS_DUPES`: true  - true to allow using multiple elements having the same id, false to disallow
* `FORGIVING`: true  - true for `:is()`/`:where()` to drop an item they cannot read, false to throw on it
* `LEGACY`: false    - true for a host that answers none of the modern DOM, see below and `docs/legacy.md`
* `NODE_LIST`: false - true to return a `NodeList`, false to return an `Array`; it reads `NodeList` off the global object, so it works only where that is the host's own global (a browser), and throws when the engine is loaded as a module
* `LOGERRORS`: true  - true to print errors and warnings to the console, false to mute both of them
* `VERBOSITY`: true  - true to throw on an invalid selector, false to answer it as no match


### Examples on extending the basic functionalities

#### `configure( { <configuration-flag>: [ true | false ] } )`

Disable logging errors/warnings to console, disallow duplicate ids. Example:

```js
NW.Dom.configure( { LOGERRORS: false, IDS_DUPES: false } );
```
NOTE: NW.Dom.configure() without parameters return the current configuration.

`LEGACY` (off by default on modern runtimes) is for a host that does not behave the way the DOM
says. With it off, the generated code reads the host directly: `e.localName`,
`e.getAttribute("x")`, `e.nextElementSibling`. With it on, every one of those
reads becomes a call to a helper that knows what the older hosts answered
instead — `class` reachable only as `className`, a URL attribute resolved
unless the second argument asked for the markup, no `hasAttribute`, no
`getElementsByClassName`, no element-only traversal, and comment nodes inside
a `getElementsByTagName('*')` collection.

Legacy cache initialization checks optional runtime features once, when the
first cache is requested. It uses native implementations when available and
does not polyfill missing built-ins. The engine turns the option on when it attaches to a document that
is missing `hasAttribute`, `getElementsByClassName`, `firstElementChild` or
`localName`, so most callers never set it. It is not a language switch: a
build tool can lower the syntax in this file, but it cannot change what the
host hands back. `docs/legacy.md` lists every quirk it handles, what it
cannot supply, and how it is tested.

Changing `LEGACY` or `FORGIVING` clears the compiled resolvers, since both are
read while a selector compiles.

#### `registerCombinator( symbol, resolver )`

Registers a new symbol and its matching resolver in the combinators table. Example:

```js
NW.Dom.registerCombinator( '^', 'e.parentElement' );
```

#### `registerOperator( symbol, resolver )`

Registers a new symbol and its matching resolver in the attribute operators table. Example:

```js
NW.Dom.registerOperator( '!=', { p1: '^', p2: '$', p3: 'false' } );
```

#### `registerSelector( name, rexp, func )`

Registers a new selector, the matching RE and the resolver function, in the selectors table. Example:

```js
NW.Dom.registerSelector('Controls', /^\:(control)(.*)/i,
  (function(global) {
    return function(match, source, mode, callback) {
      var status = true;
      source = 'if(/^(button|input|select|textarea)/i.test(e.nodeName)){' + source + '}';
      return { 'source': source, 'status': status };
    };
  })(this));
```

## Development

Requires Node.js >= 24 and [pnpm](https://pnpm.io) (the version pinned in `packageManager`).

```sh
pnpm install                  # install pinned dev dependencies
pnpm run lint                 # eslint (flat config)
pnpm run min                  # build dist/nwsapi.min.js (terser)
pnpm test                     # both suites below

# node-side regressions against jsdom, no browser needed
pnpm run test:node

# upstream web-platform-tests (sparse + shallow, pinned in .gitmodules)
pnpm run upstream:clone       # materialize upstream/wpt at the pinned ref
pnpm run upstream:verify      # verify ref, sparse patterns and manifest hash

# run upstream WPT selector tests against src/nwsapi.js (Playwright)
pnpm exec playwright install chromium
pnpm run test:upstream                                   # full suite
WPT_FILTER='Attribute presence' pnpm run test:upstream   # individual selectors
WPT_SECTION='Combinators' pnpm run test:upstream         # a whole section

# benchmarks (mitata + jsdom), ported from the legacy test/speed suite
pnpm run bench                                  # all preset groups
pnpm run bench -- --preset default              # one group
pnpm run bench -- --selector 'div:not(.example)' # a single selector

# serve the WPT checkout + repo for interactive debugging via portless
pnpm run serve                # -> https://nwsapi.localhost (proxies $PORT)
# first run on a new machine: `pnpm exec portless trust` once (sudo prompt)
# to install the local CA and start the HTTPS proxy
```

The `upstream/` directory is git-ignored on purpose: the pin of record is the
`ref` field in `.gitmodules` (see `docs/upstream.md`).

What makes this engine fast, what was tried and rejected, and how to measure a
change before claiming it: `docs/performance.md`. Running on a host that
answers none of the modern DOM: `docs/legacy.md`. Where jsdom's engine and a
browser disagree, and which of those are not this engine's bugs:
`docs/dom-selector-differences.md`. The benchmark harnesses and how to read
their charts: `bench/README.md`.

## 💖 Support & Sponsoring

**NWSAPI** powers millions of builds, web scrapers, and testing suites every single day—including key infrastructure like [jsdom](https://github.com/jsdom/jsdom).

Maintaining a zero-dependency, ultra-fast CSS engine that strictly adheres to evolving W3C Selectors specifications takes significant time, research, and testing. If NWSAPI helps your company save time, build features, or run reliable tests, **please consider supporting its ongoing maintenance!**

### Why Sponsor?
* **For Developers:** Keep the project actively maintained, bug-free, and ahead of new browser standard updates.
* **For Businesses:** Ensure the stability and long-term security of a critical dependency in your toolchain.

### 💳 Ways to Contribute

Choose the platform that works best for you or your organization:

* **[GitHub Sponsors](https://github.com/sponsors/dperini):** Monthly tier-based sponsorship directly on GitHub.
* **[Open Collective](https://opencollective.com/nwsapi):** Transparent funding for open-source projects, ideal for corporate backing.
* **[Patreon](https://www.patreon.com/dperini):** Recurring monthly support with backer rewards.
* **[Ko-fi](https://ko-fi.com/dperini):** Fast one-time tips or recurring micro-donations.
* **[Buy Me a Coffee](https://www.buymeacoffee.com/dperini):** Quick, casual one-time donations.
* **[Liberapay](https://liberapay.com/dperini):** Recurrent, zero-fee open-source support.
* **[IssueHunt](https://issuehunt.io/r/dperini/nwsapi):** Fund specific features or bug bounties.

---
*Custom licensing, dedicated support, or priority bug fixes are also available for corporate sponsors. Feel free to reach out!*
