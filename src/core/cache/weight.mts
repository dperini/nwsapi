import type { CompiledResolver, QueryPlan } from '../state/types.mts'

export function resolverWeight(resolver: CompiledResolver | null) {
  return resolver ? resolver.cacheSize || 64 : 8
}

export function resolverListWeight(resolvers: CompiledResolver[]) {
  let bytes = 32
  for (let i = 0, length = resolvers.length; i < length; ++i) {
    bytes += resolverWeight(resolvers[i]!)
  }
  return bytes
}

export function queryWeight(plan: QueryPlan) {
  let bytes = 64
  for (let i = 0, length = plan.nodeset.length; i < length; ++i) {
    bytes +=
      plan.nodeset[i]!.length * 2 + resolverWeight(plan.factory[i] || null)
  }
  if (plan.bulkHas) {
    bytes +=
      queryWeight(plan.bulkHas.anchor) + queryWeight(plan.bulkHas.witness)
  }
  return bytes
}

export function relativeWeight(plans: QueryPlan[]) {
  let bytes = 32
  for (let i = 0, length = plans.length; i < length; ++i) {
    bytes += queryWeight(plans[i]!)
  }
  return bytes
}

export function forgivingWeight(plans: Array<CompiledResolver[] | null>) {
  let bytes = 32
  for (let i = 0, length = plans.length; i < length; ++i) {
    bytes += plans[i] ? resolverListWeight(plans[i]!) : 8
  }
  return bytes
}
