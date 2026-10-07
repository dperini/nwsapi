import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import {
  isSvgOptimized,
  optimiseSvg,
} from '../../../../scripts/repo/gen/svg-optimize.mts'

test('optimization preserves IDs, gradients and transforms while cleaning metadata', () => {
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg">\r\n<!-- old -->\r<metadata>obsolete</metadata><defs><linearGradient id="paint"><stop stop-color="#000"/></linearGradient></defs><path id="shape" transform="translate(2 3)" fill="url(#paint)" d="M 0 0 L 10.12345 20.98765"/></svg>'
  const output = optimiseSvg(source)
  expect(isSvgOptimized(source)).toBe(false)
  expect(isSvgOptimized(output + '\n')).toBe(true)
  const dom = new JSDOM(output, { contentType: 'image/svg+xml' })
  expect(dom.window.document.querySelector('metadata')).toBeNull()
  expect(dom.window.document.querySelector('#paint')?.localName).toBe(
    'linearGradient',
  )
  expect(
    dom.window.document.querySelector('#shape')?.getAttribute('transform'),
  ).toBe('translate(2 3)')
  dom.window.close()
})
test('path-preserving mode retains exact path commands', () => {
  const path = 'M 0 0 L 10.12345 20.98765'
  const source = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}"/></svg>`
  const output = optimiseSvg(source, { preservePathData: true })
  const dom = new JSDOM(output, { contentType: 'image/svg+xml' })
  expect(dom.window.document.querySelector('path')?.getAttribute('d')).toBe(
    path,
  )
  expect(isSvgOptimized(output, { preservePathData: true })).toBe(true)
  dom.window.close()
})
