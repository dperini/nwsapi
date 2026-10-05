import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAgent } from 'std-env'
import { ensurePhp, phpInstallHint } from '../../scripts/php.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const modules = path.join(root, '.gitmodules')
const prefix = 'submodule.upstream/wpt.'
const get = key => execFileSync('git', ['config', '--file', modules, '--get', prefix + key], { encoding: 'utf8' }).trim()
const config = { path: get('path'), ref: get('ref') }
const upstream = path.join(root, config.path)

// The pinned checkout must be pristine: WPT pages are served from it verbatim.
function verify() {
  if (!existsSync(path.join(upstream, 'resources', 'testharness.js'))) {
    throw new Error('Missing WPT harness resources; run npm run wpt:setup')
  }
  const head = execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (head !== config.ref) throw new Error(`${config.path} is not pinned at ${config.ref}; run npm run wpt:setup`)
  if (execFileSync('git', ['-C', upstream, 'status', '--porcelain'], { encoding: 'utf8' }) !== '') {
    throw new Error(`${config.path} is dirty; refusing to run modified upstream tests`)
  }
}

// The curated subset and its expected results come from index.html: pages
// list their historically expected (passed / total) counts. Pages without
// counts are manual reference pages with no harness completion; skip them.
// Expected failures are identified by name and status. A repaired failure
// must never provide a budget that hides a different regression.
const expectedFailuresByPage = {
  'ParentNode-replaceChildren.html': new Set([
    'Document.replaceChildren() with an element, replacing an existing doctype and element.',
    'Document.replaceChildren() with a DocumentFragment containing a single element, replacing an existing doctype and element.',
    'Document.replaceChildren() with a doctype, replacing an existing doctype and element.',
  ]),
  'has-with-nesting-parent-containing-hover.html': new Set([
    'CSS Selector Invalidation: :has() with nesting parent containing :hover',
  ]),
}

function pageList() {
  const index = readFileSync(path.join(root, 'test/wpt/index.html'), 'utf8')
  const pages = [...index.matchAll(/href="http:\/\/localhost:\d+([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(match => {
      const counts = match[2].match(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/)
      return counts && { page: match[1], expectedPass: Number(counts[1]), expectedTotal: Number(counts[2]) }
    })
    .filter(Boolean)
  if (pages.length === 0) throw new Error('No WPT pages found in test/wpt/index.html.')
  return pages
}

const STATUS = { 0: 'PASS', 1: 'FAIL', 2: 'TIMEOUT', 3: 'NOTRUN' }
const port = process.env.NWSAPI_WPT_PORT || '8123'

async function runPage(context, entry) {
  const name = entry.page.split('/').pop()
  const started = Date.now()
  const tab = await context.newPage()
  try {
    await tab.addInitScript(() => {
      // The harness dispatches completion by calling window.completion_callback
      // when it exists. Defining it in the init script races nothing: init
      // scripts run before the bundled harness, and the harness calls it with
      // the raw test objects (name, status) once every test is done.
      window.completion_callback = tests => {
        window.__wptResults = (tests || []).map(test => ({ name: test.name, status: test.status }))
        window.__wptDone = true
      }
    })
    await tab.goto(`http://localhost:${port}${entry.page}`, { waitUntil: 'load' })
    try {
      // Explicit interval polling: rAF-based polling stalls in backgrounded tabs.
      await tab.waitForFunction('window.__wptDone', null, { timeout: 30_000, polling: 100 })
    } catch {
      console.error(`  ${name}: timed out`)
      return { name, error: 'the harness did not finish within 30s' }
    }
    const results = await tab.evaluate('window.__wptResults')
    const reported = results.filter(test => test.status !== 0)
    const expectedNames = expectedFailuresByPage[name]
    for (const failure of reported) {
      failure.expected = failure.status === 1 && !!expectedNames?.has(failure.name)
    }
    const expected = reported.filter(failure => failure.expected).length
    const drift = results.length !== entry.expectedTotal
    // Agents get quiet reporting: no per-page progress chatter.
    if (!isAgent) console.error(`  ${name}: ${((Date.now() - started) / 1000).toFixed(1)}s`)
    return {
      name,
      passed: results.length - reported.length,
      failed: reported.length - expected + (drift ? 1 : 0),
      expected,
      failures: reported,
      error: drift ? `expected ${entry.expectedTotal} tests, got ${results.length}` : undefined,
    }
  } finally {
    await tab.close()
  }
}

async function main() {
  verify()
  if (!ensurePhp()) {
    throw new Error(`PHP is required to serve the WPT pages. ${phpInstallHint()}`)
  }
  const { chromium } = await import('playwright')
  let browser
  try {
    browser = await chromium.launch()
  } catch (error) {
    const missing = error.message.match(/Executable doesn't exist at (.+)/)
    if (!missing || existsSync(missing[1])) throw error
    console.log('Playwright Chromium is missing; installing the pinned browser before running WPT.')
    execFileSync(process.execPath, [fileURLToPath(new URL('../../node_modules/playwright/cli.js', import.meta.url)), 'install', 'chromium'], { stdio: 'inherit' })
    if (!existsSync(missing[1])) throw new Error(`Playwright Chromium was not installed at ${missing[1]}`)
    browser = await chromium.launch()
  }
  const pages = pageList()
  const server = spawn('php', ['-S', `localhost:${port}`, '-t', upstream, path.join(root, 'test/wpt/router.php')], {
    stdio: 'ignore',
    env: { ...process.env, BROWSER_ROOT: upstream },
  })
  process.on('exit', () => server.kill())
  await new Promise(resolve => setTimeout(resolve, 500))

  const context = await browser.newContext()
  const queue = [...pages]
  let serverError = null
  server.on('exit', code => { serverError = `the WPT server exited early (code ${code}; is port ${port} already in use?)` })
  const summaries = await Promise.all(Array.from({ length: Math.min(4, pages.length) }, async () => {
    const collected = []
    let entry
    while ((entry = queue.shift())) {
      if (serverError) collected.push({ name: entry.page.split('/').pop(), error: serverError })
      try {
        collected.push(await runPage(context, entry))
      } catch (error) {
        console.error(`  ${entry.page.split('/').pop()}: ${error.message.split('\n')[0]}`)
        collected.push({ name: entry.page.split('/').pop(), error: error.message.split('\n')[0] })
      }
    }
    return collected
  }))
  await browser.close()
  server.kill()
  const byOrder = new Map(summaries.flat().map(line => [line.name, line]))
  const summary = pages.map(entry => byOrder.get(entry.page.split('/').pop()))

  if (!isAgent) console.log('\nWPT results:')
  let totalFailed = 0
  let expectedFailures = 0
  for (const line of summary) {
    // Server errors and count drift count as page failures; a page with only
    // tolerated (expected) failing subtests stays green.
    totalFailed += line.error ? 1 : (line.failed || 0)
    if (!line.error) {
      expectedFailures += line.expected || 0
    }
    if (isAgent && !line.failed && !line.error) continue
    const label = line.error ? `ERROR (${line.error})` : `${line.passed} passed, ${line.failed} failed`
    console.log(`  ${line.failed || line.error ? '✗' : '✓'} ${line.name}: ${label}`)
    for (const failure of line.failures || []) {
      console.log(`      ${failure.expected ? 'expected' : 'reported'} ${STATUS[failure.status]}: ${failure.name}`)
    }
  }
  console.log(`${isAgent ? 'WPT: ' : '\n'}${summary.length} pages, ${totalFailed} unexpected failures` +
    `${isAgent && expectedFailures ? ` (${expectedFailures} expected failures)` : ''}.`)
  if (totalFailed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
