/*
 * The documents every benchmark measures against. Each one stands for a place
 * selectors come from, so a number can be read as "in this kind of page".
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { repoRoot } from './paths.mjs';

// A specification page: deep nesting, long sibling runs, hand-written CSS.
export function documentation() {
  return readFileSync(path.join(repoRoot, 'test', 'speed', 'example', 'selectors.html'), 'utf8');
}

// Atomic CSS: one short class per declaration, a dozen stacked per element,
// container classes that are selective. StyleX, Tailwind, CSS modules.
export function atomic() {
  let html = '<!doctype html><html><body><div class="app layout"><nav class="sidebar">';
  for (let i = 0; i < 30; ++i) {
    html += `<ul class="menu"><li class="row"><a class="link" href="#">s${i}</a></li></ul>`;
  }
  html += '</nav><main class="content">';
  for (let i = 0; i < 400; ++i) {
    html += `<section class="card surface elevated"><ul class="list stack">` +
      `<li class="row item"><a class="link primary" href="#">a${i}</a></li>` +
      `<li class="row"><span class="badge">${i}</span></li></ul></section>`;
  }
  return `${html}</main></div></body></html>`;
}

// A component tree as testing-library sees it: roles, labels, test ids.
export function components() {
  let html = '<!doctype html><html><body><div id="root" class="app">';
  for (let i = 0; i < 300; ++i) {
    html += `<div class="card flex" data-testid="card-${i}">` +
      `<button type="button" class="btn primary" data-testid="btn-${i}" aria-label="Action ${i}">Go</button>` +
      `<label for="in-${i}">Name</label>` +
      `<input id="in-${i}" class="input" placeholder="n" data-testid="in-${i}">` +
      `<span class="badge">${i}</span><a href="#x" class="link">more</a></div>`;
  }
  return `${html}</div></body></html>`;
}

export const DOCUMENTS = {
  documentation: { html: documentation, note: 'a spec page, the shape hand-written CSS runs against' },
  atomic: { html: atomic, note: 'atomic CSS: many short classes, selective containers' },
  components: { html: components, note: 'a component tree as testing-library queries it' },
};
