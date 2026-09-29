import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAgent } from 'std-env'

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
// The known-failing subtests are tolerated as expected failures, and a page
// whose total drifts from its annotation fails the run.
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

function phpInstallHint() {
  switch (process.platform) {
    case 'darwin': return 'Install it with Homebrew: brew install php'
    case 'linux': return 'Install the PHP CLI with your distribution package manager, for example: sudo apt install php-cli'
    case 'win32': return 'Install PHP with winget, then restart the terminal so php is on PATH.'
    default: return 'Install PHP and make the php command available on PATH.'
  }
}

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
    const tolerated = entry.expectedTotal - entry.expectedPass
    const drift = results.length !== entry.expectedTotal
    // Agents get quiet reporting: no per-page progress chatter.
    if (!isAgent) console.error(`  ${name}: ${((Date.now() - started) / 1000).toFixed(1)}s`)
    return {
      name,
      passed: results.length - reported.length + Math.min(reported.length, tolerated),
      failed: Math.max(0, reported.length - tolerated) + (drift ? 1 : 0),
      failures: reported,
      error: drift ? `expected ${entry.expectedTotal} tests, got ${results.length}` : undefined,
    }
  } finally {
    await tab.close()
  }
}

async function main() {
  verify()
  if (spawnSync('php', ['--version']).status !== 0) {
    throw new Error(`PHP is required to serve the WPT pages. ${phpInstallHint()}`)
  }
  const { chromium } = await import('playwright')
  const pages = pageList()
  const server = spawn('php', ['-S', `localhost:${port}`, '-t', upstream, path.join(root, 'test/wpt/router.php')], {
    stdio: 'ignore',
    env: { ...process.env, BROWSER_ROOT: upstream },
  })
  process.on('exit', () => server.kill())
  await new Promise(resolve => setTimeout(resolve, 500))

  const browser = await chromium.launch()
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

  console.log('\nWPT results:')
  let totalFailed = 0
  for (const line of summary) {
    // Server errors and count drift count as page failures; a page with only
    // tolerated (expected) failing subtests stays green.
    totalFailed += line.error ? 1 : (line.failed || 0)
    const label = line.error ? `ERROR (${line.error})` : `${line.passed} passed, ${line.failed} failed`
    console.log(`  ${line.failed || line.error ? '✗' : '✓'} ${line.name}: ${label}`)
    for (const failure of line.failures || []) {
      console.log(`      ${line.error ? 'reported' : 'expected'} ${STATUS[failure.status]}: ${failure.name}`)
    }
  }
  console.log(`\n${summary.length} pages, ${totalFailed} unexpected failures.`)
  if (totalFailed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
