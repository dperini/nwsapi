import {
  NATIVE_BULK_HAS_PLANNER,
  NATIVE_LEGACY_READERS,
  NATIVE_OPERATOR_GRAMMAR,
} from '../../adapter/native/types.mts'
import type { NativeLegacyContext } from '../../adapter/native/types.mts'
import type { EngineState } from '../state/types.mts'

export function initializeNativeBridgeProperties(
  engine: EngineState,
  grammar: () => string | undefined,
) {
  engine.primordials.ObjectDefineProperty(engine.Dom, NATIVE_OPERATOR_GRAMMAR, {
    get: grammar,
  })
  engine.primordials.ObjectDefineProperty(engine.Dom, NATIVE_LEGACY_READERS, {
    get: (): NativeLegacyContext | undefined => {
      const readers = engine.legacyHooks
      return engine.Config.LEGACY && readers
        ? {
            readers,
            htmlDocument: engine.HTML_DOCUMENT && !engine.QUIRKS_MODE,
          }
        : undefined
    },
  })
  engine.primordials.ObjectDefineProperty(engine.Dom, NATIVE_BULK_HAS_PLANNER, {
    get: () => engine.bulkHasPlanner,
  })
}
