import { execFileSync, spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, test } from 'vitest'
import { toolVersions } from '../../../../scripts/repo/external-tools.mts'
import {
  posixPin,
  posixShim,
  quotePosix,
  quoteWindows,
  stub,
  windowsPin,
  windowsShim,
  writeFirewallShim,
} from '../../../../scripts/repo/setup/firewall.mts'

const directories: string[] = []
function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "nwsapi-firewall '$-"))
  directories.push(directory)
  const bin = path.join(directory, 'bin')
  mkdirSync(bin)
  const firewall = path.join(directory, 'sfw')
  const manager = path.join(directory, 'manager')
  const marker = path.join(directory, 'calls')
  writeFileSync(
    firewall,
    '#!/bin/bash\nprintf "firewall\\n" >> "$MARKER"\nexec "$@"\n',
    {
      mode: 0o755,
    },
  )
  writeFileSync(
    manager,
    `#!/bin/bash
if [ "$1" = --version ]; then
  [ "$pnpm_config_pm_on_fail" = ignore ] || exit 125
  echo "\${FAKE_VERSION:-${toolVersions()['pnpm']}}"
  exit 0
fi
printf '%s\\n' "$@"
exit "\${MANAGER_EXIT:-0}"
`,
    { mode: 0o755 },
  )
  const env = {
    ...process.env,
    MARKER: marker,
    PATH: bin + path.delimiter + process.env['PATH'],
    SOCKET_SHIM_ACTIVE_PNPM: '',
    SOCKET_SHIM_ACTIVE_NPM: '',
  }
  return { directory, bin, firewall, manager, marker, env }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

test.skipIf(process.platform !== 'win32')(
  'Windows wrappers preserve arguments, exit status, recursion, and version guards',
  () => {
    const f = fixture()
    const firewall = path.join(f.directory, 'sfw.exe')
    copyFileSync(process.execPath, firewall)
    const preload = path.join(f.directory, 'preload.mjs')
    writeFileSync(
      preload,
      `
import { appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
if (process.execPath.endsWith('sfw.exe')) {
  appendFileSync(process.env.MARKER, 'firewall\\n')
  const result = spawnSync(process.argv[1], process.argv.slice(2), {
    cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '' },
  })
  process.exit(result.status ?? 1)
}
`,
    )
    const probe = path.join(f.directory, 'probe.mjs')
    writeFileSync(
      probe,
      `
if (process.argv.includes('--version')) {
  console.log(process.env.FAKE_VERSION || '${toolVersions()['pnpm']}')
} else {
  console.log(JSON.stringify(process.argv.slice(2)))
  process.exit(23)
}
`,
    )
    const env = {
      ...f.env,
      NODE_OPTIONS: '--import=' + pathToFileURL(preload).href,
    }
    const run = (file: string, overrides = {}) =>
      spawnSync('cmd.exe', ['/d', '/s', '/c', `""${file}" "with spaces""`], {
        cwd: f.directory,
        env: { ...env, ...overrides },
        encoding: 'utf8',
        windowsVerbatimArguments: true,
      })
    const shim = path.join(f.bin, 'npm.cmd')
    writeFileSync(
      shim,
      windowsShim('npm', firewall, {
        executable: process.execPath,
        args: [probe],
      }).join('\r\n'),
    )
    for (const recursion of ['', '1']) {
      const result = run(shim, { SOCKET_SHIM_ACTIVE_NPM: recursion })
      expect(result.status).toBe(23)
      expect(JSON.parse(result.stdout)).toEqual(['with spaces'])
    }
    expect(readFileSync(f.marker, 'utf8')).toBe('firewall\n')
    const guard = path.join(f.directory, 'guard.cmd')
    writeFileSync(
      guard,
      [
        '@echo off',
        ...windowsPin(
          `${quoteWindows(process.execPath)} ${quoteWindows(probe)}`,
        ),
        'exit /b 0',
      ].join('\r\n'),
    )
    expect(run(guard).status).toBe(0)
    expect(run(guard, { FAKE_VERSION: '0.0.1' }).status).toBe(126)
  },
)

test.skipIf(process.platform === 'win32')(
  'shims preserve arguments, exit status, and per-manager recursion',
  () => {
    const f = fixture()
    const shim = writeFirewallShim(
      'pnpm',
      f.firewall,
      { executable: f.manager },
      f.bin,
    )
    const args = ['install', 'with spaces', "literal;$value'", '']
    for (const recursion of ['', '1']) {
      const result = spawnSync(shim, args, {
        cwd: f.directory,
        env: {
          ...f.env,
          SOCKET_SHIM_ACTIVE_PNPM: recursion,
          MANAGER_EXIT: '23',
        },
        encoding: 'utf8',
      })
      expect(result.status).toBe(23)
      expect(result.stdout).toBe(args.join('\n') + '\n')
    }
    expect(readFileSync(f.marker, 'utf8').trim().split('\n')).toEqual([
      'firewall',
    ])
  },
)

test.skipIf(process.platform === 'win32')(
  'nested managers keep other firewall wrappers on PATH',
  () => {
    const f = fixture()
    writeFirewallShim('npm', f.firewall, { executable: f.manager }, f.bin)
    const nested = path.join(f.directory, 'nested')
    writeFileSync(
      nested,
      `#!/bin/bash
if [ "$1" = --version ]; then echo '${toolVersions()['pnpm']}'; exit 0; fi
if [ "$1" = inner ]; then exec npm "argument with spaces"; fi
exec pnpm inner
`,
      { mode: 0o755 },
    )
    const shim = writeFirewallShim(
      'pnpm',
      f.firewall,
      { executable: nested },
      f.bin,
    )
    expect(
      execFileSync(shim, [], {
        cwd: f.directory,
        env: f.env,
        encoding: 'utf8',
      }),
    ).toBe('argument with spaces\n')
    expect(readFileSync(f.marker, 'utf8').trim().split('\n')).toEqual([
      'firewall',
      'firewall',
    ])
  },
)

test.skipIf(process.platform === 'win32')(
  'pin guards reject drift even during recursion',
  () => {
    const f = fixture()
    const guard = path.join(f.directory, 'guard')
    writeFileSync(
      guard,
      ['#!/bin/bash', ...posixPin(quotePosix(f.manager))].join('\n'),
      {
        mode: 0o755,
      },
    )
    const shim = writeFirewallShim(
      'pnpm',
      f.firewall,
      { executable: f.manager },
      f.bin,
    )
    for (const recursion of ['', '1']) {
      const env = {
        ...f.env,
        FAKE_VERSION: '0.0.1',
        SOCKET_SHIM_ACTIVE_PNPM: recursion,
      }
      for (const command of [guard, shim]) {
        expect(spawnSync(command, [], { cwd: f.directory, env }).status).toBe(
          126,
        )
      }
    }
    expect(existsSync(f.marker)).toBe(false)
  },
)

test('unavailable setup writes actionable stubs', () => {
  const f = fixture()
  const shim = writeFirewallShim('npm', undefined, undefined, f.bin)
  const windows = process.platform === 'win32'
  const run = (command: string) =>
    spawnSync(
      windows ? 'cmd.exe' : command,
      windows ? ['/d', '/c', command] : [],
      {
        cwd: f.directory,
        encoding: 'utf8',
      },
    )
  expect(run(shim).status).toBe(127)
  expect(run(shim).stderr).toContain('node scripts/repo/setup/tools.mts')
  const direct = path.join(f.directory, windows ? 'stub.cmd' : 'stub')
  writeFileSync(direct, stub('pnpm', windows).join(windows ? '\r\n' : '\n'), {
    mode: 0o755,
  })
  expect(run(direct).status).toBe(127)
})

test.skipIf(process.platform === 'win32')(
  'replacing a legacy symlink preserves the verified binary',
  () => {
    const f = fixture()
    const before = readFileSync(f.manager)
    symlinkSync(f.manager, path.join(f.bin, 'pnpm'))
    writeFirewallShim('pnpm', f.firewall, { executable: f.manager }, f.bin)
    expect(readFileSync(f.manager)).toEqual(before)
    writeFirewallShim('pnpm', undefined, undefined, f.bin)
    expect(readFileSync(f.manager)).toEqual(before)
  },
)

test.skipIf(process.platform === 'win32')(
  'npm forwards its pinned Node CLI and respects explicit CA settings',
  () => {
    const f = fixture()
    const probe = path.join(f.directory, 'probe.mjs')
    writeFileSync(
      probe,
      'console.log(JSON.stringify({ args: process.argv.slice(2), cert: process.env.SFW_CA_CERT_PATH, key: process.env.SFW_CA_KEY_PATH }))',
    )
    const shim = path.join(f.bin, 'npm')
    writeFileSync(
      shim,
      posixShim('npm', f.firewall, {
        executable: process.execPath,
        args: [probe],
      }).join('\n'),
      { mode: 0o755 },
    )
    const ca = path.join(f.directory, '.socket', 'sfw')
    mkdirSync(ca, { recursive: true })
    for (const name of ['ca.crt', 'ca.key']) {
      writeFileSync(path.join(ca, name), '')
    }
    for (const explicit of [false, true]) {
      const cert = explicit ? '/explicit/cert' : path.join(ca, 'ca.crt')
      const key = explicit ? '/explicit/key' : path.join(ca, 'ca.key')
      const output = execFileSync(shim, ['a b'], {
        cwd: f.directory,
        encoding: 'utf8',
        env: {
          ...f.env,
          HOME: f.directory,
          SFW_CA_CERT_PATH: explicit ? cert : '',
          SFW_CA_KEY_PATH: explicit ? key : '',
        },
      })
      expect(JSON.parse(output)).toEqual({ args: ['a b'], cert, key })
    }
    rmSync(f.firewall)
    expect(spawnSync(shim, [], { cwd: f.directory, env: f.env }).status).toBe(
      127,
    )
  },
)

test.skipIf(process.platform === 'win32')(
  'noninteractive cancellation terminates firewall children',
  async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-sfw-process-'))
    const marker = path.join(directory, 'pid')
    const firewall = path.join(directory, 'sfw')
    const bin = path.join(directory, 'bin')
    mkdirSync(bin)
    writeFileSync(
      firewall,
      `#!/bin/bash
sleep 60 &
echo $! > ${quotePosix(marker)}
wait
`,
      { mode: 0o755 },
    )
    const shim = writeFirewallShim(
      'npm',
      firewall,
      { executable: process.execPath },
      bin,
    )
    const child = spawn(shim, [], {
      cwd: directory,
      env: { ...process.env, SOCKET_SHIM_ACTIVE_NPM: '' },
      stdio: 'ignore',
    })
    const closed = new Promise(resolve => child.once('close', resolve))
    let descendant = 0
    try {
      await expect.poll(() => existsSync(marker)).toBe(true)
      descendant = Number(readFileSync(marker, 'utf8').trim())
      child.kill('SIGTERM')
      await closed
      await expect
        .poll(() => {
          try {
            const state = execFileSync(
              'ps',
              ['-o', 'stat=', '-p', String(descendant)],
              { cwd: directory, encoding: 'utf8' },
            ).trim()
            return !state || state.startsWith('Z')
          } catch {
            return true
          }
        })
        .toBe(true)
    } finally {
      child.kill('SIGKILL')
      if (descendant) {
        try {
          process.kill(descendant, 'SIGKILL')
        } catch {
          /* Already reaped. */
        }
      }
      rmSync(directory, { recursive: true, force: true })
    }
  },
)

test.skipIf(process.platform === 'win32')(
  'interactive wrappers preserve the foreground terminal group',
  () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), 'nwsapi-sfw-terminal-'),
    )
    try {
      const firewall = path.join(directory, 'sfw')
      writeFileSync(firewall, '#!/bin/bash\nexec "$@"\n', { mode: 0o755 })
      const shim = writeFirewallShim(
        'npm',
        firewall,
        { executable: '/usr/bin/python3' },
        directory,
      )
      const probe = `import errno, os, pty, sys
pid, terminal = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], [sys.argv[1], '-c', 'import json, os; print(json.dumps({"terminal": os.tcgetpgrp(0), "process": os.getpgrp()}))'])
try:
    while True:
        try:
            chunk = os.read(terminal, 4096)
        except OSError as error:
            if error.errno == errno.EIO:
                break
            raise
        if not chunk:
            break
        os.write(1, chunk)
finally:
    os.close(terminal)
child, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
`
      const output = execFileSync('/usr/bin/python3', ['-c', probe, shim], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, SOCKET_SHIM_ACTIVE_NPM: '' },
      })
      const result = JSON.parse(output)
      expect(result.terminal).toBeGreaterThan(0)
      expect(result.process).toBe(result.terminal)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
