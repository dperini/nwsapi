import type { EngineState, EngineContext } from '../state/types.mts'

export function switchContext(
  engine: EngineState,
  context: EngineContext,
  force?: boolean | undefined,
) {
  var oldDoc = engine.doc
  engine.partCounts.clear()
  engine.typeRoutes.clear()
  engine.doc = (context.ownerDocument || context) as Document
  if (force || oldDoc !== engine.doc) {
    // force a new check for each document change
    // performed before the next select operation
    engine.root = engine.doc.documentElement
    // Compiled case and namespace checks belong to this document.
    engine.matchLambdas.clear()
    engine.selectLambdas.clear()
    engine.matchResolvers.clear()
    engine.selectResolvers.clear()
    engine.firstResolvers.clear()
    engine.hasPlans = undefined
    if (
      engine.legacyHooks &&
      !engine.Config.LEGACY &&
      engine.legacyHooks.detect(engine.doc)
    ) {
      engine.Config.LEGACY = true
    }
    engine.useLegacy(engine.Config.LEGACY)
    engine.HTML_DOCUMENT = engine.isHTML(engine.doc)
    engine.QUIRKS_MODE =
      engine.HTML_DOCUMENT && engine.doc.compatMode.indexOf('CSS') < 0
    engine.NAMESPACE = engine.root && engine.root.namespaceURI
    engine.Snapshot.doc = engine.doc
    engine.Snapshot.root = engine.root
    engine.hoverWanted && engine.trackHover()
  }
  return (engine.Snapshot.from = context)
}
