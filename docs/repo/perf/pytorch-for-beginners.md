# PyTorch and the `:has()` route planner, for beginners

[Explore the interactive walkthrough](pytorch-has-routing.html). Edit a small
DOM, compare two exact searches, try prediction challenges, and follow the
saved route policy through its arithmetic and source code.

## The short version

For some `:has()` queries, `nwsapi` can search down from each possible matching
card or search up from each possible warning. Both routes check the selector
exactly and return the same matching elements in document order. The existing
count rule chooses the default route. An optional model can recommend the
other route for a narrow set of eligible queries.

This is machine learning, but not generative AI. The model does not write text,
create selectors, or decide which elements match. It makes one numeric choice:
keep the existing route or try the other exact route. PyTorch trains the model
offline. The application runs fixed exported weights in ordinary JavaScript,
without Python, a GPU, or a model download.

The route planner is experimental. Recorded synthetic tests show both
speedups and slowdowns. They do not establish a general speedup or show that
the learned model beats a simpler fitted rule. The walkthrough’s editable
timing estimates use teaching assumptions and are distinct from archived
measurements.

## What does `:has()` do?

For example, `.card:has(.warning)` selects each `.card` element that contains
a `.warning` descendant. The card is the **anchor**. The warning is a
**witness**: an element that proves the condition is true.

There are two exact ways to find matching cards:

- **Forward (search down):** visit each possible card and search inside its
descendants for a warning.
- **Inverse (search up):** find possible warnings, mark their ancestor cards,
  then check those cards in document order.

The route changes the search order and the amount of work. Exact selector
checks still decide the result.

## What is the model?

Think of the model as a small calculator whose adjustable numbers were learned
from examples. The current PyTorch trainers compare route timings and train a
separate set of weights for Chromium and jsdom. The exported JavaScript uses
candidate counts and a few selector facts, such as whether the anchor and
descendant selectors have supported attribute filters. It produces a route
choice, not a match/no-match answer.

## How does it learn?

1. The benchmark creates selector and DOM examples.
2. It measures both correct routes on each example.
3. Those measurements label which route was faster for that example.
4. PyTorch adjusts the model’s weights using training examples. The repository
   checks the selected model on separate validation and held-out examples.
5. A repository script exports the saved weights as JavaScript. Parity and
   complete-query checks compare its choices and results with the reference.

The model does not learn from a user’s live page or change itself while the
application runs. Its checked-in weights stay fixed until the team trains,
reviews, and exports another version.

## When can it change the route?

The runtime first handles small queries and empty witness lists. It calls the
planner only when the query and document meet narrow checks. Unsupported
inputs, unavailable planner support, or a planner error keep the ordinary
route. The planner has no authority to remove a result or declare a selector
match.

The independent crossed-query confirmation found large gains on reserved
synthetic examples, but also a repeat regression for some Chromium cases and
no required average gain on the older cases. The model and a simpler fitted
rule chose the same routes in that comparison. The evidence therefore does
not show that the learned model beats the rule. See the
[crossed-query results](neural-dispatch-crossed-outcome.md) and [latest dispatch
follow-up](neural-dispatch-jit-outcome.md) before interpreting the integrated
code as a general performance win.

## Where the files live

- Training code: `scripts/repo/pytorch/dispatch_train.py`
- Training entry point: `scripts/repo/pytorch/dispatch-train.mts`
- Saved checkpoints and exported weights: `assets/repo/pytorch/model/`
- Generated runtime policy:
  `src/core/select/has/route-decision.generated.mts`
- Runtime guard and route selection: `src/core/select/has/match.mts`

The build includes the generated module in the normal bundle. It does not
search for a `model-*` directory. See the [implementation notes](neural-planner-integration.md)
for setup and activation details.

## Run the guide locally

From the repository root, start the development server:

```sh
pnpm run guide
```

This starts Vite and opens the walkthrough in your browser at
`http://127.0.0.1:4389/pytorch-has-routing.html`. The same server hosts the
Markdown reader linked from the guide. Edits reload automatically.

For a named local URL, use `portless nwsapi-model-guide pnpm run guide` and
open `/pytorch-has-routing.html` on the URL printed by Portless.

To build the walkthrough into `.cache/model-guide-build/`:

```sh
pnpm run guide:build
```

The policy explorer imports the committed runtime policy, source excerpts come
from the owning files, and the timing examples load recorded benchmark inputs.
The demonstration’s editable timing assumptions remain illustrative and are
not measurements.

Code panels use the pinned `gpu-lexer` dev dependency for syntax coloring. Its
separate WebGPU model runs only in the guide. Without WebGPU, the source remains
readable as plain text.

## Maintaining the guide languages and narration

The walkthrough and Markdown reader support English and Italian. The language
control initially follows the browser language. A manual choice is kept in
`sessionStorage`, including page refreshes in the same tab. Source code,
selectors, script names, and commands keep their original spelling.

The guide initially follows the system’s light or dark appearance. Use the sun
or moon button beside the language selector to switch between light and dark.
Both keep the section colors, spotlight, and animations, respecting the
system’s reduced-motion preference.

The book button is visible beside the appearance controls. Select it to enter
reading mode with warm paper colors, dark text, and generous line spacing.
Reading mode stops diagram playback and removes animation, transitions, moving
narration highlights, decorative effects, and smooth scrolling. You can still
step through diagrams manually. Select the book button again to restore the
underlying light or dark appearance. These choices persist across refreshes
and navigation between the guide and reader in the same browser tab.

Interface labels live in `assets/repo/model-guide/locales/en.json` and
`it.json`. Longer interface strings and repository documents are extracted
into generated JSON catalogs in the same directory. Edit
`overrides.it.json` for reviewed Italian translations instead of editing the
generated catalogs. `Intl` handles language detection and number formatting.
The translation model supplies the translated text.

Set up the pinned translation model once, then refresh the catalogs after
changing English documentation or interface text:

```sh
pnpm run docs:translate:setup
pnpm run docs:translate:it
```

The translation environment and model revision are recorded in
`.config/docs-translation/`. Its lockfile fixes Python dependency versions.
The scripts use the repository-managed `.cache/bin/uv` executable and cache
downloaded models under `.cache/`.

English narration uses the pinned `kokoro-js` development dependency. Italian
narration uses the native Italian `im_nicola` voice from `kokoro`. Its Python
dependencies, model revision, and model file checksums live in
`.config/guide-speech/`. Edit the Italian narration text in
`assets/repo/model-guide/locales/narration.it.json`, then regenerate the
affected audio and word timings:

```sh
pnpm run gen:guide:narration
pnpm run gen:guide:narration:it
pnpm run guide:build
```

The narration commands require `ffmpeg` on `PATH`. Commit the generated
catalogs, narration metadata, and audio together with their source changes.
The production build includes the recorded audio and translation catalogs.
