/*
 * The documents every benchmark measures against. Each one stands for a place
 * selectors come from, so a number can be read as "in this kind of page".
 */

import fs from 'node:fs'
import path from 'node:path'

import { REPO_ROOT as repoRoot } from '../lib/paths.mts'

// A specification page: deep nesting, long sibling runs, hand-written CSS.
export function documentation() {
  return fs.readFileSync(
    path.join(repoRoot, 'test', 'speed', 'example', 'selectors.html'),
    'utf8',
  )
}

// Atomic CSS: one short class per declaration, a dozen stacked per element,
// container classes that are selective. StyleX, Tailwind, CSS modules.
export function atomic() {
  let html =
    '<!doctype html><html><body><div class="app layout"><nav class="sidebar">'
  for (let i = 0; i < 30; ++i) {
    html += `<ul class="menu"><li class="row"><a class="link" href="#">s${i}</a></li></ul>`
  }
  html += '</nav><main class="content">'
  for (let i = 0; i < 400; ++i) {
    html +=
      `<section class="card surface elevated"><ul class="list stack">` +
      `<li class="row item"><a class="link primary" href="#">a${i}</a></li>` +
      `<li class="row"><span class="badge">${i}</span></li></ul></section>`
  }
  return `${html}</main></div></body></html>`
}

// A component tree as testing-library sees it: roles, labels, test ids.
export function components() {
  let html = '<!doctype html><html><body><div id="root" class="app">'
  for (let i = 0; i < 300; ++i) {
    html +=
      `<div class="card flex" data-testid="card-${i}">` +
      `<button type="button" class="btn primary" data-testid="btn-${i}" aria-label="Action ${i}">Go</button>` +
      `<label for="in-${i}">Name</label>` +
      `<input id="in-${i}" class="input" placeholder="n" data-testid="in-${i}">` +
      `<span class="badge">${i}</span><a href="#x" class="link">more</a></div>`
  }
  return `${html}</div></body></html>`
}

// A deterministic mixed workload with sparse states and varied tree shapes.
export function mixed() {
  let html =
    '<!doctype html><html lang="en"><body><div class="outside"><main id="query-root">' +
    '<button class="root-action">Run</button><input class="root-input">'
  for (let i = 0; i < 240; ++i) {
    const state = i % 7 === 0 ? 'selected' : 'idle'
    const active = i % 5 === 0 ? ' active' : ''
    const checked = i % 4 === 0 ? ' checked' : ''
    const disabled = i % 9 === 0 ? ' disabled' : ''
    const required = i % 6 === 0 ? ' required' : ''
    const readOnly = i % 8 === 0 ? ' readonly' : ''
    const label = i % 11 === 0 ? 'Save' : 'cancel'
    const utility = i % 13 === 0 ? ' sm:block' : ''
    const depth = i % 3 === 0 ? 'deep' : 'shallow'
    html +=
      `<section class="card ${depth}" data-state="${state}" data-testid="card-${i}">` +
      `<div class="wrapper"><div class="inner"><div class="${depth}">` +
      `<button class="action${active}${utility}"${disabled} data-testid="btn-${i}" aria-label="${label}">Run</button>` +
      `<input type="text"${disabled}${required}${readOnly} data-testid="text-${i}">` +
      `<input type="checkbox"${checked}${disabled} data-testid="check-${i}">` +
      `<span class="badge${active}" data-label="${label}" lang="en-US">${i}</span>` +
      `<div class="rows"><span class="row${active}" data-row="${i}">A</span>` +
      `<span class="row${i % 5 === 1 ? ' active' : ''}" data-row="${i + 1}">B</span>` +
      `<span class="target">${i}</span></div></div></div></div></section>`
  }
  html += '</main></div></body></html>'
  return html
}

export const DOCUMENTS = {
  documentation: {
    html: documentation,
    note: 'a spec page, the shape hand-written CSS runs against',
  },
  atomic: {
    html: atomic,
    note: 'atomic CSS: many short classes, selective containers',
  },
  components: {
    html: components,
    note: 'a component tree as testing-library queries it',
  },
  mixed: {
    html: mixed,
    note: 'mixed state, match density, and tree shape diagnostic workload',
  },
}
