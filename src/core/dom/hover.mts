import type { EngineState } from '../state/types.mts'
export function hoverChanged(engine: EngineState, event: MouseEvent) {
  var targetDoc =
      (event.target as Node).ownerDocument || (event.target as Document),
    record = engine.hoverTracked
      ? engine.hoverTracked.get(targetDoc)
      : targetDoc === engine.hoverDoc
        ? engine.hoverRecord
        : undefined
  if (record) {
    record.target = event.type == 'mouseover' ? event.target : undefined
    if (targetDoc === engine.doc) {
      engine.Snapshot.HOVER = record.target
    }
  }
}

export function trackHover(engine: EngineState) {
  engine.hoverWanted = true
  if (!engine.doc) {
    return
  }
  if (engine.hoverTracked === null) {
    engine.hoverTracked = engine.createWeakMap()
  }
  var record = engine.hoverTracked
    ? engine.hoverTracked.get(engine.doc)
    : engine.hoverDoc === engine.doc
      ? engine.hoverRecord
      : undefined
  if (!record) {
    record = { target: undefined }
    if (engine.hoverTracked) {
      engine.hoverTracked.set(engine.doc, record)
    }
    // Stable callbacks avoid duplicate listeners even without WeakMap.
    engine.doc.addEventListener('mouseover', engine.hoverChanged, true)
    engine.doc.addEventListener('mouseout', engine.hoverChanged, true)
  }
  engine.hoverDoc = engine.doc
  engine.hoverRecord = record
  engine.Snapshot.HOVER = record.target
}
