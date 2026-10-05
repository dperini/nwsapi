# Use the experimental neural planner

The built-in planner uses the frozen PyTorch policies to choose a route for
some `:has()` queries. It does not generate selectors or predict matching
elements. The existing matcher still checks every result.

New engines enable the Chromium policy by default. The jsdom adapter
selects the jsdom policy automatically. Unsupported queries retain the
current route. The integrated runtime still needs complete-query performance
qualification.

## Build the planner

Run `pnpm run build` from the repository. The build compiles
`src/core/select/neural-planner.mts` into the main `dist/nwsapi.js` bundle.
There is no separate planner file, import or network request.

The model weights are numbers in the `.mts` source. They come from the
frozen crossed experiment in
`assets/repo/bench/planner-dispatch-crossed-model-2026-10-05-r1/`.
The Chromium policy has four hidden units. The jsdom policy is linear.
No training is needed to build these saved policies.

You do not need PyTorch, a `.pt` checkpoint, Transformers.js, a model
download or WebGPU to run the planner. PyTorch is a development tool for
training new weights. Running the saved model is ordinary JavaScript.
Both saved policies add code to the main bundle even when disabled.

## Node with jsdom

In a repository checkout, load the generated files:

```js
const { JSDOM } = require('jsdom')
const createEngine = require('./dist/nwsapi.js')

const dom = new JSDOM('<!doctype html><main></main>')
const engine = createEngine(dom.window)
engine.useNeuralPlanner('jsdom')

const matches = engine.select(
  '.card[data-ok="1"]:has(.badge[data-ok="1"])',
  dom.window.document,
)
```

For an installed package, load the engine with `require('nwsapi')`.
Use `useNeuralPlanner()` to change the default profile. Node by itself is
not a host profile. Select `jsdom` when creating an engine directly for a
jsdom document. The `DOMSelector` adapter selects it automatically before
applying user configuration. Existing query calls need no changes.

## Chromium in a browser

Load the core. The Chromium policy is already enabled:

```html
<script src="/dist/nwsapi.js"></script>
<script>
  const matches = NW.Dom.select(
    '.card[data-ok="1"]:has(.badge[data-ok="1"])',
    document,
  )
</script>
```

The default is Chromium. The engine does not detect the host. Chromium
measurements do not qualify the policy for Firefox, Safari or other DOM implementations.

## Disable or remove the planner

```js
engine.configure({ NEURAL_PLANNER: false })
```

This keeps the installed callback but disables its use. To re-enable the
same policy, configure `NEURAL_PLANNER: true`. To disable the planner and remove its callback:

```js
engine.useNeuralPlanner(null)
```

Selecting or removing a policy clears compiled query caches. Changing
the configuration flag also clears them. A prepared query cannot retain
an old applicability decision across these changes.

## When the model can run

All of these conditions must hold:

- A host policy is selected and `NEURAL_PLANNER` is enabled.
- The engine uses its pure compiler in an HTML document outside quirks mode.
- The query context is a document.
- The selector is a simple `.class:has(.class)` shape. Either compound can
  have one `[data-ok="1"]` equality filter. At least one must have that filter.
- The candidate counts are within the saved policy range: 32–192 anchors,
  80–768 witnesses and a witness-to-anchor ratio of 2.5–4.
- The current routing rule would choose forward matching.
- The saved policy chooses inverse marking.

The model cannot change an existing inverse decision. Cheap eligibility
checks run before model arithmetic. Queries outside this scope retain the
current route. Missing WeakMap support still uses the existing fallback.
A callback that throws or returns anything other than `true` also keeps
the current route.

Each engine has its own callback. Select a policy separately for each
engine. It stores no elements, documents or query results.

## Measurement limits

This integration adds a callback and applicability checks. It is a new
runtime path. Earlier generated-bundle timings do not measure its exact
cost. No speed gain is claimed for this integration yet.

A future qualification pass must measure this enabled planner, including
its applicability checks and callback. Use the archived generated bundles
to reproduce earlier measurements. Instrumentation for the enabled
planner must record the final route after its callback runs.

See the [measured outcome](neural-dispatch-jit-outcome.md) and
[remaining experiments](neural-dispatch-jit-tasks.md).
