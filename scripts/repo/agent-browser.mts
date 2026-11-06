import { chromium } from '@playwright/test'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { optional } from '@optique/core/modifiers'
import { argument } from '@optique/core/primitives'
import { string } from '@optique/core/valueparser'
import { browserLaunchOptions } from './browser.mts'
import { brandAgentBrowser } from './lib/agent-browser.mts'
import { HELP_SHOWN, runCli } from './lib/cli/parser.mts'
import { isMainModule } from './lib/run-node.mts'

export function agentBrowserUrl(args: string[]) {
  if (args.length > 1) {
    throw new Error('Usage: pnpm run browser:agent [http(s)://URL]')
  }
  const url = new URL(args[0] ?? 'http://127.0.0.1:8765/')
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('The agent browser requires an HTTP or HTTPS URL.')
  }
  return url.href
}

export async function main(args = process.argv.slice(2)) {
  const values = runCli(
    object({ url: optional(argument(string())) }),
    'browser:agent',
    args,
    { brief: message`Open the pinned browser with the nwbox AI favicon.` },
  )
  if (values === HELP_SHOWN) {
    return
  }
  const url = agentBrowserUrl(values.url ? [values.url] : [])
  const browser = await chromium.launch({
    ...browserLaunchOptions(),
    headless: false,
  })
  try {
    const context = await browser.newContext()
    await brandAgentBrowser(context)
    const page = await context.newPage()
    await page.goto(url)
    await new Promise<void>(resolve =>
      browser.once('disconnected', () => resolve()),
    )
  } finally {
    await browser.close()
  }
}

if (isMainModule(import.meta.url)) {
  await main()
}
