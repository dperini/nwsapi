/*
 * Dependency-free static file server for the upstream WPT checkout.
 *
 * Document root: upstream/wpt — WPT pages use root-absolute paths such as
 * "/resources/testharness.js", so the checkout must be served from "/".
 * The repo itself is mounted under "/_repo/" so that "/_repo/src/nwsapi.js"
 * and the legacy "/_repo/test/wpt" pages remain reachable from a browser.
 *
 * The port comes from process.env.PORT (portless assigns one) and falls
 * back to 8000, which is what playwright.config.mjs expects. PORT=0 asks
 * the OS for an ephemeral port. The server binds 127.0.0.1 only.
 */
import { createReadStream, existsSync, realpathSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docRoot = path.join(repoRoot, 'upstream', 'wpt');

if (!existsSync(docRoot)) {
  console.error('upstream/wpt missing — run: pnpm run upstream:clone');
  process.exit(1);
}

// Real (symlink-free) mount points, so containment checks below compare
// like with like even when the repo path itself goes through a symlink.
const realRepoRoot = realpathSync(repoRoot);
const realDocRoot = realpathSync(docRoot);

function resolvePort(raw) {
  // Env *presence* decides: PORT=0 is a valid request for an ephemeral port.
  if (raw === undefined || raw.trim() === '') {
    return 8000;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    console.error(`Invalid PORT ${JSON.stringify(raw)}: expected an integer between 0 and 65535.`);
    process.exit(1);
  }
  return parsed;
}

const port = resolvePort(process.env.PORT);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xht': 'application/xhtml+xml; charset=utf-8',
  '.xhtml': 'application/xhtml+xml; charset=utf-8',
  '.xml': 'text/xml; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    send(res, 400, 'bad request');
    return;
  }

  // Mount /_repo/ -> repository root; everything else -> upstream/wpt.
  let base = docRoot;
  let realBase = realDocRoot;
  if (pathname === '/_repo' || pathname.startsWith('/_repo/')) {
    base = repoRoot;
    realBase = realRepoRoot;
    pathname = pathname.slice('/_repo'.length) || '/';
  }

  // Resolve and refuse anything that escapes the base directory.
  let filePath = path.resolve(base, '.' + path.posix.normalize('/' + pathname));
  if (filePath !== base && !filePath.startsWith(base + path.sep)) {
    send(res, 403, 'forbidden');
    return;
  }

  try {
    // Resolve symlinks and re-check containment: a symlink placed inside a
    // mount must not be able to serve files from outside it. Escapes get the
    // same 404 as missing files so they don't leak path existence.
    filePath = await realpath(filePath);
    if (filePath !== realBase && !filePath.startsWith(realBase + path.sep)) {
      send(res, 404, `not found: ${pathname}`);
      return;
    }
    let info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = await realpath(path.join(filePath, 'index.html'));
      if (!filePath.startsWith(realBase + path.sep)) {
        send(res, 404, `not found: ${pathname}`);
        return;
      }
      info = await stat(filePath);
    }
    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()]
      || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': info.size,
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch {
    send(res, 404, `not found: ${pathname}`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use — another scripts/serve.mjs (or some other server) `
      + 'is likely running.\nStop it, or pick a different port: PORT=<port> node scripts/serve.mjs',
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`WPT static server listening at http://localhost:${server.address().port}/`);
  console.log(`  document root: ${docRoot}`);
  console.log(`  /_repo/       -> ${repoRoot}`);
});
