import type { Browser, BrowserServer } from '@playwright/test'
import { createInterface } from 'node:readline'
import { isMainModule } from '../../lib/run-node.mts'
import { browserLaunchOptions } from '../../browser.mts'
import { validateNarrationUrl } from './url.mts'

export interface VoiceOverDriver {
  readonly start: (options: {
    capture: false
    retries: number
    timeout: number
  }) => Promise<void>
  readonly stop: (options: {
    capture: false
    retries: number
    timeout: number
  }) => Promise<void>
  readonly perform: (
    command: unknown,
    options: { capture: true; retries: number; timeout: number },
  ) => Promise<void>
  readonly keyboardCommands: { moveCursorToKeyboardFocus: unknown }
  readonly spokenPhraseLog: () => Promise<string[]>
}

export interface NarrationPage {
  url: () => string
  bringToFront: () => Promise<void>
  isVisible: () => Promise<boolean>
  hasFocus: () => Promise<boolean>
  heading: () => Promise<string>
  focusReadingMode: () => Promise<void>
  armOwnershipWatch: () => Promise<void>
  ownershipIntact: () => Promise<boolean>
  dispose: () => Promise<void>
  processId: number
}

export interface WorkerAdapters {
  openPage: (
    url: string,
    onBrowserStarted: (pid: number) => void,
    onBrowserClosed: (pid: number) => void,
  ) => Promise<NarrationPage>
  isOwnedBrowserFrontmost: (processId: number) => Promise<boolean>
  loadVoiceOver: () => Promise<VoiceOverDriver>
  onStarted: () => void
  onBrowserStarted: (processId: number) => void
  onBrowserClosed: (processId: number) => void
  authorizeStart: () => Promise<boolean>
  onStop: (stop: () => Promise<void>) => void
}

export interface WorkerResult {
  status: number
  started: boolean
  evidence?: {
    action: string
    pageUrl: string
    phrases: string[]
  }
  error?: string
}

export const EXPECTED_HEADING = 'API'
export const EXPECTED_CONTROL_PHRASE = 'Reading mode'

export async function runVoiceOverWorker(
  url: string,
  adapters: WorkerAdapters,
): Promise<WorkerResult> {
  validateNarrationUrl(url)
  let page: NarrationPage | undefined
  let voiceOver: VoiceOverDriver | undefined
  let startAttempted = false
  let cancelled = false
  adapters.onStop(async () => {
    cancelled = true
    if (voiceOver && startAttempted) {
      await voiceOver.stop({ capture: false, retries: 1, timeout: 5000 })
    }
  })
  try {
    page = await adapters.openPage(
      url,
      pid => adapters.onBrowserStarted(pid),
      pid => adapters.onBrowserClosed(pid),
    )
    assertNotCancelled()
    await page.bringToFront()
    assertNotCancelled()
    await verifyPage(page, url, adapters)
    assertNotCancelled()
    const heading = await page.heading()
    assertNotCancelled()
    if (heading.trim() !== EXPECTED_HEADING) {
      throw new Error('The selected local page did not show the API document.')
    }
    await page.focusReadingMode()
    assertNotCancelled()
    await verifyPage(page, url, adapters)
    assertNotCancelled()
    voiceOver = await adapters.loadVoiceOver()
    assertNotCancelled()
    if (!(await adapters.authorizeStart())) {
      throw new Error('The parent did not authorize VoiceOver startup.')
    }
    assertNotCancelled()
    startAttempted = true
    adapters.onStarted()
    await voiceOver.start({ capture: false, retries: 1, timeout: 15_000 })
    assertNotCancelled()
    await page.bringToFront()
    await page.focusReadingMode()
    await verifyPage(page, url, adapters)
    await page.armOwnershipWatch()
    await verifyPage(page, url, adapters)
    const beforeCount = (await voiceOver.spokenPhraseLog()).length
    assertNotCancelled()
    await voiceOver.perform(
      voiceOver.keyboardCommands.moveCursorToKeyboardFocus,
      {
        capture: true,
        retries: 1,
        timeout: 5000,
      },
    )
    assertNotCancelled()
    if (!(await page.ownershipIntact())) {
      throw new Error(
        'The page lost foreground ownership during speech capture.',
      )
    }
    await verifyPage(page, url, adapters)
    const after = await voiceOver.spokenPhraseLog()
    assertNotCancelled()
    if (!(await page.ownershipIntact())) {
      throw new Error(
        'The page lost foreground ownership during speech capture.',
      )
    }
    assertNotCancelled()
    const phrases = after
      .slice(beforeCount)
      .filter(phrase => phrase.trim())
      .slice(0, 5)
      .map(phrase => phrase.slice(0, 300))
    if (!phrases.some(phrase => phrase.includes(EXPECTED_CONTROL_PHRASE))) {
      throw new Error('VoiceOver did not speak the expected page control.')
    }
    return {
      status: 0,
      started: startAttempted,
      evidence: { action: 'moveCursorToKeyboardFocus', pageUrl: url, phrases },
    }
  } catch (error) {
    return {
      status: 1,
      started: startAttempted,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (voiceOver && startAttempted) {
      await voiceOver
        .stop({ capture: false, retries: 1, timeout: 5000 })
        .catch(() => undefined)
    }
    await page?.dispose().catch(() => undefined)
  }

  function assertNotCancelled() {
    if (cancelled) {
      throw new Error('Narration was cancelled.')
    }
  }
}

async function verifyPage(
  page: NarrationPage,
  url: string,
  adapters: WorkerAdapters,
) {
  if (
    page.url() !== url ||
    !(await page.isVisible()) ||
    !(await page.hasFocus()) ||
    !(await adapters.isOwnedBrowserFrontmost(page.processId))
  ) {
    throw new Error(
      'The intended API page is not the verified foreground page.',
    )
  }
}

async function openPage(
  url: string,
  onBrowserStarted: (pid: number) => void,
  onBrowserClosed: (pid: number) => void,
): Promise<NarrationPage> {
  const { chromium } = await import('@playwright/test')
  let server: BrowserServer | undefined
  let browser: Browser | undefined
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined
  let processId: number | undefined
  try {
    server = (await chromium.launchServer({
      headless: false,
      ...browserLaunchOptions(),
    })) as BrowserServer
    const browserPid = server.process().pid ?? 0
    if (browserPid < 1) {
      throw new Error('Could not identify the owned browser process.')
    }
    processId = browserPid
    onBrowserStarted(browserPid)
    browser = (await chromium.connect(server.wsEndpoint())) as Browser
    context = await browser.newContext()
    const page = await context.newPage()
    let lost = false
    let watching = false
    page.on('framenavigated', () => {
      lost ||= watching
    })
    page.on('crash', () => {
      lost ||= watching
    })
    page.on('close', () => {
      lost ||= watching
    })
    page.on('popup', () => {
      lost ||= watching
    })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    await page.waitForFunction(
      () =>
        Boolean(document.querySelector('#reading-content h1')) &&
        !document.querySelector('#reading-content')?.hasAttribute('aria-busy'),
      undefined,
      { timeout: 10_000 },
    )
    await page.evaluate(() => {
      const observed = window as Window & {
        __nwsapiNarrationFocusLost?: boolean
      }
      observed.__nwsapiNarrationFocusLost = false
      addEventListener(
        'blur',
        () => {
          observed.__nwsapiNarrationFocusLost = true
        },
        true,
      )
      addEventListener(
        'pagehide',
        () => {
          observed.__nwsapiNarrationFocusLost = true
        },
        true,
      )
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') {
          observed.__nwsapiNarrationFocusLost = true
        }
      })
    })
    return {
      url: () => page.url(),
      bringToFront: () => page.bringToFront(),
      isVisible: () =>
        page.evaluate(() => document.visibilityState === 'visible'),
      hasFocus: () => page.evaluate(() => document.hasFocus()),
      heading: () => page.locator('#reading-content h1').innerText(),
      focusReadingMode: async () => {
        await page.getByRole('button', { name: 'Reading mode' }).focus()
      },
      armOwnershipWatch: async () => {
        watching = true
        lost = false
        await page.evaluate(() => {
          const observed = window as Window & {
            __nwsapiNarrationFocusLost?: boolean
          }
          observed.__nwsapiNarrationFocusLost = false
        })
      },
      ownershipIntact: async () => {
        const pageIntact = await page.evaluate(() => {
          const observed = window as Window & {
            __nwsapiNarrationFocusLost?: boolean
          }
          return observed.__nwsapiNarrationFocusLost === false
        })
        return !lost && pageIntact
      },
      dispose: async () => {
        await context?.close()
        await browser?.close()
        if (server) {
          await closeOwnedBrowser(
            () => server!.close(),
            browserPid,
            onBrowserClosed,
          )
        }
      },
      processId: browserPid,
    }
  } catch (error) {
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    if (server && processId !== undefined) {
      await closeOwnedBrowser(
        () => server!.close(),
        processId,
        onBrowserClosed,
      ).catch(() => undefined)
    }
    throw error
  }
}

export async function closeOwnedBrowser(
  closeServer: () => Promise<void>,
  processId: number,
  onBrowserClosed: (pid: number) => void,
) {
  await closeServer()
  onBrowserClosed(processId)
}

async function loadVoiceOver(): Promise<VoiceOverDriver> {
  const module = await import('@guidepup/guidepup')
  return module.voiceOver as unknown as VoiceOverDriver
}

function isOwnedBrowserFrontmost(processId: number) {
  if (processId <= 0) {
    return Promise.resolve(false)
  }
  return import('node:child_process').then(({ execFileSync }) => {
    try {
      const foregroundPid = execFileSync(
        '/usr/bin/osascript',
        [
          '-e',
          'tell application "System Events" to get unix id of first application process whose frontmost is true',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 1000 },
      ).trim()
      return foregroundPid === String(processId)
    } catch {
      return false
    }
  })
}

function writeMessage(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

async function main(args = process.argv.slice(2)) {
  const urlIndex = args.indexOf('--url')
  const url = urlIndex >= 0 ? args[urlIndex + 1] : undefined
  const nonceIndex = args.indexOf('--nonce')
  const nonce = nonceIndex >= 0 ? args[nonceIndex + 1] : undefined
  if (!url || !nonce || args.length !== 4) {
    process.stderr.write(
      'VoiceOver worker requires a parent session handshake.\n',
    )
    return 2
  }
  const controls = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })
  const lines = controls[Symbol.asyncIterator]()
  const go = await nextControlLine(lines, 5000)
  if (go !== `GO:${nonce}`) {
    controls.close()
    process.stderr.write('VoiceOver worker authorization was not received.\n')
    return 2
  }
  let stop = async () => {}
  const requestStop = () => {
    void stop().catch(() => undefined)
  }
  process.on('SIGINT', requestStop)
  process.on('SIGTERM', requestStop)
  const result = await runVoiceOverWorker(url, {
    openPage,
    isOwnedBrowserFrontmost,
    loadVoiceOver,
    onStarted: () => writeMessage({ event: 'start-attempt' }),
    onBrowserStarted: pid => writeMessage({ event: 'browser', pid }),
    onBrowserClosed: pid => writeMessage({ event: 'browser-closed', pid }),
    authorizeStart: async () =>
      (await nextControlLine(lines, 15_000)) === `START:${nonce}`,
    onStop: callback => {
      stop = callback
    },
  })
  process.removeListener('SIGINT', requestStop)
  process.removeListener('SIGTERM', requestStop)
  controls.close()
  writeMessage({ event: 'result', result })
  return result.status
}

async function nextControlLine(lines: AsyncIterator<string>, timeout: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      lines.next(),
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), timeout)
      }),
    ])
    return result && !result.done ? result.value : undefined
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main()
}
