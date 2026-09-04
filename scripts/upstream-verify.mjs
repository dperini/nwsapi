/*
 * Check each upstream patch on its own: the defect it targets is fixed, and
 * the behaviors the other patches are about are left as upstream has them.
 *
 * A patch is proposed to a project that will run its own suite against it, so
 * each one has to stand alone rather than lean on the rest of this branch.
 *
 *   node scripts/upstream-verify.mjs <upstream-checkout>
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/upstream-verify.mjs <upstream-checkout>');
  process.exit(1);
}

function load(file) {
  const dom = new JSDOM(
    '<!doctype html><body>' +
      '<a id=a href="#">a</a><abbr id=b href="#">abbr</abbr>' +
      '<div id=d class=x><p id=p class="a">t</p><p id=q class="b"></p></div>' +
      '<input id=i placeholder=p>' +
      '</body>',
  );
  const { window } = dom;
  delete require.cache[require.resolve(file)];
  const NW = require(file)({
    document: window.document,
    DOMException: window.DOMException,
  });
  return { window, document: window.document, NW };
}

// Each probe returns a comparable string, or 'THREW'.
const PROBES = {
  reentry({ window, document, NW }) {
    let calls = 0;
    window.Element.prototype.matches = function (selector) {
      ++calls;
      return NW.match(selector, this);
    };
    NW.match(':modal', document.getElementById('d'));
    // the count is a stack depth, which varies between runs; only whether
    // the engine went back out through the host is stable
    return calls === 0 ? 'reentrant=none' : 'reentrant=many';
  },
  forgiving({ document, NW }) {
    try {
      return `ids=${NW.select('div:not(:is(svg|div))', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
  eof({ document, NW }) {
    try {
      return `ids=${NW.select('p:not([class="zz"]', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
  nested({ document, NW }) {
    try {
      return `ids=${NW.select('p:not(:is(.b))', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
  attrAfterPseudo({ document, NW }) {
    try {
      return `match=${NW.match("[class*='a' i]:not(:empty) + [class*='b']", document.getElementById('q'))}`;
    } catch {
      return 'THREW';
    }
  },
  link({ document, NW }) {
    try {
      return `ids=${NW.select(':link', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
  placeholder({ document, NW }) {
    try {
      return `ids=${NW.select(':placeholder-shown', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
  // A selector every patch must leave working, as a smoke test.
  ordinary({ document, NW }) {
    try {
      return `ids=${NW.select('div.x > p', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
};

// What each patch is expected to change, relative to upstream master.
const EXPECTED = {
  'jsdom-reentry': { reentry: 'reentrant=none' },
  'forgiving-and-eof': {
    forgiving: 'ids=d',
    eof: 'ids=p,q',
    nested: 'ids=p',
  },
  'attribute-after-pseudo': { attrAfterPseudo: 'match=true' },
  'link-precedence': { link: 'ids=a', placeholder: 'ids=i' },
};

const baseline = {};
for (const [name, probe] of Object.entries(PROBES)) {
  baseline[name] = probe(load(path.join(target, 'src', 'nwsapi.js')));
}

console.log('upstream master:');
for (const [name, value] of Object.entries(baseline)) {
  console.log(`  ${name.padEnd(18)} ${value}`);
}

let failures = 0;
for (const [patch, expected] of Object.entries(EXPECTED)) {
  const file = path.join(target, '.patches', `${patch}.js`);
  const results = {};
  for (const [name, probe] of Object.entries(PROBES)) {
    results[name] = probe(load(file));
  }

  console.log(`\n${patch}:`);
  for (const [name, value] of Object.entries(results)) {
    const want = expected[name];
    if (want !== undefined) {
      const ok = value === want;
      if (!ok) { ++failures; }
      console.log(`  ${ok ? 'FIXED  ' : 'FAILED '} ${name.padEnd(18)} ${baseline[name]} -> ${value}` +
        (ok ? '' : `   expected ${want}`));
    } else if (value !== baseline[name]) {
      // a change the patch did not claim: report it, since a minimal patch
      // should not move anything it does not mention
      ++failures;
      console.log(`  UNCLAIMED ${name.padEnd(16)} ${baseline[name]} -> ${value}`);
    }
  }
}

console.log(failures ? `\n${failures} problem(s)` : '\nevery patch fixes what it claims and nothing else');
process.exit(failures ? 1 : 0);
