'use strict';

// Test the published file layout and npm override, not a patched module cache.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const directory = mkdtempSync(resolve(tmpdir(), 'nwsapi-jsdom-adapter-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  execFileSync(npm, ['pack', '--ignore-scripts', '--pack-destination', directory], {
    cwd: resolve(__dirname, '..'), stdio: 'inherit'
  });
  const tarball = readdirSync(directory).find(name => name.endsWith('.tgz'));
  writeFileSync(resolve(directory, 'package.json'), JSON.stringify({
    name: 'nwsapi-jsdom-adapter-test',
    private: true,
    dependencies: { jsdom: '30.0.1' },
    overrides: { '@asamuzakjp/dom-selector': 'file:' + resolve(directory, tarball) }
  }, null, 2));
  execFileSync(npm, ['install', '--ignore-scripts', '--package-lock=false'], {
    cwd: directory, stdio: 'inherit'
  });
  execFileSync(process.execPath, ['--test', resolve(__dirname, 'jsdom-adapter.test.cjs')], {
    stdio: 'inherit',
    env: { ...process.env, JSDOM_PACKAGE: resolve(directory, 'node_modules/jsdom/package.json') }
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
