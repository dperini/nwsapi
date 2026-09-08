import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import factory from '../../src/nwsapi.js'

const args = process.argv.slice(2)
if (!args.length || args.includes('--help')) {
  console.log(`Usage: node bin/nwsapi-compile.mjs [--mode select|match|item] [--legacy] [--json] <selector>
Print the generated resolver for a selector. Requires repository dev dependencies and a build.
The resolver closes over engine Snapshot (s) and optional ancestor-filter state (a).
This is compiler inspection output, not a standalone querySelectorAll implementation.`)
} else {
  let modeName = 'select'
  const modeIndex = args.indexOf('--mode')
  if (modeIndex !== -1) {
    modeName = args.splice(modeIndex, 2)[1]
  }
  const flags = new Set(args.filter(arg => arg.startsWith('--')))
  const selectors = args.filter(arg => !arg.startsWith('--'))
  if (
    selectors.length !== 1 ||
    [...flags].some(flag => flag !== '--json' && flag !== '--legacy') ||
    !['select', 'match', 'item'].includes(modeName)
  ) {
    throw new Error(
      'Invalid arguments. Run node bin/nwsapi-compile.mjs --help.',
    )
  }
  const { window } = new JSDOM('<!doctype html><html><body></body></html>')
  try {
    const engine = factory(window)
    engine.configure({ LEGACY: flags.has('--legacy') })
    const mode = modeName === 'item' ? null : modeName === 'select'
    const resolver = engine.compile(selectors[0], mode)
    const source = resolver ? resolver.toString() : null
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    )
    console.log(
      flags.has('--json')
        ? JSON.stringify(
            {
              version: pkg.version,
              selector: selectors[0],
              mode: modeName,
              legacy: flags.has('--legacy'),
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
        : source || '// Identity selection: no predicate resolver is needed.',
    )
  } finally {
    window.close()
  }
}
