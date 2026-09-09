import { createRequire } from 'node:module'
import pkg from '../../package.json' with { type: 'json' }

const require = createRequire(import.meta.url)

export async function inspectSelector(
  selector: string,
  { mode: modeName = 'select', legacy = false, json = false } = {},
) {
  const { default: factory } = await import('../../dist/nwsapi.js')
  const { JSDOM } = require('jsdom')
  const { window } = new JSDOM('<!doctype html><html><body></body></html>')
  try {
    const engine = factory(window)
    if (legacy) {
      const { default: registerLegacy } =
        await import('../../dist/modules/nwsapi-legacy.js')
      registerLegacy(engine)
    }
    engine.configure({ LEGACY: legacy })
    const mode = modeName === 'item' ? null : modeName === 'select'
    const resolver = engine.compile(selector, mode)
    const source = resolver ? resolver.toString() : null
    return json
      ? JSON.stringify(
          {
            version: pkg.version,
            selector: selector,
            mode: modeName,
            legacy: legacy,
            source,
            sourceBytes: source ? Buffer.byteLength(source) : 0,
            helpers: [...new Set(source?.match(/\bs\.\w+/g) || [])].toSorted(
              (a, b) => a.localeCompare(b),
            ),
            bindings: {
              s: 'engine.Snapshot',
              a: 'resolver-owned ancestor filter feedback, when emitted',
            },
            note: source
              ? 'Raw predicate resolver; candidate acquisition and public API validation are separate.'
              : 'Identity selection: no predicate resolver is needed.',
          },
          null,
          2,
        )
      : source || '// Identity selection: no predicate resolver is needed.'
  } finally {
    window.close()
  }
}
