import { runNode } from '../lib/run-node.mts'
import {
  BENCHMARK_CACHE_PATH,
  BENCHMARK_MEMORY_PATH,
  BENCHMARK_SELECTORS_PATH,
} from '../lib/paths.mts'

const [name, ...args] = process.argv.slice(2)
const entries = {
  cache: BENCHMARK_CACHE_PATH,
  memory: BENCHMARK_MEMORY_PATH,
  selectors: BENCHMARK_SELECTORS_PATH,
}
if (!name || !Object.hasOwn(entries, name)) {
  throw new Error('Choose cache, memory, or selectors.')
}
// The outer repository runner supplies the compile-cache environment.
runNode('--expose-gc', [entries[name as keyof typeof entries], ...args])
