# PyTorch and the `:has()` route planner, for beginners

[Explore the interactive walkthrough](pytorch-has-routing.html). Edit a small
DOM, watch results accumulate along both routes, try prediction challenges,
and follow the saved policy through its arithmetic into the source code.

The performance demonstration compares the ordinary route with the saved
policy’s choice. Its step counts describe an illustrated DOM. Its timing
estimates use editable teaching assumptions, including model overhead.
Changing the warning position can show either a gain or a slowdown without
changing the facts available to the model. These estimates are separate from
the archived training measurements.

To serve the guide locally from the repository root:

```sh
portless nwsapi-model-guide node node_modules/vite/bin/vite.js --config .config/model-guide.mts
```

Open `/pytorch-has-routing.html` on the URL printed by Portless. Vite serves
the guide and its TypeScript modules. The policy explorer imports the committed
runtime policy, source excerpts come from the owning files, and the timing
examples load recorded benchmark inputs.

To build the walkthrough into `.cache/model-guide-build/`:

```sh
node node_modules/vite/bin/vite.js build --config .config/model-guide.mts
```

Code panels use the pinned `gpu-lexer` dev dependency for syntax coloring.
Its separate WebGPU model runs only in the guide. Without WebGPU, the source
remains readable as plain text.

## The short version

Yes, this is machine learning. We train a small model with examples of
`:has()` queries and measurements of how long two exact search routes take.
At query time, the model can recommend one route for a narrow set of eligible
queries. The normal selector engine still checks the DOM and decides which
elements match.

This is not generative AI. The model does not write text, create selectors,
or invent results. It makes one small numeric choice: use the existing route,
or try the other exact route.

## What does `:has()` do?

For example, `.card:has(.warning)` selects each `.card` element that contains
a `.warning` descendant. The engine can find those cards in two ways:

- **Forward:** visit each possible card and search inside it for a warning.
- **Inverse:** find possible warnings, walk up to their ancestors, then keep
  the possible cards that were marked.

Both routes perform exact checks and must return the same elements in the same
document order. The planner chooses which route to use for that query.

## What is the model?

Think of the model as a small calculator whose adjustable numbers were learned
from examples. The current PyTorch trainers compare route timings and train a
separate set of weights for Chromium and jsdom. The exported JavaScript uses
candidate counts and a few selector facts, such as whether the anchor and
descendant selectors have supported attribute filters. It produces a route
choice, not a match/no-match answer.

PyTorch is used offline to train and save the weights. The repository's
exporter turns those weights into ordinary JavaScript and a generated
TypeScript module. At runtime, the app does not need Python, PyTorch, a GPU,
or a model download. It calls a small JavaScript function.

## How does it learn?

1. The benchmark creates selector and DOM examples.
2. It measures both correct routes on each example.
3. Those measurements label which route was faster for that example.
4. PyTorch adjusts the model's weights to make better route choices on the
   training examples, then the repo checks separate held-out examples.
5. A repository script exports the saved weights as JavaScript. Parity and
   complete-query checks compare its choices and results with the reference.

The model does not learn from a user's live page or change itself while the
application runs. Its checked-in weights stay fixed until the team trains,
reviews, and exports another version.

## When can it change the route?

The runtime first handles small queries and empty witness lists. It calls the
planner only when the query and document meet narrow checks. Unsupported
inputs, unavailable planner support, or a planner error keep the ordinary
route. The planner has no authority to remove a result or declare a selector
match.

The current implementation is experimental. The independent crossed-query
confirmation found large gains on reserved synthetic examples, but also a
repeat regression for some Chromium cases and no required average gain on the
older cases. The model and a simpler fitted rule chose the same routes in
that comparison, so the evidence does not show that the learned model beats
the rule. See the [crossed-query results](neural-dispatch-crossed-outcome.md)
and [latest dispatch follow-up](neural-dispatch-jit-outcome.md) before
interpreting the integrated code as a general performance win.

## Where the files live

- Training code: `scripts/repo/pytorch/dispatch_train.py`
- Training entry point: `scripts/repo/pytorch/dispatch-train.mts`
- Saved checkpoints and exported weights:
  `assets/repo/pytorch/model/`
- Generated runtime policy:
  `src/core/select/has/route-decision.generated.mts`
- Runtime guard and route selection: `src/core/select/has/match.mts`

The build includes the generated module in the normal bundle. It does not
search for a `model-*` directory. See the [implementation notes](neural-planner-integration.md)
for setup and activation details.
