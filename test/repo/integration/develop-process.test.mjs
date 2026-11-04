import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
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
  'SIGTERM stops the child process group and its descendant',
  {
    skip: process.platform === 'win32',
    timeout: 40_000,
  },
  async () => {
    const grandchildSource = `
      process.on('SIGTERM', () => {});
      process.stderr.write('READY:' + process.pid);
      setTimeout(() => process.stderr.write(String.fromCharCode(10)), 10);
      setInterval(() => {}, 1000);
    `
    const childSource = `
    const { spawn } = require('node:child_process');
    process.stderr.write('PARENT_READY:' + process.pid);
    setTimeout(() => {
      process.stderr.write(String.fromCharCode(10));
      spawn(process.execPath, ['-e', ${JSON.stringify(grandchildSource)}], {
        stdio: ['ignore', 'ignore', 'inherit'],
      });
    }, 10);
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
          FORCE_COLOR: '1',
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
    const childReady = waitForPid(
      host,
      () => errorOutput,
      /^PARENT_READY:(\d+)\r?\n/m,
      'managed child',
    )
    const closed = once(host, 'close')
    void closed.catch(() => {})

    try {
      childPid = await childReady
      grandchild = await waitForPid(
        host,
        () => errorOutput,
        /^READY:(\d+)\r?\n/m,
        'grandchild',
      )
      assert.notEqual(grandchild, childPid)
      host.kill('SIGTERM')
      const [code, signal] = await withTimeout(
        closed,
        10_000,
        'process wrapper did not close',
      )
      assert.equal(code, 0, errorOutput)
      assert.equal(signal, null)
      assert.deepEqual(JSON.parse(output), { code: null, signal: 'SIGTERM' })
      assert.equal(await waitForPidGone(grandchild, 3000), true)
    } finally {
      host.kill('SIGTERM')
      await withTimeout(closed, 6_000, 'process wrapper cleanup timed out').catch(() => {
        if (childPid) {
          signalPid(-childPid, 'SIGKILL')
        }
        host.kill('SIGKILL')
      })
      await withTimeout(closed, 1_000, 'process wrapper did not exit after SIGKILL').catch(
        () => {},
      )
      if (childPid) {
        signalPid(-childPid, 'SIGKILL')
      }
      if (grandchild) {
        signalPid(grandchild, 'SIGKILL')
      }
    }
  },
)

function waitForPid(host, readOutput, pattern, label = 'managed child') {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, pid) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      host.stderr.off('data', inspect)
      host.off('close', onClose)
      host.off('error', onError)
      if (error) {
        reject(error)
      } else {
        resolve(pid)
      }
    }
    const inspect = () => {
      const match = pattern.exec(readOutput())
      if (match) {
        const pid = Number(match[1])
        if (!Number.isSafeInteger(pid) || pid <= 1) {
          finish(new Error(`${label} announced an invalid PID`))
          return
        }
        finish(undefined, pid)
      }
    }
    const timer = setTimeout(() => {
      const stderrTail = readOutput().slice(-2000)
      finish(
        new Error(
          `${label} did not announce its PID${stderrTail ? `; stderr tail: ${stderrTail}` : ''}`,
        ),
      )
    }, 10_000)
    const onClose = (code, signal) => {
      finish(
        new Error(
          `wrapper exited before ${label} announced its PID (code=${code}, signal=${signal}): ${readOutput().slice(-2000)}`,
        ),
      )
    }
    const onError = error => finish(error)
    host.stderr.on('data', inspect)
    host.once('close', onClose)
    host.once('error', onError)
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
      if (process.platform === 'linux') {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
        const state = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]
        if (state === 'Z' || state === 'X') {
          return true
        }
      }
    } catch (error) {
      if (error.code === 'ESRCH') {
        return true
      }
      if (error.code === 'ENOENT' && process.platform === 'linux') {
        try {
          process.kill(pid, 0)
          return false
        } catch (retryError) {
          if (retryError.code === 'ESRCH') {
            return true
          }
          throw retryError
        }
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
