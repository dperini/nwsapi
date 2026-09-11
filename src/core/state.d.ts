import type { RuntimeState } from './runtime-state.d.ts'
import type { QueryState } from './query-state.d.ts'
import type { PublicState } from './public-state.d.ts'
export interface EngineState extends RuntimeState, QueryState, PublicState {}
