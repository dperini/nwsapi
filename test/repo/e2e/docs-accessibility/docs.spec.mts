import { writeFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({
      path: info.outputPath('failure.png'),
      fullPage: true,
    })
  }
})

const cases = [
  {
    name: 'document catalog',
    route: '/index.html',
    content: '#document-search',
  },
  {
    name: 'API reader',
    route: '/model-guide-reading.html?doc=docs/repo/selector/api.md',
    content: '#reading-content h1',
  },
]
const viewports = [320, 1440]
const colorModes = ['light', 'dark'] as const

for (const pageCase of cases) {
  for (const width of viewports) {
    for (const colorMode of colorModes) {
      test(`${pageCase.name} has no axe violations at ${width}px in ${colorMode} mode`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme: colorMode })
        await page.addInitScript(mode => {
          localStorage.setItem('nwsapi-guide-color-mode', mode)
          localStorage.removeItem('nwsapi-guide-reading')
        }, colorMode)
        await page.goto(pageCase.route)
        await page.locator(pageCase.content).waitFor()
        await expect(page.locator('html')).toHaveAttribute(
          'data-color-mode',
          colorMode,
        )
        if (pageCase.name === 'API reader') {
          await expect(page.locator('#reading-content')).not.toHaveAttribute(
            'aria-busy',
            'true',
          )
        }

        if (pageCase.name === 'document catalog') {
          const search = page.locator('#document-search')
          await search.fill('api')
          const clear = page.locator('#clear-search')
          await expect(clear).toBeEnabled()
          const target = await clear.boundingBox()
          expect(target?.width).toBeGreaterThanOrEqual(44)
          expect(target?.height).toBeGreaterThanOrEqual(44)
          await page.waitForFunction(
            () => document.documentElement.scrollWidth <= innerWidth,
          )
        } else {
          const summary = page
            .locator('#reading-content details > summary')
            .first()
          await expect(summary).toBeVisible()
          const target = await summary.boundingBox()
          expect(target?.height).toBeGreaterThanOrEqual(44)
          await page.waitForFunction(
            () => document.documentElement.scrollWidth <= innerWidth,
          )
          const source = page.getByRole('link', {
            name: 'View on GitHub',
            exact: true,
          })
          const sourceTarget = await source.boundingBox()
          expect(sourceTarget?.width).toBeGreaterThanOrEqual(44)
          expect(sourceTarget?.height).toBeGreaterThanOrEqual(44)
        }

        let results: Awaited<ReturnType<AxeBuilder['analyze']>> | undefined
        let analyzerError: unknown
        try {
          results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        } catch (error) {
          analyzerError = error
        }
        const report = analyzerError
          ? {
              analyzerError:
                analyzerError instanceof Error
                  ? analyzerError.message
                  : (JSON.stringify(analyzerError) ?? 'Unknown axe error'),
            }
          : results
        const reportJson = JSON.stringify(report, null, 2)
        await writeFile(test.info().outputPath('axe-results.json'), reportJson)
        await test.info().attach('axe-results.json', {
          body: reportJson,
          contentType: 'application/json',
        })
        if (analyzerError) {
          throw analyzerError
        }
        if (!results) {
          throw new Error('axe scan returned no results.')
        }
        expect(results.violations).toEqual([])
      })
    }
  }
}

test('API reader recovers from copy failure and retains keyboard focus', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/model-guide-reading.html?doc=docs/repo/selector/api.md')
  const content = page.locator('#reading-content')
  await expect(content.locator('h1')).toBeVisible()
  const before = await content.boundingBox()

  const copy = content.locator('.code-copy').first()
  await copy.locator('xpath=ancestor::details').locator('summary').click()
  const snippet = await copy.locator('xpath=../../pre').innerText()
  await expect(copy).toBeVisible()
  await page.evaluate(() => {
    let attempts = 0
    const clipboard = navigator.clipboard
    const writeText = clipboard.writeText.bind(clipboard)
    const readText = clipboard.readText.bind(clipboard)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          attempts += 1
          if (attempts === 1) {
            throw new Error('simulated clipboard failure')
          }
          await writeText(text)
        },
        readText,
      },
    })
  })
  await copy.focus()
  await page.keyboard.press('Enter')
  const status = content.getByRole('status')
  await expect(status).toHaveText('Select the code to copy it manually.')
  await page.waitForTimeout(2500)
  await expect(status).toHaveText('Select the code to copy it manually.')
  await expect(copy).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Copied')
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(snippet)
  await expect(copy).toBeFocused()
  await expect(copy).toHaveAttribute('aria-label', 'Code copied')
  await expect(copy).toBeFocused()
  await expect(status).toHaveAttribute('data-copy-outcome', 'copied')
  const copied = await content.boundingBox()
  expect(copied?.x).toBe(before?.x)
  expect(copied?.width).toBe(before?.width)

  await expect(copy).toHaveAttribute('aria-label', 'Copy code', {
    timeout: 2000,
  })
  await expect(status).toHaveText('Copied')
  await expect(status).toHaveAttribute('data-copy-outcome', 'copied')
})

test('API reader geometry remains stable when reading mode is toggled', async ({
  page,
}) => {
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('nwsapi-guide-reading', 'false')
    })
    await page.goto('/model-guide-reading.html?doc=docs/repo/selector/api.md')
    await expect(page.locator('html')).not.toHaveAttribute('data-reading-mode')
    const content = page.locator('#reading-content')
    await expect(content.locator('h1')).toBeVisible()
    const before = await content.boundingBox()
    await page.locator('[data-reading-toggle]').click()
    await expect(page.locator('html')).toHaveAttribute('data-reading-mode')
    await expect
      .poll(async () => {
        const after = await content.boundingBox()
        return { x: after?.x, width: after?.width }
      })
      .toEqual({ x: before?.x, width: before?.width })
  }
})

test('catalog clear and undo preserve the search and keyboard focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/index.html')
  const search = page.locator('#document-search')
  const clear = page.locator('#clear-search')
  const undo = page.locator('#undo-clear-search')
  await expect(clear).toBeDisabled()
  await search.fill('route planner')
  await expect(clear).toBeEnabled()
  const count = page.locator('#document-count')
  await expect(count).toContainText(/\d/)
  await clear.focus()
  await page.keyboard.press('Enter')
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await expect(clear).toBeDisabled()
  await expect(undo).toBeVisible()
  await undo.focus()
  await page.keyboard.press('Enter')
  await expect(search).toHaveValue('route planner')
  await expect(search).toBeFocused()
  await expect(undo).toBeHidden()
  await expect(clear).toBeEnabled()
})

test('mobile contents supports Escape and keyboard section selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/model-guide-reading.html?doc=docs/repo/selector/api.md')
  const toggle = page.locator('[data-reader-contents-toggle]')
  const close = page.locator('[data-reading-contents-close]')
  const contents = page.locator('#reading-navigation')
  await expect(toggle).toBeEnabled()
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()
  await page.keyboard.press('Enter')
  const section = contents.locator('a[href^="#"]').first()
  const id = decodeURIComponent((await section.getAttribute('href'))!.slice(1))
  await section.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe(id)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320)
})
