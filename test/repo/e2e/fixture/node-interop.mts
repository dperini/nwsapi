import type * as TestingLibrary from '@testing-library/dom'
import type * as Jsdom from 'jsdom'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const jsdomPackage = realpathSync(
  path.resolve(directory, 'node_modules/jsdom/package.json'),
)
const consumerRequire = createRequire(jsdomPackage)
const installed = path.resolve(
  path.dirname(consumerRequire.resolve('@asamuzakjp/dom-selector')),
  '..',
)
const metadata = JSON.parse(
  readFileSync(path.resolve(installed, 'package.json'), 'utf8'),
)
assert.deepEqual(metadata.bin, { nwsapi: './bin/nwsapi.js' })
const cliOutput = execFileSync(
  process.execPath,
  [path.resolve(installed, metadata.bin.nwsapi), 'compile', '--json', '.card'],
  { cwd: directory, encoding: 'utf8' },
)
assert.equal(JSON.parse(cliOutput).selector, '.card')
assert.equal(metadata.main, './src/nwsapi.js')
assert.equal(metadata.type, undefined)
assert.equal(metadata.exports['.'], metadata.main)
assert.deepEqual(require('nwsapi/package.json'), metadata)
for (const [subpath, target] of Object.entries(metadata.exports)) {
  const runtime =
    typeof target === 'string'
      ? target
      : (target as { default: string }).default
  const specifier = subpath === '.' ? 'nwsapi' : 'nwsapi' + subpath.slice(1)
  assert.equal(require.resolve(specifier), path.resolve(installed, runtime))
  assert.equal(
    fileURLToPath(import.meta.resolve(specifier)),
    require.resolve(specifier),
  )
}
assert.throws(() => require.resolve('nwsapi/scripts/repo/release/run.mts'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
})
const factory = require('nwsapi')
assert.equal(typeof factory, 'function')
assert.equal(factory, require(path.resolve(installed, 'src/nwsapi.js')))
assert.equal(
  factory.DOMSelector,
  require(path.resolve(installed, 'src/dom-selector.js')),
)
assert.equal(consumerRequire('@asamuzakjp/dom-selector'), factory)
const packageName: string = 'nwsapi'
assert.equal((await import(packageName)).default, factory)
assert.equal((await import(packageName + '/src/nwsapi.js')).default, factory)
assert.equal((await import(packageName + '/src/nwsapi')).default, factory)
assert.equal(
  (await import(packageName + '/src/dom-selector.js')).default,
  factory.DOMSelector,
)
for (const subpath of ['src/modules/nwsapi-legacy', 'dist/external/unicode']) {
  const exported = require(packageName + '/' + subpath)
  assert.equal(require(packageName + '/' + subpath + '.js'), exported)
  assert.equal((await import(packageName + '/' + subpath)).default, exported)
  assert.equal(
    (await import(packageName + '/' + subpath + '.js')).default,
    exported,
  )
}
const { JSDOM } = consumerRequire('jsdom') as typeof Jsdom
const testingLibrary = consumerRequire(
  '@testing-library/dom',
) as typeof TestingLibrary
const dom = new JSDOM(
  '<form><label for="email">Email address</label><input id="email" type="email" required><span id="label">Save changes</span><button aria-labelledby="label" data-testid="save">Save</button></form>',
)
try {
  const engine = factory(dom.window)
  assert.equal(
    engine.first('#email'),
    dom.window.document.getElementById('email'),
  )
  const queries = testingLibrary.within(dom.window.document.body)
  const save = queries.getByRole('button', { name: 'Save changes' })
  assert.equal(save, queries.getByTestId('save'))
  assert.equal(queries.getByLabelText('Email address').id, 'email')
  save.setAttribute('data-testid', 'updated')
  assert.equal(queries.queryByTestId('save'), null)
  assert.equal(queries.getByTestId('updated'), save)
} finally {
  dom.window.close()
}
console.log(`Package interoperability passed on Node ${process.version}`)
