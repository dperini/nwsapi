import type {
  CompiledResolver,
  EngineState,
  PlanCache,
} from '../state/types.mts'

type Filter = { seen: number; kept: number; rest: number } | undefined
type ResolverFactory = (
  snapshot: EngineState['Snapshot'],
  filter: Filter,
) => CompiledResolver

export interface CodeFactoryCache {
  factories: PlanCache<ResolverFactory>
  units: number
}

export function bindResolver(
  engine: EngineState,
  source: string,
  filter: Filter,
) {
  var cache = engine.codeFactories,
    factory = cache && cache.factories.get(source)
  if (!factory) {
    // This factory captures no engine or document. Each call binds fresh state.
    // oxlint-disable-next-line typescript/no-implied-eval -- Selectors compile to resolver functions.
    factory = Function('s', 'a', source) as ResolverFactory
    if (cache !== undefined && source.length <= 8192) {
      if (!cache) {
        cache = engine.codeFactories = {
          factories: engine.createCache<ResolverFactory>(64),
          units: 0,
        }
      }
      if (cache.units + source.length > 32768) {
        cache.factories.clear()
        cache.units = 0
      }
      cache.factories.set(source, factory)
      cache.units += source.length
    }
  }
  return factory(engine.Snapshot, filter)
}
