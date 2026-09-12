import { isPickerTransition } from '../../predicate/picker-transition.mts'
import type { EngineState } from '../../state/engine.d.ts'
export function rejectsPseudoTransition(
  previous: string,
  name: string,
  engine: EngineState,
) {
  return (
    previous &&
    !(previous == 'part' && name != 'part' && name != 'slotted') &&
    !(previous == 'details-content' && name != 'part' && name != 'slotted') &&
    !(previous == 'slotted' && engine.treePseudo(name)) &&
    !(
      /^(?:before|after)$/.test(previous) &&
      (name == 'marker' || name == 'column')
    ) &&
    !(previous == 'column' && name == 'scroll-marker') &&
    !isPickerTransition(previous, engine, name)
  )
}
