import { browserLaunchOptions } from '../../../browser.mts'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium } from '@playwright/test'

const files = [process.argv[2]!, 'dist/nwsapi.js']
const browser = await chromium.launch(browserLaunchOptions())
const rows = []
try {
  for (let round = 0; round < 3; ++round) {
    for (let offset = 0; offset < 2; ++offset) {
      const variant = (round + offset) % 2
      const page = await browser.newPage()
      try {
        await page.setContent('<body></body>')
        await page.addScriptTag({
          content: readFileSync(files[variant]!, 'utf8'),
        })
        const expected = await page.evaluate(() => {
          const refs: Array<WeakRef<Node>> = []
          for (let i = 0; i < 40; ++i) {
            const root = document.createElement('main')
            root.innerHTML = '<i data-hit></i>'.repeat(32)
            document.body.append(root)
            if (NW.Dom.select('[data-hit]', root).length !== 32) {
              throw new Error('Initial query mismatch')
            }
            root.setAttribute('data-unrelated', '1')
            root.firstElementChild!.removeAttribute('data-hit')
            if (NW.Dom.select('[data-hit]', root).length !== 31) {
              throw new Error('Mutation query mismatch')
            }
            refs.push(new WeakRef(root), new WeakRef(root.firstElementChild!))
            root.remove()
          }
          NW.Dom.select('body', document)
          Reflect.set(window, 'retentionRefs', refs)
          return refs.length
        })
        const session = await page.context().newCDPSession(page)
        try {
          for (let pass = 0; pass < 4; ++pass) {
            await session.send('HeapProfiler.collectGarbage')
          }
          const surviving = await page.evaluate(() => {
            const refs = Reflect.get(window, 'retentionRefs') as Array<
              WeakRef<Node>
            >
            return refs.filter(ref => ref.deref()).length
          })
          assert.equal(
            surviving,
            0,
            'Detached wildcard contexts must be collected',
          )
          rows.push({
            round,
            variant,
            observedNodes: expected,
            survivingNodes: surviving,
          })
        } finally {
          await session.detach()
        }
      } finally {
        await page.close()
      }
    }
  }
  writeFileSync(
    'assets/repo/bench/attribute-identity-browser-retention.json',
    JSON.stringify(
      {
        browser: browser.version(),
        hashes: files.map(file =>
          createHash('sha256').update(readFileSync(file)).digest('hex'),
        ),
        methodology:
          'Three rotating rounds with fresh pages. Forty queried wildcard contexts per page, unrelated attribute mutation and predicate change, then detach. Keep engine alive, release public scope, and force collection in four separate protocol calls. Observe two weak references per context. No retained-byte claim.',
        rows,
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser.close()
}
