import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { TASKS } from '../../../scripts/develop/actions.mts'
import { taskResult } from '../../../scripts/develop/execute.mts'
import path from 'node:path'
import { REPO_ROOT, TOOL_BIN } from '../../../scripts/lib/external-tools.mjs'

const runner = new URL('../../../scripts/develop/process.mts', import.meta.url)
  .href

function runnerSource(source) {
  return `
    import { runProcess } from ${JSON.stringify(runner)};
    const result = await runProcess({
      command: process.execPath,
      args: ['-e', ${JSON.stringify(source)}],
      env: { ...process.env, PATH: ${JSON.stringify(`${TOOL_BIN}${path.delimiter}`)} + (process.env.PATH ?? '') },
      cwd: ${JSON.stringify(REPO_ROOT)},
    }, { json: true, interactive: false });
    console.log(JSON.stringify(result));
  `
}

function runWrapper(source) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '-e', runnerSource(source)],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PATH: `${TOOL_BIN}${path.delimiter}${process.env.PATH}`,
      },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    },
  )
}

test('JSON mode redirects child output and closes child stdin', () => {
  const child = `
    console.log('child stdout');
    console.error('child stderr');
    process.stdin.resume();
    process.stdin.on('end', () => { process.exitCode = 7; });
  `
  const result = runWrapper(child)

  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { code: 7, signal: null })
  assert.match(result.stderr, /child stdout/)
  assert.match(result.stderr, /child stderr/)
})

test('JSON mode preserves a successful child exit code', () => {
  const result = runWrapper('process.exitCode = 0')

  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { code: 0, signal: null })
})

test(
  'SIGTERM stops the child process group and reaps its descendant',
  {
    skip: process.platform === 'win32',
  },
  async () => {
    const childSource = `
    const { spawn } = require('node:child_process');
    console.error('PARENT_READY:' + process.pid);
    const child = spawn(process.execPath, ['-e',
      "process.on('SIGTERM', () => {}); console.log(process.pid); setInterval(() => {}, 1000)"
    ], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', data => console.error('READY:' + data.toString().trim()));
    setInterval(() => {}, 1000);
  `
    const host = spawn(
      process.execPath,
      ['--input-type=module', '-e', runnerSource(childSource)],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PATH: `${TOOL_BIN}${path.delimiter}${process.env.PATH}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let output = ''
    let errorOutput = ''
    let childPid
    let grandchild
    host.stdout.setEncoding('utf8')
    host.stderr.setEncoding('utf8')
    host.stdout.on('data', chunk => {
      output += chunk
    })
    host.stderr.on('data', chunk => {
      errorOutput += chunk
    })
    const childReady = waitForPid(host, () => errorOutput, /PARENT_READY:(\d+)/)
    const closed = once(host, 'close')

    try {
      childPid = await withTimeout(
        childReady,
        5000,
        'managed child did not start',
      )
      grandchild = await withTimeout(
        waitForPid(host, () => errorOutput, /^READY:(\d+)/m),
        5000,
        'descendant did not start',
      )
      assert.notEqual(grandchild, childPid)
      host.kill('SIGTERM')
      const [code, signal] = await withTimeout(
        closed,
        5000,
        'process wrapper did not close',
      )
      assert.equal(code, 0, errorOutput)
      assert.equal(signal, null)
      assert.deepEqual(JSON.parse(output), { code: null, signal: 'SIGTERM' })
      assert.equal(await waitForPidGone(grandchild, 3000), true)
    } finally {
      host.kill('SIGKILL')
      if (childPid) {
        signalPid(-childPid, 'SIGKILL')
      }
      if (grandchild) {
        signalPid(grandchild, 'SIGKILL')
      }
    }
  },
)

function waitForPid(host, readOutput, pattern) {
  return new Promise((resolve, reject) => {
    const inspect = () => {
      const match = pattern.exec(readOutput())
      if (match) {
        cleanup()
        resolve(Number(match[1]))
      }
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('descendant did not announce its PID'))
    }, 5000)
    const cleanup = () => {
      clearTimeout(timer)
      host.stderr.off('data', inspect)
    }
    host.stderr.on('data', inspect)
    inspect()
  })
}

async function withTimeout(promise, milliseconds, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function waitForPidGone(pid, milliseconds) {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') {
        return true
      }
      throw error
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  return false
}

function signalPid(pid, signal) {
  try {
    process.kill(pid, signal)
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error
    }
  }
}

for (const outcome of [
  { code: 0, signal: null, status: 'completed', exitCode: 0 },
  { code: 7, signal: null, status: 'failed', exitCode: 7 },
  { code: null, signal: null, status: 'failed', exitCode: 1 },
  { code: 0, signal: 'SIGINT', status: 'stopped', exitCode: 130 },
  { code: null, signal: 'SIGTERM', status: 'stopped', exitCode: 143 },
]) {
  test(`task result preserves exit ${outcome.code} and signal ${outcome.signal}`, () => {
    const result = taskResult(TASKS[0], outcome.code, outcome.signal)
    assert.equal(result.status, outcome.status)
    assert.equal(result.exitCode, outcome.exitCode)
    assert.equal(result.signal, outcome.signal)
  })
}
