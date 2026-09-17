import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { BrowserContext } from '@playwright/test'
import { REPO_ROOT } from './paths.mts'

export function agentFavicon(root = REPO_ROOT) {
  return `data:image/svg+xml;base64,${readFileSync(path.join(root, 'assets/repo/agent-favicon.svg')).toString('base64')}`
}

export function installAgentFavicon(href: string) {
  function update() {
    if (!document.head || document.getElementById('nwbox-agent-favicon')) {
      return
    }
    const icon = document.createElement('link')
    icon.id = 'nwbox-agent-favicon'
    icon.rel = 'icon'
    icon.type = 'image/svg+xml'
    icon.href = href
    document.head.append(icon)
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update, { once: true })
  } else {
    update()
  }
}

export async function brandAgentBrowser(
  context: Pick<BrowserContext, 'addInitScript' | 'pages'>,
  root = REPO_ROOT,
) {
  const href = agentFavicon(root)
  await context.addInitScript(installAgentFavicon, href)
  for (const page of context.pages()) {
    await page.evaluate(installAgentFavicon, href)
  }
}
