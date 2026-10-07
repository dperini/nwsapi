import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import {
  NWBOX_COLORS,
  renderAgentFavicon,
  faviconPreview,
  generateAgentFavicon,
  main,
} from '../../../../../scripts/repo/gen/ai/favicon.mts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the gradient diamond remains behind black masks with open faces and a bottom AI stripe', () => {
  const dom = new JSDOM(renderAgentFavicon(), { contentType: 'image/svg+xml' })
  const svg = dom.window.document.documentElement
  expect(svg.getAttribute('viewBox')).toBe('0 0 48 48')
  expect(
    [...svg.querySelectorAll('stop')].map(stop =>
      stop.getAttribute('stop-color'),
    ),
  ).toEqual([NWBOX_COLORS.yellow, NWBOX_COLORS.orange, NWBOX_COLORS.gold])
  const masks = [...svg.querySelectorAll('path[fill-rule="evenodd"]')]
  expect(masks.map(mask => mask.getAttribute('fill'))).toEqual([
    NWBOX_COLORS.black,
    NWBOX_COLORS.black,
  ])
  expect(
    masks.every(
      mask => (mask.getAttribute('d')!.match(/m/gi) ?? []).length > 1,
    ),
  ).toBe(true)
  const separation = svg.querySelector('mask')!
  expect(separation.getAttribute('maskUnits')).toBe('userSpaceOnUse')
  expect(
    separation.querySelector('path[stroke]')?.getAttribute('stroke-width'),
  ).toBe('1.3')
  expect(masks[0]?.parentElement?.getAttribute('mask')).toBe(
    `url(#${separation.id})`,
  )
  expect(masks[1]?.parentElement?.hasAttribute('mask')).toBe(false)
  expect(svg.querySelector(':scope > path')?.hasAttribute('mask')).toBe(false)
  const stripe = svg.querySelector('rect')!
  expect(
    Number(stripe.getAttribute('y')) + Number(stripe.getAttribute('height')),
  ).toBe(48)
  expect(stripe.getAttribute('fill')).toBe(NWBOX_COLORS.black)
  dom.window.close()
})

test('generation checks drift and creates a preview at real favicon sizes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-favicon-test-'))
  roots.push(root)
  const target = generateAgentFavicon(false, false, root)
  expect(readFileSync(target, 'utf8')).toBe(renderAgentFavicon())
  generateAgentFavicon(true, true, root)
  const dom = new JSDOM(faviconPreview())
  expect(
    [...dom.window.document.querySelectorAll('figure img')].map(img =>
      img.getAttribute('width'),
    ),
  ).toEqual(['48', '32', '16'])
  expect(
    dom.window.document.querySelector('link[rel="icon"]')?.getAttribute('href'),
  ).toBe('agent-favicon.svg')
  dom.window.close()
  writeFileSync(target, '<svg/>')
  expect(() => generateAgentFavicon(true, false, root)).toThrow('stale')
  expect(() =>
    renderAgentFavicon({ ...NWBOX_COLORS, orange: 'invalid' }),
  ).toThrow('hexadecimal')
  expect(() => main(['--invalid'])).toThrow('Usage')
})

test('CLI generates in its repository root and help avoids generation', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-favicon-cli-'))
  roots.push(root)
  vi.resetModules()
  vi.doMock('../../../../../scripts/repo/lib/paths.mts', () => ({
    REPO_ROOT: root,
  }))
  vi.doMock('../../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: () => true,
  }))
  const argv = process.argv
  process.argv = ['node', 'favicon.mts']
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const module =
      await import('../../../../../scripts/repo/gen/ai/favicon.mts')
    expect(
      new JSDOM(
        readFileSync(path.join(root, 'assets/repo/agent-favicon.svg'), 'utf8'),
        { contentType: 'image/svg+xml' },
      ).window.document.documentElement.localName,
    ).toBe('svg')
    module.main(['--help'])
    expect(log).toHaveBeenCalledTimes(2)
  } finally {
    process.argv = argv
    vi.doUnmock('../../../../../scripts/repo/lib/paths.mts')
    vi.doUnmock('../../../../../scripts/repo/lib/run-node.mts')
  }
})
