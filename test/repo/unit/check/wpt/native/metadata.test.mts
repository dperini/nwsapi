import { execFileSync } from 'node:child_process'
import { expect, test, vi } from 'vitest'
import {
  manifestSources,
  pageMetadata,
  parseNativeScript,
  verifyNativeCheckout,
} from '../../../../../../scripts/repo/check/wpt/native/metadata.mts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))

test('checkout verification rejects either a different revision or tracked changes', () => {
  const git = vi.mocked(execFileSync)
  git.mockReturnValueOnce('revision\n').mockReturnValueOnce('')
  expect(() => verifyNativeCheckout('/checkout', 'revision')).not.toThrow()
  git.mockReturnValueOnce('different\n')
  expect(() => verifyNativeCheckout('/checkout', 'revision')).toThrow()
  git.mockReturnValueOnce('revision\n').mockReturnValueOnce(' M file\n')
  expect(() => verifyNativeCheckout('/checkout', 'revision')).toThrow()
})

test('extracts XML metadata and JavaScript module imports without running code', () => {
  const xml = pageMetadata(
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>XML</title><link rel="help" href="spec"/><script src="external.js"/><script>let value = 1</script></head></html>',
    'page.xhtml',
  )
  expect(xml).toMatchObject({
    title: 'XML',
    dependencies: ['external.js'],
    help: ['spec'],
    scripts: ['let value = 1'],
  })
  expect(parseNativeScript('import value from "./module.js"').sourceType).toBe(
    'module',
  )
  expect(
    pageMetadata(
      'import value from "./module.js"; importScripts("./worker.js", variable)',
      'page.mjs',
    ).dependencies,
  ).toEqual(['./module.js', './worker.js'])
})

test('collects dynamic scripts and forwards frame dependencies only for test forwarding pages', () => {
  const source = `<meta name="flags" content="a b"><iframe src="frame.html"></iframe><script>
    const frame = document.createElement('iframe'); frame.src = 'dynamic.html';
    const script = document.createElement('script'); script.type = 'module';
    script.src = 'module.js'; script.text = \`document.querySelector('div')\`;
    const literal = document.createElement('script'); literal.textContent = 'const x = 1';
    const data = document.createElement('script'); data.type = 'application/json'; data.text = '{}';
    const embedded = ['embedded.js'];
    window.addEventListener('message', () => {});
  </script>`
  const metadata = pageMetadata(source, 'page.html')
  expect(metadata.flags).toEqual(['a', 'b'])
  expect(metadata.dependencies).toEqual([
    'module.js',
    'frame.html',
    'dynamic.html',
    'embedded.js',
  ])
  expect(metadata.scripts).toHaveLength(3)
  expect(
    pageMetadata(
      '<iframe src="frame.html"></iframe><script>const x = 1</script>',
      'page.html',
    ).dependencies,
  ).toEqual([])
  expect(
    pageMetadata(
      '<iframe src="frame.html"></iframe><script>fetch_tests_from_window(window)</script>',
      'page.html',
    ).dependencies,
  ).toEqual(['frame.html'])
})

test('manifest variants default to their source paths and discard nonvariant entries', () => {
  expect([
    ...manifestSources({
      testharness: {
        'page.html': ['hash', [null, {}], ['/alternate', {}], null],
        empty: null,
      },
    }),
  ]).toEqual([
    ['/page.html', 'page.html'],
    ['/alternate', 'page.html'],
  ])
})

test('metadata handles empty XML fields, ignored data scripts and templated server values', () => {
  expect(
    pageMetadata(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title/><link rel="help"/><script/></head></html>',
      'empty.xhtml',
    ),
  ).toMatchObject({ title: '', help: [''], scripts: [''] })
  const metadata = pageMetadata(
    '<meta name="flags"><script type="application/json">{}</script><script>const script = document.createElement("script"); script.text = value; script.textContent = `hello ${value}`; script.innerHTML = ``; const files = ["a.js", 1]; const server = {{value}};</script>',
    'empty.html',
  )
  expect(metadata.flags).toEqual([''])
  expect(metadata.scripts).toHaveLength(2)
  expect(metadata.scripts[1]).toBe('')
  expect(metadata.dependencies).toEqual([])
  expect(parseNativeScript('const value = {{server_value}}').body).toHaveLength(
    1,
  )
})
