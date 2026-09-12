import type { RuntimeState } from './runtime.d.ts'
import type { QueryState } from './query.d.ts'
import type { PublicState } from './public.d.ts'
export interface EngineState extends RuntimeState, QueryState, PublicState {}
