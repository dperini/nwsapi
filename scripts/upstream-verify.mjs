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

// The form probes need controls, a disabled fieldset and a fieldset holding
// no validation candidate at all, which would change what the older probes
// see, so they get their own document.
const BASE_MARKUP = '<!doctype html><body>' +
  '<a id=a href="#">a</a><abbr id=b href="#">abbr</abbr>' +
  '<div id=d class=x><p id=p class="a">t</p><p id=q class="b"></p></div>' +
  '<input id=i placeholder=p>' +
  '</body>';

const FORM_MARKUP = '<!doctype html><body>' +
  '<input id=i1 disabled><input id=i2><input id=i3 required>' +
  '<fieldset id=fs disabled>' +
    '<legend id=lg><input id=li1></legend><input id=fi1>' +
    '<fieldset id=fsin><input id=fi3></fieldset>' +
  '</fieldset>' +
  '<fieldset id=fsempty></fieldset>' +
  '<fieldset id=fsok><input id=fi2></fieldset>' +
  '<button id=b1>go</button>' +
  '<select id=se><optgroup id=og disabled><option id=op1>a</option></optgroup></select>' +
  '<my-thing id=mt></my-thing>' +
  '</body>';

function load(file, markup) {
  const dom = new JSDOM(markup || BASE_MARKUP);
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
    const element = document.getElementById('d');
    // Ten queries against a host whose matcher routes back into the engine.
    // Unpatched, one query alone recurses until the stack is exhausted. What
    // is wanted is not that the host is never asked, since in a browser it is
    // the only thing that knows the state, but that asking cannot recurse and
    // that a host which delegates is not asked again.
    for (let i = 0; i < 10; i += 1) {
      NW.match(':modal', element);
    }
    if (calls === 0) {
      return 'reentrant=none';
    }
    // the depth of a recursive run varies between runs, so only the shape is
    // compared: asked once and then left alone, or asked without end
    return calls <= 1 ? 'reentrant=bounded' : 'reentrant=many';
  },
  autofill({ document, NW }) {
    // The group these belong to compiles to no test at all, and a resolver
    // with no test accepts every element it is handed.
    try {
      const all = NW.select(':autofill', document).length;
      const inputs = NW.select('input:autofill', document).length;
      return `autofill=${all} inputAutofill=${inputs}`;
    } catch {
      return 'THREW';
    }
  },
  uninstallRestore({ window, NW }) {
    // install() saves the element methods and puts its own in their place;
    // uninstall() has to give back the one it saved for each. It reaches for
    // Element and friends as bare globals, which node does not have, so the
    // document's own are lent for the duration.
    const NAMES = ['Element', 'HTMLElement', 'Document', 'DocumentFragment'];
    const saved = NAMES.map(name => [name, globalThis[name]]);
    try {
      for (const name of NAMES) {
        globalThis[name] = window[name];
      }
      NW.install();
      NW.uninstall();
      const list = window.document.getElementById('d').querySelectorAll('p');
      return `qsaLength=${list && list.length}`;
    } catch (error) {
      return `THREW ${error && error.name}`;
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) {
          delete globalThis[name];
        } else {
          globalThis[name] = value;
        }
      }
    }
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

// The same idea for the form-state pseudo-classes, on their own document.
const FORM_PROBES = {
  // nothing may match ':enabled' and ':disabled' both
  enabledAndDisabled({ document, NW }) {
    try {
      const enabled = NW.select(':enabled', document);
      const disabled = NW.select(':disabled', document);
      return `ids=${enabled.filter(e => disabled.includes(e)).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
  optionalButton({ document, NW }) {
    try {
      return `ids=${NW.select('button:optional', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
  // a fieldset with no validation candidate under it, and one inside a
  // disabled fieldset, where every control is barred from validation
  validFieldsets({ document, NW }) {
    try {
      return `ids=${NW.select('fieldset:valid', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
  definedBuiltIns({ document, NW }) {
    try {
      return `ids=${NW.select(':defined', document).map(e => e.id).filter(Boolean).join()}`;
    } catch {
      return 'THREW';
    }
  },
  readWriteInFieldset({ document, NW }) {
    try {
      return `ids=${NW.select('fieldset :read-write', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
  formsOrdinary({ document, NW }) {
    try {
      return `ids=${NW.select('input[required], fieldset > input', document).map(e => e.id).join()}`;
    } catch {
      return 'THREW';
    }
  },
};

// What each patch is expected to change, relative to upstream master.
const EXPECTED = {
  'jsdom-reentry': { reentry: 'reentrant=bounded' },
  'autofill-nop': { autofill: 'autofill=0 inputAutofill=0' },
  'uninstall-restore': { uninstallRestore: 'qsaLength=2' },
  'forgiving-and-eof': {
    forgiving: 'ids=d',
    eof: 'ids=p,q',
    nested: 'ids=p',
  },
  'attribute-after-pseudo': { attrAfterPseudo: 'match=true' },
  'link-precedence': { link: 'ids=a', placeholder: 'ids=i' },
};

const FORM_EXPECTED = {
  'disabled-complement': {
    enabledAndDisabled: 'ids=',
    readWriteInFieldset: 'ids=li1,fi2',
  },
  'optional-anchors': { optionalButton: 'ids=b1' },
  'valid-fieldset': { validFieldsets: 'ids=fs,fsin,fsempty,fsok' },
  'defined-built-ins': {
    definedBuiltIns: 'ids=i1,i2,i3,fs,lg,li1,fi1,fsin,fi3,fsempty,fsok,fi2,b1,se,og,op1',
  },
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

  console.log('');

  console.log(`${patch}:`);
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

// the form-state patches, against the document built for them
const formBaseline = {};
for (const [name, probe] of Object.entries(FORM_PROBES)) {
  formBaseline[name] = probe(load(path.join(target, 'src', 'nwsapi.js'), FORM_MARKUP));
}

console.log('');
console.log('upstream master, form document:');
for (const [name, value] of Object.entries(formBaseline)) {
  console.log(`  ${name.padEnd(20)} ${value}`);
}

for (const [patch, expected] of Object.entries(FORM_EXPECTED)) {
  const file = path.join(target, '.patches', `${patch}.js`);
  console.log('');
  console.log(`${patch}:`);
  for (const [name, probe] of Object.entries(FORM_PROBES)) {
    const value = probe(load(file, FORM_MARKUP));
    const want = expected[name];
    if (want !== undefined) {
      const ok = value === want;
      if (!ok) { ++failures; }
      console.log(`  ${ok ? 'FIXED  ' : 'FAILED '} ${name.padEnd(20)} ${formBaseline[name]} -> ${value}` +
        (ok ? '' : `   expected ${want}`));
    } else if (value !== formBaseline[name]) {
      ++failures;
      console.log(`  UNCLAIMED ${name.padEnd(18)} ${formBaseline[name]} -> ${value}`);
    }
  }
}

console.log('');
console.log(failures ? `${failures} problem(s)` : 'every patch fixes what it claims and nothing else');
process.exit(failures ? 1 : 0);
