/*
 * A document with engines attached to it.
 *
 * Every benchmark needs the same three things: a jsdom document, this tree's
 * engine bound to it, and optionally a second build to compare against. The
 * engine is stateful per document, so each world builds its own.
 */

import { createRequire } from 'node:module';
import path from 'node:path';

import { JSDOM } from 'jsdom';

import { enginePath, repoRoot } from './paths.mjs';

const require = createRequire(import.meta.url);

export function loadEngine(file, options) {
  // a fresh module instance per document, the way jsdom loads it
  const resolved = path.isAbsolute(file) ? file : path.resolve(repoRoot, file);
  delete require.cache[require.resolve(resolved)];
  return require(resolved)(options);
}

export function world(html, { baseline } = {}) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const options = { document, DOMException: dom.window.DOMException };
  // the smallest change a document can have: one element in, one element out,
  // which leaves it as it was and invalidates what was cached about it
  const probe = document.createElement('b');

  return {
    dom,
    window: dom.window,
    document,
    elements: document.getElementsByTagName('*').length,
    engines: {
      nwsapi: loadEngine(enginePath, options),
      baseline: baseline ? loadEngine(baseline, options) : null,
    },
    touch() {
      document.body.append(probe);
      probe.remove();
    },
    all(tag = '*') {
      return Array.prototype.slice.call(document.getElementsByTagName(tag));
    },
  };
}
