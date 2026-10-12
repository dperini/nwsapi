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
    const source = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e',
      "process.on('SIGTERM', () => {}); console.log(process.pid); setInterval(() => {}, 1000)"
    ], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', data => console.error('READY:' + data.toString().trim()));
    setInterval(() => {}, 1000);
  `
    const parent = spawn(
      process.execPath,
      ['--input-type=module', '-e', program(source)],
      {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let output = ''
    let grandchild: number | undefined
    parent.stdout.on('data', chunk => {
      output += chunk
    })
    const closed = once(parent, 'close')
    const timer = setTimeout(() => parent.kill('SIGTERM'), 4000)
    try {
      for await (const chunk of parent.stderr) {
        const match = /READY:(\d+)/.exec(String(chunk))
        if (match) {
          grandchild = Number(match[1])
          parent.kill('SIGTERM')
        }
      }
      await closed
      expect(grandchild).toBeDefined()
      expect(JSON.parse(output).signal).toBe('SIGTERM')
      await expect
        .poll(() => {
          try {
            process.kill(grandchild!, 0)
            return true
          } catch {
            return false
          }
        })
        .toBe(false)
    } finally {
      clearTimeout(timer)
      parent.kill('SIGKILL')
      if (grandchild) {
        try {
          process.kill(grandchild, 'SIGKILL')
        } catch {
          // The expected outcome is that cancellation already removed the child.
        }
      }
    }
  },
)
