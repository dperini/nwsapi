import { chromiumPolicy, jsdomPolicy } from './route-decision.generated.mts'
import type { BulkHasPlanner } from '../../state/types.mts'

// The committed model asset is pinned by model metadata and generated into a
// statically included module. Chromium is the default policy.
export type NeuralPlannerHost = 'chromium' | 'jsdom'

export function neuralPlannerPolicy(host: NeuralPlannerHost): BulkHasPlanner {
  if (host === 'chromium') {
    return chromiumPolicy
  }
  if (host === 'jsdom') {
    return jsdomPolicy
  }
  throw new TypeError('Select the chromium or jsdom experimental policy')
}
