import { nativeBinding } from '../native-binding.mts'
import type { NativeQueryBinding } from '../native/types.mts'
import { NATIVE_OPERATOR_GRAMMAR } from '../native/types.mts'
import { selectorUsesCustomResolver } from '../native/resolver.mts'
import { units } from '../native-query-state/parser.mts'
import type { DOMSelectorEngine } from '../dom-selector.mts'

// eslint-disable-next-line complexity -- Routes native grammar validation then preserves the JS validation fallback.
export function supportsNativeSelector(
  selector: unknown,
  activate: () => DOMSelectorEngine,
  nativeQuery: NativeQueryBinding | undefined,
  document: Document,
): boolean {
  if (typeof selector !== 'string') {
    return false
  }
  try {
    const engine = activate()
    if (nativeQuery?.supportsHostSelector) {
      const binding = nativeBinding(engine, nativeQuery)
      const grammar = engine[NATIVE_OPERATOR_GRAMMAR]
      const grammarCheck =
        grammar !== undefined &&
        binding.supportsHostOperatorGrammar &&
        !engine.hasPluginPlans &&
        !selectorUsesCustomResolver(engine, selector)
      if (grammarCheck || !binding.usesCustomResolver?.(selector)) {
        const notEqual =
          typeof binding.notEqualOperator === 'function'
            ? binding.notEqualOperator(selector)
            : binding.notEqualOperator === true
        try {
          const supported = grammarCheck
            ? binding.supportsHostOperatorGrammar!(
                units(selector),
                grammar!,
                !!binding.jquery,
                !!binding.forgiving,
                notEqual,
                binding.customOperatorForSelector?.(selector),
              )
            : binding.supportsHostSelector(
                units(selector),
                binding.jquery,
                binding.forgiving,
                binding.cacheLimit,
                binding.cacheBytes,
                notEqual,
                binding.customOperatorForSelector?.(selector),
                binding.planCacheId,
              )
          if (supported) {
            return true
          }
        } catch {
          // A transport error leaves syntax validation to the engine below.
        }
      }
    }
    engine.match(selector, document.createElement('div'))
    return true
  } catch {
    return false
  }
}
