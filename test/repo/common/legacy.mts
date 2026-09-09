import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import factory from '../../../dist/nwsapi.js'
import installLegacy from '../../../dist/modules/nwsapi-legacy.js'
export { default as registerLegacy } from '../../../dist/modules/nwsapi-legacy.js'

export function createLegacyEngine(host: Parameters<typeof factory>[0]) {
  const engine = installLegacy(factory(host))
  engine.configure({ LEGACY: true })
  return engine
}

const filename = fileURLToPath(
  new URL('../../../dist/modules/nwsapi-legacy.js', import.meta.url),
)
const source = readFileSync(filename, 'utf8')

// Use the fixture's realm so its missing Map and WeakMap stay missing.
export function registerLegacyInContext<Value>(
  engine: Value,
  context: vm.Context,
): Value {
  const module = context['module'] as { exports: (engine: Value) => Value }
  const original = module.exports
  try {
    vm.runInNewContext(source, context, { filename })
    module.exports(engine)
    return engine
  } finally {
    module.exports = original
  }
}
