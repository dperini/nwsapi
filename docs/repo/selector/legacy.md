# Legacy DOM hosts

`LEGACY` enables DOM compatibility handling. It is not a JavaScript syntax
fallback, does not transpile this package, and does not supply missing built-ins.
An older browser must first be able to run the source and its dependencies.
See [runtime initialization](legacy-runtime.md) for optional built-in handling.

```js
NW.Dom.configure({ LEGACY: true });
```

Modern documents leave the flag off. Document setup enables it when the host
lacks `hasAttribute`, `getElementsByClassName`, `firstElementChild`, or a string
`localName`. This is a small capability check, not exhaustive detection of
every historical DOM quirk. Set the flag explicitly for subtler differences.

Document changes retain the flag. Changing it clears compiled resolvers and
query plans, because their host reads depend on the mode. Select legacy mode
before using an optional runtime feature that the environment lacks.

## Host reads

Compilation chooses a read table. Modern selections retain direct DOM reads;
single-node attribute matches guard the method. Legacy resolvers call helpers
through local aliases such as `hTag=s.tagOf`. Only used aliases are declared.
The pseudo-class rewrite preserves selector text inside generated string and
regexp literals; text such as `e.localName` is not itself a property read.

Legacy collection lookups filter non-elements. Fragment, ID, sibling, and
ancestor walks use node-level traversal when element-level APIs are absent.
Modern traversal keeps its direct reads. `:scope` no longer requires `classList`.

| Host behavior | Legacy handling |
| --- | --- |
| Attribute names differ from their reflected property names. | Try the markup name, then mappings such as `className`, `htmlFor`, and `colSpan`. |
| A missing attribute returns a property default. | Check the attribute node and its `specified` flag first. |
| URL reads return resolved values. | Probe the document for a raw read through the second argument, attribute node, or ordinary getter. |
| A boolean attribute returns a boolean. | Represent present `true` as an empty string and `false` as absent. The original spelling cannot be recovered. |
| `style` returns an object. | Read `style.cssText`; stringify other non-string values. |
| `hasAttribute` is absent. | Use attribute presence rather than a property default. |
| Wildcard tag collections contain comments. | Keep elements only. |
| Element traversal properties are absent. | Walk `firstChild`, `nextSibling`, `previousSibling`, and `parentNode`, skipping non-elements. |
| `localName` is absent. | Derive it from `nodeName`, removing a namespace prefix and lowercasing HTML names. |
| Class lookup is absent. | Scan descendants and test their class text. |
| `getAttributeNames` is absent. | Read specified names from the attribute collection. |
| `isConnected` is absent. | Walk to the root and check for a document. |
| A form control shadows the form's `id` property. | Read the form's ID attribute. |

The attribute handling follows David Mark's historical survey,
[A is for Attributes](https://web.archive.org/web/20091217095816/http://www.cinsoft.net/attributes.html).
The distinction remains useful when implementing custom DOM hosts; see
[attributes versus properties](https://jakearchibald.com/2024/attributes-vs-properties/).

## Limits

This extraction does not add browser features such as constraint validation
or media state. It does not claim compatibility with historical XML engines.
Use `select`, `match`, `first`, and `closest` when the host lacks the prototypes
needed by `install()`.

The `:disabled`, `:enabled`, `:required`, and `:defined` helpers use legacy
accessors when needed. Their reference assertions pass without expected-failure
markers. Relative `:has()` queries also use legacy parent traversal for sibling
arguments. Other changes from #167 remain outside this extraction.

## Validation

Use Node.js 26 and pnpm ≥ 12.3.4.

```sh
pnpm install
pnpm run test:legacy
pnpm run test:unit test/repo/unit/legacy-runtime.test.mts
pnpm run cover
```

The Node tests use jsdom and a proxy host that hides modern APIs and simulates
attribute and collection quirks. The WPT runner uses the same host fixture in
Chromium to check native answers and DOM mutations. Coverage uses WPT for the
engine and Node for the adapter. These tests do not run historical browsers.

The suite retains the legacy tests from archived #167, including generated-code
inspection, mode changes, scoped queries, missing `WeakMap`, and non-element
collection entries. jsdom 30 supplies a separate selector implementation for
reference comparisons. Modern/legacy parity tests instead compare the same
engine in both modes and do not establish selector-spec correctness.
