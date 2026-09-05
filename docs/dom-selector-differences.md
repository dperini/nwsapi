# Where jsdom's engine differs from a browser

jsdom 27 and later answer `querySelectorAll` with
[@asamuzakjp/dom-selector](https://github.com/asamuzaK/domSelector) rather than
with this engine. That makes it a second implementation to compare against,
which is useful — the benchmarks and several tests here do exactly that. It
also means a difference against it is not automatically a bug on this side.

This is the catalogue of the ones that are not. Each row was checked against
real Chromium, and in every case here this engine agrees with the browser and
jsdom's engine does not.

**None of these have been reported upstream.** Nothing in this file has been
filed as an issue, and it should not be until someone decides to.

Regenerate it with:

```sh
node scripts/engine-differences.mjs --markdown
```

That script collects four answers per selector — the browser's own engine,
this engine in the same page, jsdom's engine, and this engine on jsdom — so a
difference can be attributed rather than guessed at. A row where this engine
differs from the browser is our bug and fails the script; a row where the two
hosts differ for this engine is jsdom's DOM rather than either engine.

## The findings

Measured with jsdom 30.0.1, dom-selector 8.3.0, Chromium 155 (the version
Playwright installs here), on the `forms` fixture in the script.

| selector | what Chromium and this engine say | what jsdom's engine says |
| --- | --- | --- |
| `:valid` | a disabled control does not match | a disabled control matches |
| `:read-write` | a control inside a disabled fieldset does not match | it matches |
| `:read-only` | that control matches | it does not |
| `:optional` | a `<button>` matches | it does not |
| `button:optional` | matches the button | matches nothing |
| `fieldset :read-write` | skips the fieldset-disabled controls | includes them |
| `input:not(:read-write)` | includes them | excludes them |

The last three are the same two causes seen through a compound, which is worth
keeping in the table: a wrong answer for `:read-write` shows up inside
`:not()` as well, where it is harder to spot.

## Why each one happens

**Validity ignores `willValidate`.** Blink's `:valid` is
`MatchesValidityPseudoClasses() && IsValidElement()`
([`selector_checker.cc#L2811`](https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/css/selector_checker.cc#L2811)),
and for a control the first half is its `willValidate()`
([`html_form_control_element.cc#L373`](https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_form_control_element.cc#L373)).
A disabled control is barred from constraint validation, so `willValidate` is
false and it matches neither `:valid` nor `:invalid`.

dom-selector 8.3.0 contains no reference to `willValidate` at all. It decides
from `validity.valid`, which is `true` for a disabled control. That change
came from [#284](https://github.com/asamuzaK/domSelector/pull/284) (July 2026),
which fixed a real problem — [#283](https://github.com/asamuzaK/domSelector/issues/283),
spurious `invalid` events, reported from
[jsdom#4187](https://github.com/jsdom/jsdom/issues/4187) — and the `willValidate`
half looks to have been dropped along the way.

It is worth being clear that this is the engine and not jsdom's DOM: a
disabled input reports `willValidate === false` in jsdom, the same as in a
browser. The data is there to be read.

**`:read-write` and `:read-only` read the element's own `disabled`.** A control
inside a disabled fieldset has `disabled === false` on itself and is disabled
all the same. Blink asks `IsActuallyDisabled()`, which is the own attribute or
the ancestor state
([`listed_element.cc#L738`](https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/listed_element.cc#L738),
walk at
[L702](https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/listed_element.cc#L702)).
This engine had the same bug until Chromium was asked; it now shares one
`isDisabled()` helper between `:disabled`, `:enabled` and the two `:read-*`.

**`:optional` skips buttons.** The HTML spec lists button elements first among
the ones `:optional` matches, and Blink answers `true` for one outright
([`html_button_element.h#L113`](https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/html/forms/html_button_element.h#L113)).
dom-selector has fixed this handler before
([#159](https://github.com/asamuzaK/domSelector/pull/159), March 2025), so the
gap is a regression or an omission rather than a position.

## What this means for this repo

Nothing to work around. The engine reads `willValidate` and `isDisabled()`
because the browser does, jsdom exposes both correctly, and matching jsdom's
answers would make this engine wrong in a browser — where most of its traffic
runs.

Two places carry a note so nobody "fixes" this engine toward jsdom:
`test/upstream/browser-agreement.spec.mjs`, which is the test that compares
against Chromium, and `bench/README.md`, which explains why the benchmark
compares against jsdom at all.

## If these are ever reported

The maintainer of dom-selector has fixed each of these areas when they were
reported — [#157](https://github.com/asamuzaK/domSelector/pull/157) for the
`:read-only`/`:read-write` handler, [#159](https://github.com/asamuzaK/domSelector/pull/159)
for `required`/`optional`, [#284](https://github.com/asamuzaK/domSelector/pull/284)
for `:valid`/`:invalid` — so a report with a runnable reproduction is likely to
land. There is no public roadmap; the project is report-driven.

A report would want: the markup from the `forms` fixture, the three answers
per selector, and the `willValidate` reading that shows jsdom's DOM is not the
problem. `node scripts/engine-differences.mjs --markdown` prints the first
two.
