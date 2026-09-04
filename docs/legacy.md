# Legacy hosts

Most of this engine assumes a DOM that behaves. A tag or class lookup returns
elements, `id` and `class` are reflected as properties, and an element can be
asked for its parent or its next sibling directly. `Config.LEGACY` is for a
host where none of that holds, and it is off by default.

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

Two optimizations stay off under the option: the ancestor filter and the
descent. Both only ever skip work, so switching them off changes speed and not
answers, and leaving them on would put a helper call in a per-element loop.

## The quirks it handles

Most of these are the attribute-versus-property split. A selector matches
**attributes**, and the hosts in question answered `getAttribute()` with the
DOM **property** behind the attribute, which made the two indistinguishable
through that one call. Every library of the era carried a table for it: jQuery
split `.attr()` from `.prop()` in 1.6 and kept `propFix`, and David Mark's
[My-Library](https://github.com/david-mark/My-Library) feature-tested each
case rather than sniffing the browser. The behaviors are catalogued at
[perfectionkills.com](https://perfectionkills.com/) and
[mathiasbynens.be/notes](https://mathiasbynens.be/notes), and the modern
statement of the split is Jake Archibald's
[attributes vs properties](https://jakearchibald.com/2024/attributes-vs-properties/).

| what the host did | what the helper does |
| --- | --- |
| `getAttribute('class')` answered `null`; the value was only on `className`. Same for `for` and `htmlFor`, and the camel-cased names like `colspan` and `maxlength`. | Asks for the attribute, then for the property name it was hidden behind. |
| `getAttribute('href')` answered an absolute URL, not the markup. The second argument, `2`, asked for the markup. | Passes `2` for the URL attributes. Other hosts ignore it. |
| `getAttribute('style')` answered a style object, and an event attribute answered a function. | Reads `style.cssText` for `style`, and stringifies anything else that is not a string. |
| A boolean attribute like `checked` answered `true` or `false`. | Reads `true` as present, which is what `[checked]` asks, and as the attribute name, which is what `[checked="checked"]` compares. |
| No `hasAttribute` at all. | Falls back to the attribute node, where `specified` separates an attribute the markup set from one the element merely could have had. |
| `getElementsByTagName('*')` and `children` included comment nodes. | Filters the fetch to elements, so a comment never reaches a test that would throw on it. |
| No `firstElementChild`, `nextElementSibling`, `previousElementSibling` or `parentElement`. | Walks `firstChild`/`nextSibling`/`parentNode` and skips anything that is not an element. |
| No `localName`; `nodeName` was upper case for HTML and carried the prefix in XML. | Takes the part after any colon and lowercases it for an HTML document. |
| No `getElementsByClassName`. | Asks for every element under the context and tests the class, which is the work the fetch normally avoids. |
| No `getAttributeNames`. | Collects the names from `attributes`, keeping the ones `specified` marks. |
| No `isConnected`. | Walks up to see whether the root is a document. |
| A form exposed its controls as properties, so a control named `id` could stand in front of the element's own `id`. | Reads a form's id from the attribute rather than the property. |

## What it does not do

- **The HTML5 pseudo-classes.** `:checked`, `:disabled`, `:valid`,
  `:placeholder-shown`, `:playing` and their neighbours read properties that
  postdate these hosts — `validity`, `readOnly`, `networkState`. On a host
  without them the tests read `undefined` and match nothing, which is the
  behaviour a selector for a feature the host does not have should have.
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
