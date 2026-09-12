import type { Node } from 'acorn'

export const descriptions: Record<string, string> = {
  byClass: 'Returns elements with the class name.',
  byId: 'Returns elements with the ID. Duplicate IDs are allowed by default.',
  byTag: 'Returns elements with the tag name. Use `*` for all elements.',
  closest: 'Returns the nearest match, starting with the element, or `null`.',
  first: 'Returns the first matching descendant, or `null`.',
  match: 'Returns whether the element matches.',
  select:
    'Returns matching descendants. Results are arrays by default. `NODE_LIST` can enable static NodeList results.',
  compile:
    'Compiles a selector into a resolver function. This is an advanced API.',
  configure:
    'Reads or changes options. Pass `true` as the second argument to clear compiled selectors.',
  emit: 'Reports an error using the configured error policy.',
  install:
    'Replaces native selector methods. `querySelectorAll()` returns static NodeList-compatible snapshots. The `all` flag enables legacy iframe-load handling.',
  uninstall: 'Restores the native methods saved by `install()`.',
  registerLegacyHooks:
    'Registers the optional DOM compatibility module on this engine. Returns false when hooks are already registered.',
  registerCombinator:
    'Adds a relationship between elements using trusted resolver code.',
  registerOperator:
    'Adds an attribute operator using a resolver with `p1`, `p2`, and `p3` fields.',
  registerSelector:
    'Adds a selector pattern and a compiler callback that returns `source` and `status`.',
  CFG: 'Contains the compiler syntax settings.',
  Config: 'Contains the active options. Use `configure()` to change them.',
  Snapshot:
    'Contains the document state and helpers used by compiled selectors.',
  Version: 'Contains the engine version string.',
  Operators: 'Contains registered attribute operators.',
  Selectors: 'Contains registered selector extensions.',
  M_BODY: 'Contains the matching resolver body template.',
  M_TEST: 'Contains the matching resolver test template.',
  N_BODY: 'Exposes the matching resolver body template.',
  N_TEST: 'Contains the alternate resolver test template.',
  S_BODY: 'Contains the selection resolver body template.',
  S_TEST: 'Contains the selection resolver test template.',
  matchLambdas: 'Caches compiled matching functions, not DOM results.',
  matchResolvers: 'Caches matching plans, not DOM results.',
  selectLambdas: 'Caches compiled selection functions, not DOM results.',
  selectResolvers: 'Caches selection plans, not DOM results.',
}

export const adapterDescriptions: Record<string, string> = {
  configure:
    'Configures the shared engine before the first query or stylesheet match.',
  engine: 'Returns the shared engine, creating it on first access.',
  constructor:
    'Creates the adapter. `options.idlUtils` supports jsdom implementation nodes.',
  check:
    'Returns matching stylesheet branches and their syntax tree. Loads `css-tree` on first use.',
  clear:
    'Clears compiled selectors and parsed stylesheet selectors when `clearAll` is `true`.',
  closest: 'Returns the nearest matching element, or `null`.',
  extractSubjects:
    'Returns a wildcard candidate description for stylesheet matching.',
  matches: 'Returns whether an element matches.',
  querySelector: 'Returns the first matching descendant, or `null`.',
  querySelectorAll: 'Returns matching descendants as an array.',
  supports: 'Returns whether the engine accepts a selector.',
  use: 'Binds an existing engine before jsdom first uses the adapter. Returns the engine.',
  parse:
    'Internal helper that caches stylesheet syntax after `css-tree` is loaded.',
  run: 'Internal helper that checks nodes and applies the query error policy.',
  wrap: 'Internal helper that converts jsdom implementation nodes to public nodes.',
}

export const optionDescriptions: Record<string, string> = {
  FORGIVING:
    'Allows invalid items in forgiving lists such as `:is()` and `:where()`.',
  IDS_DUPES: 'Allows duplicate IDs when finding elements.',
  LEGACY:
    'Enables older DOM behavior after the legacy module has registered its hooks.',
  LOGERRORS: 'Logs errors when exception throwing is disabled.',
  NODE_LIST: 'Uses NodeList-style results where supported.',
  USR_EVENT:
    'Reserved compatibility flag. The core does not currently read it.',
  VERBOSITY: 'Throws exceptions for invalid selectors.',
}

export function* walk(value: unknown): Generator<Node> {
  if (!value || typeof value !== 'object') {
    return
  }
  if ('type' in value && typeof value.type === 'string') {
    yield value as Node
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        yield* walk(item)
      }
    } else if (child && typeof child === 'object') {
      yield* walk(child)
    }
  }
}
