import { afterEach, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'

let dom: JSDOM | undefined
const parserPath =
  '../../../../../docs/repo/perf/pytorch-has-routing/highlight-tokens.mts'
afterEach(() => {
  dom?.window.close()
  vi.unstubAllGlobals()
  vi.doUnmock(parserPath)
  vi.resetModules()
})

async function fixture() {
  dom = new JSDOM(
    '<pre id="code"><code class="language-python"></code></pre>',
    {
      url: 'https://example.test',
    },
  )
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('innerHeight', 900)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
    },
  )
  const node = dom.window.document.querySelector<HTMLElement>('pre')!
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
    height: 100,
    top: 0,
    bottom: 100,
  } as DOMRect)
  const api =
    await import('../../../../../docs/repo/perf/pytorch-has-routing/highlight.mts')
  return { node, api }
}

test('reader language, source text and copying survive highlighting and source changes', async () => {
  const { node, api } = await fixture()
  const source = 'def hello():\r\n    return "😀 <script>" # 12µs\r\n'
  node.querySelector('code')!.textContent = source
  api.initializeHighlighting()
  await vi.waitFor(() => expect(node.dataset['highlight']).toBe('highlights'))
  expect(node.textContent).toBe(source)
  expect(node.querySelector('script')).toBeNull()
  expect(node.querySelector('.time-unit')?.textContent).toBe('µs')
  expect(node.querySelector('.syntax-keyword')?.textContent?.trim()).toBe('def')
  expect(node.hasAttribute('aria-busy')).toBe(false)
  expect(node.dataset['language']).toBe('python')
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  dom!.window.document.querySelector<HTMLButtonElement>('.code-copy')!.click()
  expect(writeText).toHaveBeenCalledWith(source)

  api.code('code', 'const answer: number = 42', 'typescript')
  await vi.waitFor(() => expect(node.dataset['highlight']).toBe('highlights'))
  expect(node.textContent).toBe('const answer: number = 42')
  expect(node.querySelector('.syntax-keyword')?.textContent?.trim()).toBe(
    'const',
  )
  expect(dom!.window.document.querySelectorAll('.code-copy')).toHaveLength(1)
})

test('initialization failure keeps source readable and clears busy state', async () => {
  vi.doMock(parserPath, () => {
    throw new Error('WebAssembly unavailable')
  })
  const { node, api } = await fixture()
  api.code('code', 'const answer = "<script>😀</script>"')
  await vi.waitFor(() => expect(node.dataset['highlight']).toBe('plain'))
  expect(node.textContent).toBe('const answer = "<script>😀</script>"')
  expect(node.querySelector('script')).toBeNull()
  expect(node.hasAttribute('aria-busy')).toBe(false)
})

test('new language and source replace pending work, including an empty result', async () => {
  const { node, api } = await fixture()
  api.code('code', 'const answer = 42', 'plain')
  api.code('code', 'const answer = 42', 'javascript')
  await vi.waitFor(() => expect(node.dataset['highlight']).toBe('highlights'))
  expect(node.querySelector('.syntax-keyword')?.textContent?.trim()).toBe(
    'const',
  )
  api.code('code', 'const old = 1')
  api.code('code', '')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(node.textContent).toBe('')
  expect(node.hasAttribute('aria-busy')).toBe(false)
})
