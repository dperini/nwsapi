import { readFileSync } from 'node:fs'
import { rolldown } from 'rolldown'
import type { Browser } from '@playwright/test'
import { competitorEntry, sha256 } from '../footprint/shared.mts'
import { ENGINE_BUILD_PATH } from '../../lib/paths.mts'

export interface NativeContext {
  frame: HTMLIFrameElement
  document: Document
  all(selector: string, root?: Document | Element): ArrayLike<Element>
  first(selector: string, root?: Document | Element): Element | null
}
export interface NativeGlobals {
  __nwsapiFactory: (window: Window) => {
    select(selector: string, root: Document | Element): ArrayLike<Element>
    first(selector: string, root: Document | Element): Element | null
  }
  __competitor: {
    DOMSelector: new (
      window: Window,
      document: Document,
    ) => {
      querySelectorAll(selector: string, root: Document | Element): Element[]
      querySelector(selector: string, root: Document | Element): Element | null
    }
  }
  __createContext(
    html: string,
    engine: number,
    initialize?: boolean,
  ): NativeContext
  __retained?: NativeContext[]
}

export async function nativeSources(entry = competitorEntry) {
  const bundle = await rolldown({
    input: entry,
    platform: 'browser',
    treeshake: false,
  })
  try {
    const { output } = await bundle.generate({
      format: 'iife',
      name: '__competitor',
      codeSplitting: false,
    })
    const chunk = output[0]
    if (
      output.length !== 1 ||
      chunk?.type !== 'chunk' ||
      chunk.imports.length
    ) {
      throw new Error(
        'Comparison requires a complete standalone competitor bundle.',
      )
    }
    const candidate = readFileSync(ENGINE_BUILD_PATH, 'utf8')
    return {
      candidate: `(function(){const module={exports:{}};const exports=module.exports;\n${candidate}\nglobalThis.__nwsapiFactory=module.exports;})();`,
      competitor: chunk.code,
      competitorBundleSha256: sha256(chunk.code),
    }
  } finally {
    await bundle.close()
  }
}

export async function nativePage(
  browser: Browser,
  sources: Awaited<ReturnType<typeof nativeSources>>,
) {
  const page = await browser.newPage()
  await page.route('https://nwsapi.test/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body></body>',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    }),
  )
  await page.goto('https://nwsapi.test/')
  await page.addScriptTag({ content: sources.candidate })
  await page.addScriptTag({ content: sources.competitor })
  await page.evaluate(() => {
    const host = window as unknown as NativeGlobals
    host.__createContext = (html, engine, initialize = true) => {
      const frame = document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-same-origin')
      frame.hidden = true
      document.body.appendChild(frame)
      const inner = frame.contentWindow!
      const doc = inner.document
      doc.open()
      doc.write(html)
      doc.close()
      const context: NativeContext = {
        frame,
        document: doc,
        all: () => {
          throw new Error('Engine not initialized.')
        },
        first: () => {
          throw new Error('Engine not initialized.')
        },
      }
      if (initialize) {
        if (engine === 0) {
          const instance = host.__nwsapiFactory(inner)
          context.all = (selector, root = doc) =>
            instance.select(selector, root)
          context.first = (selector, root = doc) =>
            instance.first(selector, root)
        } else {
          const instance = new host.__competitor.DOMSelector(inner, doc)
          context.all = (selector, root = doc) =>
            instance.querySelectorAll(selector, root)
          context.first = (selector, root = doc) =>
            instance.querySelector(selector, root)
        }
      }
      return context
    }
  })
  if (!(await page.evaluate(() => crossOriginIsolated))) {
    throw new Error(
      'Comparison needs an isolated browser context for high-resolution timers.',
    )
  }
  return page
}
