# turbo-dom

A **pure-Rust DOM**: a lazy, copy-on-write tree built over an
[html5ever](https://github.com/servo/html5ever) Structure-of-Arrays parse buffer, with
turbo-dom's one Chrome 156-checked selector engine, a CSSOM, a partial `getComputedStyle`,
events, shadow DOM, mutation records and UTF-16-exact parsing. It is a plain Rust API with no
JS boundary. On a chatty per-node workload it measured ~2.7x turbo-dom's JS runtime, while a JS
caller going through WASM measured ~0.55x, so this crate serves Rust consumers only (numbers
from before 0.6.0; see [BENCHMARKS-history](../../docs/BENCHMARKS-history.md)).

## Where it sits

The base of the turbo-dom crate family (0.8.6)
([docs/CONSOLIDATION.md](../../docs/CONSOLIDATION.md)):

```
turbo-dom ──► turbo-dom-layout ──► turbo-dom-raster
    └───────► turbo-dom-browser-env (+ turbo-dom-v8)
```

Consumers: **turbo-test** and **turbo-surf** (through turbo-dom-browser-env and directly),
**turbo-html2pdf** (through turbo-dom-layout's cascade). The npm package
`@miaskiewicz/turbo-dom` is the separate JS-consumer path; it does not use this crate.

## Install

```bash
cargo add turbo-dom        # turbo-dom = "0.8"; Rust 1.100.1+
```

Dependencies: html5ever / markup5ever_rcdom 0.39, cssparser 0.37, rustc-hash, smol_str,
smallvec, unicode-bidi, regress, log. No napi, no wasm-bindgen.

## Features

None.

## API

Crate root: `Dom`, `Tree`, `Handle`, `Event`, `ParseOptions`, `NodeRef`, `DocumentExt`; the
parser core is `turbo_dom::core` (`parse_html_document`, `parse_html_soa`,
`parse_html_soa_with_compat_mode`, `Soa`, `Node`).

Node types include `NodeType::CDataSection` (`Tree::create_cdata_section_utf16`; character
data, serialized as escaped text in HTML). `Tree::set_processing_instructions(true)` (or the
`parse_*_with_processing_instructions` constructors) parses `<?target data?>` as a
ProcessingInstruction like Chrome 156; the default keeps html5lib-tests' bogus comment.

```rust
use turbo_dom::{Dom, DocumentExt, Event};
use turbo_dom::rtdom::{cascade, serialize};

let mut dom = Dom::parse("<main class=grid><div class=card id=hero>hi</div></main>");

// query (version-cached), read attrs/text — zero boundary
let cards = dom.tree.query_selector_all("div.card");
let id = dom.tree.get_attribute(cards[0], "id");          // Some("hero")
let text = dom.tree.text_content(cards[0]);               // "hi"

// partial, honest getComputedStyle (specificity, inheritance, color canon)
let style = cascade::computed_style(&dom.tree, cards[0]);
let color = cascade::get_property_value(&style, "color");

// ergonomic NodeRef facade (descendant-scoped)
let title = dom.tree.query("div.card");

// event dispatch; a handler may mutate the tree mid-dispatch
dom.add_event_listener(cards[0], "click", false, false, Box::new(|tree, _ev| {
    let span = tree.create_element("span");
    tree.append_child(tree.root(), span);
}));
dom.dispatch_event(cards[0], &mut Event::new("click", true, true));

// serialize back to HTML
let html = serialize::serialize_inner(&dom.tree, dom.tree.root());
```

Worked example: `cargo run --release -p turbo-dom --example crawl`.

### NWSAPI v3 Rust-port parity

This table measures the Rust port against the generated public API inventory in
[`docs/repo/selector/api.md`](../../docs/repo/selector/api.md). It counts each documented API
entry once; CSS selector spellings and parser cases belong to the separate compatibility
corpus and are not API entries.

The generated reference has 63 method/property entries and 10 configuration entries. Counting
rows once, **73/73 (100.0%) have a Rust route**: 34 direct Rust and 39 through Node/WASM or
host bridges. This route count is not a port-completion percentage: callback APIs,
browser installation, jsdom wrappers, and some bridge fallbacks still execute in JavaScript.

For a stricter view, the table classifies each row as Rust (the documented behavior is
available directly in Rust), Bridge (the JS entry delegates supported calls to Rust), JS
(JavaScript behavior is required), or N/A (reserved with no behavior). A Bridge row does not
mean every documented input has a Rust implementation; its boundary description is part of
the contract.

All **73 entries have a Rust route**, including the reserved `USR_EVENT` value, which Rust
retains in `SelectorConfig` without assigning it selector behavior. For selector plugins, Node and WASM
recognize registered single- or double-colon pseudos inside compound and complex selectors,
including nested selector lists, when each registration matches that pseudo and returns the
compiler source unchanged or guards it with a literal `if(false)` or
`e.localName==="name"` condition. Multiple recognized pseudos can be compiled together.
Other generated JavaScript still runs in the host compiler.

The six resolver template strings and four compiled-plan caches have native APIs.
The table describes the native value types and the JavaScript behavior of each.
The remaining inventory row, `USR_EVENT`, is reserved.

`pnpm run check:selector-api` verifies that every generated API and configuration entry has
one parity status and that the Rust-backed total above matches the table.

Behavioral parity is tracked separately. The native Rust compatibility run covers the shared
HTML, XML, and shadow-DOM selector corpus: all 456 accepted selector/context cases executed by
Rust matched JavaScript, while 53 of 509 attempted cases were rejected by both engines.
The parity test fails if any accepted case falls back to JavaScript; all 53 fallbacks are
rejected inputs.
The browser run exercises the installed WASM backend against HTML and shadow-DOM contexts:
all 426 accepted cases execute in Rust and match JavaScript. Its XML probe separately confirms
that 27 of 30 selectors compile in WASM. The other three use named namespace prefixes, which
NWSAPI deliberately rejects because DOM selector APIs do not provide CSS `@namespace` bindings;
the Rust parser matches that behavior. These fixture counts are limited evidence, not a claim
that every API or selector has parity.

Status codes in the table: **Rust** means a callable Rust API exists; **Bridge** means the
documented JS entry dispatches supported inputs to Rust; **JS** means behavior remains in the
JavaScript compatibility layer; **N/A** means the option is reserved and has no engine behavior.

| Documented API entry | Status | Rust evidence or boundary |
|---|---|---|
| `closest(selectors, element, callback)` | Rust | `CompiledSelector::closest[_with]`; `DomSelector::closest[_with_callback]`. |
| `first(selectors, context, callback)` | Rust | `CompiledSelector::first[_with]`; `DomSelector::query_selector[_with_callback]`. |
| `match(selectors, element, callback)` | Rust | `CompiledSelector::matches[_with]`; `DomSelector::matches[_with_callback]`. |
| `select(selectors, context, callback)` | Rust | `CompiledSelector::select[_with]`; `DomSelector::query_selector_all[_with_callback]`. |
| `byClass(cls, context)` | Rust | `DomSelector::by_class` and `CompiledSelector` lookup methods. |
| `byId(id, context)` | Rust | `DomSelector::by_id`; duplicate-ID option is preserved. |
| `byTag(tag, context)` | Rust | `DomSelector::by_tag`, with HTML/XML name rules. |
| `configure(option, clear)` | Rust | `DomSelector::configure` accepts a complete `SelectorConfig`; JS partial-object/string-getter forms and cache-clear flag remain adapter-specific. |
| `emit(message, proto)` | Rust | `Tree::emit` returns a native `Result`; JavaScript message construction and prototype selection remain adapter-specific. |
| `registerLegacyHooks(factory)` | Bridge | The hook factory stays in JS, while its readers seed Rust host snapshots for supported legacy queries. |
| `useRoutePlanner(host)` | Bridge | Chromium/jsdom host model is forwarded through Node and WASM snapshots; Rust selects routes for eligible native `:has()` queries. JavaScript retains its callback for the JS query path. |
| `registerBulkHasPlanner(planner)` | Bridge | The Node and WASM host bridges synchronously invoke the JavaScript callback with Rust candidate counts; its boolean selects the forward or inverse Rust route. Callback exceptions select the inverse route. |
| `createWasmInstalledQuery(wasm)` | Bridge | Rust WASM module exposes host selector compilation, snapshots, and queries. |
| `customBulkHasPlanner()` | Rust | `Tree::has_custom_bulk_has_planner` and `HostSnapshot::has_custom_bulk_has_planner` report whether a native planner is installed. |
| `routePlannerHost` | Bridge | Read-only engine property exposes the host choice forwarded through Node/WASM to Rust. |
| `customResolvers()` | Rust | `SelectorExtensions::has_custom_resolvers` reports custom selector, operator, or combinator resolvers. |
| `customSyntax` | Bridge | Read-only engine property reports whether `CFG.operators` or `CFG.combinators` differs from the registered syntax, guiding Node/WASM operator-grammar routing. |
| `hasPluginPlans` | Bridge | Read-only engine property reports whether external entries were inserted into any compiled resolver or lambda cache, guiding Node/WASM host fallback. |
| `compile(selector, mode, callback, relative, existenceOnly)` | Rust | `Tree::compile_selector` and `CompiledSelector`; generated JS resolver source is not exposed. |
| `registerCombinator(combinator, resolver)` | Bridge | For repeated identical tags such as `p!p!p`, Node and WASM recognize the literal identity callback `() => ''` and match both sides on the same node. Other generated source runs in JS. JavaScript accepts a RegExpMatchArray-to-source callback. Rust provides `SelectorExtensions::register_combinator[_name]` for function pointers and `register_combinator[_name]_with` for capturing closures. |
| `registerOperator(operator, resolver)` | Bridge | `SelectorExtensions::register_operator` accepts a function pointer and `register_operator_with` accepts a capturing closure. Node/WASM translates recognized equality, prefix, suffix, substring, dash-match, and whitespace-token patterns, plus literal fragments mixed with UTF-16 literals, JavaScript dot, ASCII character classes and ranges, `\d`/`\w`/`\s` shorthands inside classes, `\b`/`\B`, and `\d`, `\w`, `\s`, `\D`, `\W`, or `\S` runs using `+`, `*`, `?`, `{m}`, `{m,n}`, or `{m,}`, to Rust. Unsupported regex shapes stay in JS. |
| `registerSelector(name, rexp, func)` | Bridge | Recognized pass-through pseudos and simple `localName` predicates use Rust inside compound and complex selectors, including nested selector lists; expression arrows, block arrows, and ordinary functions are recognized for these forms. Multiple recognized pseudos can be combined. JavaScript accepts a regex and compiler callback that returns generated resolver source. Rust provides native predicate-based `SelectorExtensions::register_selector` and capture-capable `register_selector_with`; other JavaScript-generated source remains on the JS path. |
| `install(all, backend)` | Bridge | Browser adapter uses the Node/WASM host query bridge for supported snapshots; otherwise JS fallback handles the call. |
| `uninstall()` | Bridge | Restores browser methods in JavaScript and frees the installed WASM backend’s cached Rust selector plans. |
| `CACHE_BYTES` | Bridge | `SelectorConfig::cache_bytes`; the Node and WASM host-plan caches honor this budget. |
| `CACHE_LIMIT` | Bridge | `SelectorConfig::cache_limit`; the Node and WASM host-plan caches honor this entry limit. |
| `FORGIVING` | Rust | `SelectorConfig::forgiving` controls forgiving-list compilation. |
| `IDS_DUPES` | Bridge | Host snapshots accept duplicate-ID policy; direct Rust lookup follows selector config. |
| `LEGACY` | Bridge | Legacy hooks remain in `nwsapi-legacy.js`; their readers seed Rust snapshots for supported selectors in Node, WASM, and browser installations. Unsupported host cases keep the JS path. |
| `LOGERRORS` | Rust | `SelectorConfig::with_nwsapi_error_options` maps disabled throwing to Rust logging or silent suppression; JS adapters retain console logging at the boundary. |
| `NODE_LIST` | Bridge | JS wraps Rust query results with the configured static NodeList type. |
| `ROUTE_PLANNER` | Bridge | Configures the Rust bulk `:has()` route policy in Node and WASM snapshots; JS routes use the same option. |
| `USR_EVENT` | Rust | `SelectorConfig::usr_event` retains the reserved default-true value; it has no selector behavior. |
| `VERBOSITY` | Rust | `SelectorErrorMode` and `Tree::emit` cover return/suppression policy; JS error construction and console logging remain at the boundary. |
| `CFG` | Bridge | Rust exposes the current operator and combinator expressions via `SelectorExtensions::syntax()`. Edits to the operator expression affect registration and filter the comparison tokens recognized by the native parser. With unchanged combinator grammar, installed WASM queries accept equality alone or positive character classes of standard and bridge-supported custom operator symbols followed by `=`, optionally including plain equality through `|=`. They also accept explicit alternatives of literal operator tokens, such as `@=|\^=|=`. jsdom validates and executes queries under the same operator grammars through Node. Each native cache key includes the grammar. Other grammar edits use the host compiler. |
| `Combinators` | Bridge | Node and WASM inspect the current identity callback for repeated identical tags. Replacing it with an executable callback restores host compilation. |
| `Config` | Bridge | Mutable JS runtime options feed the Node/WASM bridge; supported query options configure Rust, while adapter-only options remain JavaScript-side. |
| `directionality` | Bridge | Rust `HostSnapshot::set_directionality` receives host-computed direction. |
| `M_BODY` | Rust | `nwsapi::resolver_templates::M_BODY` exposes the v3 JavaScript source fragment. |
| `M_TEST` | Rust | `nwsapi::resolver_templates::M_TEST` exposes the v3 JavaScript source fragment. |
| `matchLambdas` | Rust | `Tree::match_lambdas()` stores executable native plans for individual selector arms, with separate callback keys. The JavaScript API continues to expose JavaScript functions. |
| `matchResolvers` | Rust | `Tree::match_resolvers()` exposes the native adapter’s independent, writable compiled-plan cache. Values are native `CompiledSelector` plans. |
| `N_BODY` | Rust | `nwsapi::resolver_templates::N_BODY` exposes the v3 JavaScript source fragment. |
| `N_TEST` | Rust | `nwsapi::resolver_templates::N_TEST` exposes the v3 JavaScript source fragment. |
| `Operators` | Bridge | Declarative equality/inequality aliases in the mutable JS registry run through Node/WASM Rust bridges; callback resolvers keep the JS path. |
| `S_BODY` | Rust | `nwsapi::resolver_templates::S_BODY` exposes the v3 JavaScript source fragment. |
| `S_TEST` | Rust | `nwsapi::resolver_templates::S_TEST` exposes the v3 JavaScript source fragment. |
| `selectLambdas` | Rust | `Tree::select_lambdas()` stores executable native plans keyed by selection mode and selector arm. Rust uses the full arm as its candidate filter. JavaScript can optimize the candidate token before compiling its function. |
| `Selectors` | Bridge | Changes to the current pass-through callback select the Rust or JS route for subsequent compilations. Built-in jQuery selectors have separate equivalent Rust behavior; arbitrary user selector callbacks keep the JS path. |
| `selectResolvers` | Rust | `Tree::select_resolvers()` exposes the native adapter’s independent, writable compiled-plan cache. Values are native `CompiledSelector` plans. |
| `Snapshot` | Bridge | Rust `HostSnapshot` implements selector-facing snapshot state, traversal, and queries; JS retains live host-object wrapping and callbacks. |
| `Version` | Rust | Shared `nwsapi::VERSION` constant is exported through Node and WASM. |
| `check(selector, input)` | Bridge | `DomSelector::check` and `check_with_extensions` parse stylesheet branches, preserve specificity, and match supported branches in Rust. |
| `clear(clearAll = false)` | Rust | `DomSelector::clear` invalidates selector plans and optional parsed stylesheet data. |
| `closest(selector, node, options)` | Bridge | Native jsdom query path supports implementation nodes; JS fallback covers unsupported host cases. |
| `DOMSelector.configure(window, options)` | Bridge | Clears the document’s registered native plan caches during setup. The first Rust query receives the merged options shared by adapters on that document. |
| `constructor(window, document, options)` | Bridge | With the Node binding and IDL utilities, Rust resolves the supplied document to its public wrapper. JavaScript uses that wrapper to share adapter state and host readers. |
| `engine` | Bridge | JS property provides the shared engine instance; Rust owns query plans only during a bridge call. |
| `extractSubjects()` | Rust | `DomSelector::extract_subjects`. |
| `install(all = false)` | Bridge | Uses native installed query callbacks for supported selectors, with JS fallback. |
| `matches(selector, node, options)` | Bridge | `DomSelector::matches` plus jsdom wrapper conversion and fallback. |
| `parse(selector)` | Rust | `DomSelector::parse` returns cached built-in syntax; `parse_with_extensions` parses syntax bound to registered Rust resolvers. |
| `querySelector(selector, node, options)` | Bridge | `DomSelector::query_selector`, with jsdom wrapper conversion and fallback. |
| `querySelectorAll(selector, node, options)` | Bridge | `DomSelector::query_selector_all`, with jsdom wrapper conversion and fallback. |
| `run(method, selector, input, options, fallback, elementOnly)` | Bridge | The adapter validates and wraps host nodes in JavaScript, then sends supported queries to the Rust Node/WASM bridge; fallback and exception handling remain in JavaScript. |
| `supports(selector)` | Bridge | The jsdom adapter asks Rust `supports_host_selector` for callback-free selectors, then uses JS for unsupported selectors and custom callback resolvers. `DomSelector::supports` remains callable directly in Rust. |
| `uninstall()` | Bridge | Restores jsdom methods and clears the installed engine’s Rust plan cache by ID through the Node binding. |
| `DOMSelector.use(window, engine)` | Bridge | JS binds a document-owned engine; Rust adapter operates on that tree. |
| `wrap(node)` | Bridge | The Node binding preserves existing wrappers and resolves implementation nodes through the host’s IDL utilities. |
| `down(element, expr)` | Rust | `DomSelector::down` and `down_with_extensions`; `HostSnapshot::traverse` handles host queries. |
| `next(element, expr)` | Rust | `DomSelector::next` and `next_with_extensions`; `HostSnapshot::traverse` handles host queries. |
| `previous(element, expr)` | Rust | `DomSelector::previous` and `previous_with_extensions`; `HostSnapshot::traverse` handles host queries. |
| `up(element, expr)` | Rust | `DomSelector::up` and `up_with_extensions`; `HostSnapshot::traverse` handles host queries. |

Modules (`turbo_dom::rtdom::*`):

| module | role |
|---|---|
| `tree` | COW tree over the immutable SoA + `version` counter; lazy attrs; mutations; `set_inner_html`; shadow DOM; mutation recording; custom element state (`CustomElementState`, read by `:defined`; embedders report upgrades) |
| `query` | selectors (tag incl. `*\|`/`\|` prefixes/`.class`/`#id`/`[attr]` with `^=`/`$=`/`*=`/`~=`/`\|=`, CSS escapes, all four combinators, comma, structural/form/link pseudo-classes incl. `:nth-child(An+B of S)`, `:is`/`:where`/`:not`/`:has`), checked against a Chrome 156 control; version-cached `querySelectorAll` / `getElementById`; callback-enabled `DomSelector` queries; `SelectorExtensions` for Rust predicates, attribute operators, and combinators; `HostSnapshot` for host-supplied DOM queries |
| `cascade` | partial `getComputedStyle` — inline + matched `<style>` rules with Selectors 4 specificity / source order, curated inheritance, `:host`/`::slotted` shadow scoping, color canonicalization; memoized per version |
| `events` | `Dom` (owns the tree + listeners); capture/target/bubble dispatch, listener-less fast-skip, `stopPropagation`/`preventDefault`, tree-mutating handlers |
| `serialize` | inner/outerHTML (void + raw-text, single-pass escaping) |
| `node_ref` | ergonomic `NodeRef` + `DocumentExt` façade over handles |
| `color` | CSS color → `rgb()`/`rgba()` (named/hex/hsl) |
| `css_shorthand` | CSSOM shorthands as Chrome 156 implements them: the shorthand / alias tables, `expand` (a shorthand value → its longhands), `shorthand_value` / `block_text` (getPropertyValue / cssText serialization), `longhand_value` (a longhand's Chrome spelling and admission), `DeclarationBlock` (the reference CSSOM block); checked against `tests/fixtures/css_{shorthand,longhand}_chrome156.json` |
| `css_values` | Chrome-compatible CSS value grammars: `zoom_value` (Chrome 156 standardized `zoom`, incl. `calc()`), `css_number` (Blink number serialization) |
| `cssom` | `CssStyleSheet`/`CssStyleRule` + insert/deleteRule + parse |
| `svg` | SVG length/string/viewBox accessors |
| `file` | Blob/File + sync FileReader (text / data-URL base64 / array-buffer) |
| `custom_elements` | name→definition registry |
| `location` | Location (URL parse) + History stack |
| `stubs` | Storage, media-query eval, observer entries |
| `mutations` | `MutationObserver` — gated record buffer, sync `take_records`, type/target/subtree/old-value filtering; additive `MutationEvent` includes mutation-time ancestry/siblings/namespace for embedder queues |

## Status

- This checkout exposes the Rust port as the `nwsapi` package in `rust/dom`; it does not
  contain the standalone `turbo-dom` Chrome-control integration targets or CI gate files
  referenced in the upstream turbo-dom README.
- Selector, host-snapshot, and cascade behavior is covered by inline Rust unit tests. The
  JS host adapters are covered separately by the NWSAPI Vitest integration suites.
- Honest by design: `getComputedStyle` only returns values a real rule/inline/
  inherited declaration set (no invented initial values, no layout/`@media`/state).

Embedder entry points beyond the browser-facing API:

- **Parsing:** `Tree::parse_with(html, ParseOptions)` (scripting flag);
  `Tree::parse_utf16` and `parse_srcdoc_utf16` keep the original UTF-16 units. `srcdoc` is
  no-quirks, as in Chrome. `parse_utf16_with_processing_instructions` /
  `set_processing_instructions` parse `<?target data?>` as Chrome 156 does (a
  ProcessingInstruction; the default keeps html5lib-tests' bogus comment).
  `parse_with_source_positions` and
  `parse_utf16_with_source_positions` record token positions, read with
  `source_position` / `source_attribute_position`.
- **Fragments:** `Tree::create_contextual_fragment_utf16(context, units, scripting_enabled)`
  parses against a real context element (Range `createContextualFragment`).
- **Selectors for other engines:** `rtdom::query::{parse_for_cascade, match_for_cascade,
  parse_for_supports}`, generic over the `rtdom::query::Navigator` trait. turbo-dom-layout's
  cascade uses these, so the DOM APIs and layout share one engine
  ([docs/selector-engine.md](../../docs/selector-engine.md)).
- **Mutation events:** `Tree::start_recording()`, then `take_mutation_events()` (records plus
  ancestry and sibling positions for an embedder's observer queues) or
  `take_mutation_records()`.
- **Storage:** `Tree::collect_unreachable(&pins, budget)` reclaims detached storage at a
  quiescent point. Handles are never reused: check `is_live()`, and iterate `handles()`
  rather than `0..node_count()`. `storage_stats()` reports usage
  ([docs/native-storage-collection.md](../../docs/native-storage-collection.md)).

## Testing

```bash
cargo test --manifest-path rust/Cargo.toml -p nwsapi
cargo test --manifest-path rust/Cargo.toml -p nwsapi rtdom::query::host::tests
NWSAPI_NODE_ADDON="$PWD/rust/target/debug/nwsapi_node.node" \
  pnpm exec vitest run --config .config/repo/vitest.config.mts \
  test/repo/integration/native-selector-parity.test.mts
```

The selector parity corpus lives at `test/repo/common/fixture/selector/compatibility.json`.
It compares supported Rust host queries with the JS engine across HTML, XML, and shadow DOM.

## Links

[turbo-dom repository](https://github.com/miaskiewicz/turbo-dom) ·
[CHANGELOG](../../CHANGELOG.md) · [UTF16.md](UTF16.md) ·
[turbo-dom-layout](../turbo-dom-layout/README.md) ·
[turbo-dom-browser-env](../turbo-dom-browser-env/README.md)

License: MIT.
