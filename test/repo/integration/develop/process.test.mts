import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'

const runner = new URL(
  '../../../../scripts/repo/develop/process.mts',
  import.meta.url,
).href

function program(source: string) {
  return `
    import { runProcess } from ${JSON.stringify(runner)};
    const result = await runProcess({
      command: process.execPath,
      args: ['-e', ${JSON.stringify(source)}],
      env: process.env,
      cwd: process.cwd(),
    }, { json: true, interactive: false });
    console.log(JSON.stringify(result));
  `
}

test('child logs stay on stderr and closed stdin cannot wait for input', () => {
  const source = `
    console.log('child stdout');
    console.error('child stderr');
    process.stdin.resume();
    process.stdin.on('end', () => { process.exitCode = 7; });
  `
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', program(source)],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 5000,
    },
  )
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ code: 7, signal: null })
  expect(result.stderr).toContain('child stdout')
  expect(result.stderr).toContain('child stderr')
})

test.skipIf(process.platform === 'win32')(
  'cancellation also stops a grandchild that ignores SIGTERM',
  async () => {
    const grandchildSource = `
      process.on('SIGTERM', () => {});
      process.stderr.write('READY:' + process.pid);
      setTimeout(() => process.stderr.write(String.fromCharCode(10)), 10);
      setInterval(() => {}, 1000);
    `
    const source = `
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
    const parent = spawn(
      process.execPath,
      ['--input-type=module', '-e', program(source)],
      {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '1' },
      },
    )
    let output = ''
    let stderr = ''
    let childPid: number | undefined
    let grandchild: number | undefined
    parent.stdout.on('data', chunk => {
      output += String(chunk)
    })
    parent.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    const closed = once(parent, 'close')
    void closed.catch(() => {})

    const waitForPid = (pattern: RegExp, label: string) =>
      new Promise<number>((resolve, reject) => {
        let settled = false
        const finish = (error?: Error, pid?: number) => {
          if (settled) {
            return
          }
          settled = true
          clearTimeout(timer)
          parent.stderr.off('data', inspect)
          parent.off('close', onClose)
          parent.off('error', onError)
          if (error) {
            reject(error)
          } else {
            resolve(pid!)
          }
        }
        const inspect = () => {
          const match = pattern.exec(stderr)
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
          const stderrTail = stderr.slice(-2000)
          finish(
            new Error(
              `${label} did not announce its PID${stderrTail ? `; stderr tail: ${stderrTail}` : ''}`,
            ),
          )
        }, 10_000)
        const onClose = (
          code: number | null,
          signal: NodeJS.Signals | null,
        ) => {
          finish(
            new Error(
              `wrapper exited before ${label} announced its PID (code=${code}, signal=${signal}): ${stderr.slice(-2000)}`,
            ),
          )
        }
        const onError = (error: Error) => finish(error)
        parent.stderr.on('data', inspect)
        parent.once('close', onClose)
        parent.once('error', onError)
        inspect()
      })

    try {
      childPid = await waitForPid(/^PARENT_READY:(\d+)\r?\n/m, 'managed child')
      grandchild = await waitForPid(/^READY:(\d+)\r?\n/m, 'grandchild')
      expect(grandchild).not.toBe(childPid)
      parent.kill('SIGTERM')
      const [code, signal] = await withTimeout(
        closed,
        10_000,
        'process wrapper did not close',
      )
      expect(code).toBe(0)
      expect(signal).toBeNull()
      expect(JSON.parse(output).signal).toBe('SIGTERM')
      await expect
        .poll(() => {
          return !isProcessGone(grandchild!)
        })
        .toBe(false)
    } finally {
      parent.kill('SIGTERM')
      await withTimeout(
        closed,
        6000,
        'process wrapper cleanup timed out',
      ).catch(() => {
        if (childPid) {
          signalPid(-childPid, 'SIGKILL')
        }
        parent.kill('SIGKILL')
      })
      await withTimeout(
        closed,
        1000,
        'process wrapper did not exit after SIGKILL',
      ).catch(() => {})
      if (childPid) {
        signalPid(-childPid, 'SIGKILL')
      }
      if (grandchild) {
        signalPid(grandchild, 'SIGKILL')
      }
    }
  },
  40_000,
)

function isProcessGone(pid: number) {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return true
    }
    throw error
  }
}

function signalPid(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error
    }
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
