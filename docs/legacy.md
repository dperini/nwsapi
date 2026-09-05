# Legacy hosts

Most of this engine assumes a DOM that behaves. A tag or class lookup returns
elements, `id` and `class` are reflected as properties, and an element can be
asked for its parent or its next sibling directly. `Config.LEGACY` is for a
host where none of that holds, and it is off by default on modern runtimes.
Select legacy mode before querying if the runtime is missing modern built-ins.
Legacy cache initialization checks optional features once and uses native
implementations when available. Document changes preserve the legacy flag. See
`docs/legacy-runtime.md` for the shared initialization contract; this flag
does not polyfill other missing built-ins.

```js
NW.Dom.configure({ LEGACY: true });
```

You rarely have to set it. When the engine attaches to a document it checks
whether the host has `hasAttribute`, `getElementsByClassName`,
`firstElementChild` and `localName`, and turns the option on by itself if any
of them is missing. Setting it by hand is for a host that is missing something
subtler, or for testing the path. Changing it clears the compiled resolvers,
because the option is read while a selector compiles.

## What it changes

The generated code reads the host through one of three tables, chosen once per
compile, so the ordinary path carries no branch and no call:

| host | what a tag test compiles to |
| --- | --- |
| behaves, selecting | `e.localName=="div"` |
| behaves, matching one node a caller passed | same, with the attribute tests asking for the method first |
| `LEGACY` | `hTag(e)=="div"` |

In the third case `hTag` is a local of the resolver, declared in its own head
as `hTag=s.tagOf`, so a candidate costs one call rather than a property load
and a call. Only the helpers a selector uses are declared.

The engine's own loops — the sibling walks behind `:nth-child()`, the subtree
walk behind `#id`, the fragment walks in `byTag()` and `byClass()` — keep
their direct property reads and take a second loop for the legacy case. Those
run per sibling rather than per query, which is the one place a helper call
would show up in a measurement.

The pseudo-classes are another thirty emission sites, most of them a tag test
in front of a property. Converting each by hand is how one gets missed, so a
legacy resolver takes one pass over the code that was generated and rewrites
the reads it recognizes into the same helper calls. There is a test that
audits the output: no legacy resolver may contain a direct host read.

Two optimizations stay off under the option: the ancestor filter and the
descent. Both only ever skip work, so switching them off changes speed and not
answers, and leaving them on would put a helper call in a per-element loop.

## The quirks it handles

Most of these are the attribute-versus-property split. A selector matches
**attributes**, and the hosts in question answered `getAttribute()` with the
DOM **property** behind the attribute, which made the two indistinguishable
through that one call. jQuery split `.attr()` from `.prop()` in 1.6 over
exactly this and kept `propFix`.

The table below follows David Mark's survey of those behaviors,
[A is for Attributes](https://web.archive.org/web/20091217095816/http://www.cinsoft.net/attributes.html),
which tested each one across the browsers of the day rather than sniffing for
them; his library is [My-Library](https://github.com/david-mark/My-Library).
His conclusion is what these helpers do, and he puts it more bluntly than a
table can: read the DOM property **by attribute name**, and answer `null` for
an attribute the markup never set rather than the property's default. He calls
the alternative "the basic concept botched by the various attr methods found
in major libraries".

Three of his findings are why this is less obvious than it looks, and each one
is a test here:

1. **A missing attribute could answer a default.** IE 6 and 7 answered
   `getAttribute('enctype')` with the form's default when the markup had set
   nothing, so a value cannot decide presence. Presence comes from the
   attribute node, where `specified` says what the markup set.
2. **Boolean attributes lose a distinction that cannot be recovered.** The
   host answers the property, so `<input checked>` and
   `<input checked="checked">` read the same. He reports the empty string for
   both, which is the markup of the bare form, and so does this engine: the
   presence test works either way, and the value test agrees with the
   reference engine on the bare form.
3. **URL resolution was not one browser's bug.** IE up to 7 resolved URL
   attributes and took a second argument, `2`, to ask for the markup. Opera up
   to 9.27 resolved a form `action` with no way to ask otherwise, and 8.54
   resolved six of them. So which read returns the markup is detected once per
   document — the second argument, the attribute node, or the ordinary read —
   rather than assumed.

Also catalogued at [perfectionkills.com](https://perfectionkills.com/) and
[mathiasbynens.be/notes](https://mathiasbynens.be/notes); the modern statement
of the split is Jake Archibald's
[attributes vs properties](https://jakearchibald.com/2024/attributes-vs-properties/).

| what the host did | what the helper does |
| --- | --- |
| `getAttribute('class')` answered `null`; the value was only on `className`. Same for `for` and `htmlFor`, and the camel-cased names like `colspan` and `maxlength`. | Asks for the attribute, then for the property name it was hidden behind. |
| `getAttribute('href')` answered an absolute URL, not the markup. Some hosts took a second argument, `2`, to ask for the markup; others took nothing. | Probes once per document with a relative URL to find which read answers the markup, then uses that one. |
| A missing attribute could answer the property's default, such as a form's `enctype`. | Takes presence from the attribute node and its `specified` flag, never from a value. |
| `getAttribute('style')` answered a style object, and an event attribute answered a function. | Reads `style.cssText` for `style`, and stringifies anything else that is not a string. |
| A boolean attribute like `checked` answered `true` or `false`. | Reads `true` as the empty string, which is the markup of `<input checked>`. `[checked]` and `[checked=""]` both work; `[checked="checked"]` cannot be told apart on such a host. |
| No `hasAttribute` at all. | Falls back to the attribute node, where `specified` separates an attribute the markup set from one the element merely could have had. |
| `getElementsByTagName('*')` and `children` included comment nodes. | Filters the fetch to elements, so a comment never reaches a test that would throw on it. |
| No `firstElementChild`, `nextElementSibling`, `previousElementSibling` or `parentElement`. | Walks `firstChild`/`nextSibling`/`parentNode` and skips anything that is not an element. |
| No `localName`; `nodeName` was upper case for HTML and carried the prefix in XML. | Takes the part after any colon and lowercases it for an HTML document. |
| No `getElementsByClassName`. | Asks for every element under the context and tests the class, which is the work the fetch normally avoids. |
| No `getAttributeNames`. | Collects the names from `attributes`, keeping the ones `specified` marks. |
| No `isConnected`. | Walks up to see whether the root is a document. |
| A form exposed its controls as properties, so a control named `id` could stand in front of the element's own `id`. | Reads a form's id from the attribute rather than the property. |

## What it does not do

- **The pseudo-classes whose properties postdate those hosts.** `:valid`,
  `:invalid`, `:in-range`, `:playing` and their neighbours read `validity`,
  `networkState` and friends. On a host without them the tests read
  `undefined` and match nothing, which is what a selector for a feature the
  host does not have should do. They do not throw, which is tested.

  The ones whose properties are older than those hosts do work, and agree
  with the reference engine: `:checked`, `:disabled`, `:enabled`, `:empty`,
  `:root`, `:link`, `:any-link`, `:target`, `:lang()`, `:defined`,
  `:optional`, `:read-write` and `:read-only`. Two of them only started
  working while this was being written, because the audit that found the
  direct reads also found two bugs in the ordinary path: `:enabled` matched
  controls that `:disabled` matched as well, since it read only the element's
  own property and not the fieldset above it, and `:defined` matched nothing
  at all, since it asked the custom element registry about every element
  including the built-in ones.
- **`install()`.** Replacing the host's own `querySelectorAll` needs
  `Element.prototype`, which the oldest hosts do not expose. Use the engine's
  own `select()`, `match()` and `first()` there.
- **XML documents on those hosts.** Their XML support differed enough that the
  namespace handling here is written for the modern rules only.

## How it is tested

Those browsers cannot be run here, so `test/node/legacy-host.mjs` stands in for
them. It wraps a jsdom document in a `Proxy` that hides the modern APIs and
answers the old ones the old way, including the comment nodes in a tag
collection and every attribute behaviour in the table above.

It takes a `urls` option, because one of the findings above is that hosts
differed in how a URL attribute could be read: `'flag'` answers the markup to
a second argument the way IE up to 7 did, and `'plain'` never answers it the
way Opera did. Both are tested.

`test/node/legacy.spec.mjs` then runs 64 selector shapes through it — tags,
classes, ids, every attribute operator, all four combinators, the structural
and logical pseudo-classes, and comma lists — plus `match()`, `first()`,
`closest()` and element-scoped queries. Each answer is compared against what
jsdom's own `querySelectorAll` says about the same markup, so the expectations
come from a second implementation rather than from this one. One test also
forces the option on over a modern document and checks that all 64 shapes give
the same answers either way.

```sh
pnpm exec playwright test --project=node -g legacy
```

## Who it is for

`pnpm run browsers:share` prints the current numbers, with the data it used
and how old that data is. As of `caniuse-lite` 1.0.30001810, whose newest
browser release is dated 2026-07-30, IE 8 and older is 0.0000% of recorded
usage globally, while the per-place tables still record it in twelve places —
0.900% of China's page views, 0.357% of Ireland's, 0.154% of Japan's — which
weighted by the number of people online in each comes to roughly ten million
people, nearly all of them behind the one Chinese figure.

That is the case for an option rather than for a default. Those users get the
old handling from one flag, and everyone else does not pay a property read per
candidate for them.
