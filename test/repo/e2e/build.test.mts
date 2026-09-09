import type * as NwsapiModule from '../../../dist/nwsapi.js'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { parse } from 'acorn'
import { JSDOM } from 'jsdom'
import { beforeAll, test } from 'vitest'

let source: string
const pkg = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
)

beforeAll(() => {
  source = readFileSync(
    new URL('../../../dist/nwsapi.js', import.meta.url),
    'utf8',
  )
  assert.match(source, /^\/\*!\n \* NWSAPI /)
  assert.ok(source.includes(`NWSAPI ${pkg.version} -`))
})

for (const [file, ecmaVersion] of [
  ['dist/nwsapi.js', 5],
  ['dist/modules/nwsapi-legacy.js', 5],
  ['dist/modules/nwsapi-jquery.js', 5],
  ['dist/modules/nwsapi-traversal.js', 5],
] as const) {
  test(`${file} parses as ES${ecmaVersion} script syntax`, () => {
    const code = readFileSync(
      new URL(`../../../${file}`, import.meta.url),
      'utf8',
    )
    parse(code, { ecmaVersion, sourceType: 'script' })
  })
}

test('Unicode external paths and declarations agree between source and distribution', () => {
  const require = createRequire(import.meta.url)
  const external = require('../../../src/external/unicode.js') as Record<
    string,
    RegExp
  >
  const bundled = require('../../../dist/external/unicode.js') as Record<
    string,
    RegExp
  >
  assert.deepEqual(
    Object.keys(bundled).toSorted(),
    Object.keys(external).toSorted(),
  )
  for (const key of Object.keys(external)) {
    assert.equal(bundled[key]!.source, external[key]!.source)
    assert.equal(bundled[key]!.flags, external[key]!.flags)
  }
  assert.equal(
    readFileSync(
      new URL('../../../src/external/unicode.d.ts', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../../../dist/external/unicode.d.ts', import.meta.url),
      'utf8',
    ),
  )
  const program = parse(
    readFileSync(
      new URL('../../../dist/external/unicode.js', import.meta.url),
      'utf8',
    ),
    { ecmaVersion: 2015 },
  )
  // Resolving the bundle must not leave a dependency on an installed data package.
  assert.ok(program.body.length)
  const module = { exports: {} }
  vm.runInNewContext(
    readFileSync(
      new URL('../../../dist/external/unicode.js', import.meta.url),
      'utf8',
    ),
    { module, exports: module.exports },
  )
  assert.deepEqual(
    Object.keys(module.exports).toSorted(),
    Object.keys(external).toSorted(),
  )
})

for (const tree of ['src', 'dist']) {
  test(`${tree}/external supports Node CommonJS and ESM named imports`, () => {
    const data = new URL(
      `../../../${tree}/external/unicode.js`,
      import.meta.url,
    )
    execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `import assert from 'node:assert/strict';
       import { createRequire } from 'node:module';
       import { leftToRight, rightToLeft, arabicLetter } from ${JSON.stringify(data.href)};
       const require = createRequire(${JSON.stringify(data.href)});
       const commonjs = require(${JSON.stringify(data.pathname)});
       assert.equal(leftToRight, commonjs.leftToRight);
       assert.equal(rightToLeft, commonjs.rightToLeft);
       assert.equal(arabicLetter, commonjs.arabicLetter);`,
    ])
  })
}

test('build output stays in dist and has no minified artifact', () => {
  for (const file of [
    'src/nwsapi.js',
    'src/dom-selector.js',
    'src/modules/nwsapi-jquery.js',
    'src/modules/nwsapi-traversal.js',
    'bin/nwsapi.js',
    'dist/nwsapi.min.js',
  ]) {
    assert.equal(
      existsSync(new URL('../../../' + file, import.meta.url)),
      false,
      file,
    )
  }
  assert.ok(source.split('\n').length > 1000)
})

test('adapter retains its existing ES2019 CommonJS syntax', () => {
  const code = readFileSync(
    new URL('../../../dist/dom-selector.js', import.meta.url),
    'utf8',
  )
  parse(code, { ecmaVersion: 2019, sourceType: 'script' })
  assert.match(code, /require\(['"]css-tree['"]\)/)
  assert.match(code, /module\.exports\s*=\s*DOMSelector/)
})

for (const format of ['browser', 'CommonJS', 'AMD'] as const) {
  test(`distribution ${format} build selects, matches, and observes mutations`, () => {
    const dom = new JSDOM('<div><p id="a" class="x"></p><p id="b"></p></div>', {
      runScripts: 'outside-only',
    })
    const { window } = dom
    try {
      let factory: typeof NwsapiModule.default | undefined
      if (format === 'CommonJS') {
        const module = { exports: {} }
        vm.runInNewContext(source, { module, exports: module.exports })
        factory = module.exports as typeof NwsapiModule.default
        assert.equal(
          typeof Object.getOwnPropertyDescriptor(factory, 'DOMSelector')!.get,
          'function',
        )
      } else if (format === 'AMD') {
        const define = (value: typeof NwsapiModule.default) => {
          factory = value
        }
        define.amd = {}
        vm.runInNewContext(source, { define })
      } else {
        vm.runInContext(source, dom.getInternalVMContext())
      }
      const engine = factory ? factory(window) : window.NW.Dom
      assert.equal(engine.Version, `nwsapi-${pkg.version}`)
      const ids = () =>
        Array.from(engine.select('div > p.x'), (node: Element) => node.id)
      assert.deepEqual(ids(), ['a'])
      assert.equal(
        engine.match('div > p.x', window.document.getElementById('a')!),
        true,
      )
      window.document.getElementById('b')!.className = 'x'
      assert.deepEqual(ids(), ['a', 'b'])
    } finally {
      window.close()
    }
  })
}
