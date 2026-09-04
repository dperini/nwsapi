/*
 * How much of the web is old enough to need Config.LEGACY, and where it is.
 *
 * The engine's generated tests assume a DOM that behaves: a tag or class
 * lookup returns elements, and id reflects as a string. Config.LEGACY buys
 * back the handling for a host that breaks either, which in practice means
 * IE 8 and older, whose getElementsByTagName('*') included comment nodes.
 * This prints what that costs and who it serves, from the caniuse usage data
 * in devDependencies, so docs/performance.md can quote a number with a date
 * on it instead of an impression.
 *
 *   node scripts/browser-share.mjs [--regions 12]
 */

import { createRequire } from 'node:module';
import process from 'node:process';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { agents } = require('caniuse-lite/dist/unpacker/agents.js');
const unpackRegion = require('caniuse-lite/dist/unpacker/region.js').default;
const dataVersion = require('caniuse-lite/package.json').version;

const { values } = parseArgs({
  options: { regions: { type: 'string' }, help: { type: 'boolean' } },
});

if (values.help) {
  console.log('Usage: node scripts/browser-share.mjs [--regions <n>]');
  process.exit(0);
}

// IE 8 and older is the quirk LEGACY exists for; IE 9 stopped doing it.
const isLegacy = (browser, version) => browser === 'ie' && Number.parseFloat(version) <= 8;

const rows = [];
let recorded = 0;
let newestRelease = 0;

for (const [browser, agent] of Object.entries(agents)) {
  for (const [version, usage] of Object.entries(agent.usage_global ?? {})) {
    if (!usage) { continue; }
    recorded += usage;
    const released = agent.release_date?.[version] ?? null;
    if (released) { newestRelease = Math.max(newestRelease, released); }
    rows.push({ browser, version, usage, released });
  }
}

const day = timestamp => new Date(timestamp * 1000).toISOString().slice(0, 10);
const share = predicate => rows.filter(predicate).reduce((sum, row) => sum + row.usage, 0);
const releasedBefore = (year, month = 1) => {
  const cutoff = Date.UTC(year, month - 1, 1) / 1000;
  return share(row => row.released !== null && row.released < cutoff);
};

console.log(`caniuse-lite ${dataVersion}, newest browser release in it ${day(newestRelease)}`);
console.log(`shares below are of the ${recorded.toFixed(1)}% of usage it records\n`);

const table = [
  ['IE 8 and older (what LEGACY is for)', share(row => isLegacy(row.browser, row.version))],
  ['IE 9 to 11 (no comment nodes in a collection)', share(row =>
    row.browser === 'ie' && Number.parseFloat(row.version) >= 9)],
  ['all Internet Explorer', share(row => row.browser === 'ie')],
  ['released before 2011', releasedBefore(2011)],
  ['released before 2016', releasedBefore(2016)],
  ['released before September 2017', releasedBefore(2017, 9)],
  ['released before 2020', releasedBefore(2020)],
];

for (const [label, value] of table) {
  console.log(`  ${label.padEnd(46)} ${value.toFixed(4)}%`);
}

// Where it is. A share is of that place's own page views, so a big share of a
// small place is fewer people than a small share of a large one. The
// per-place tables are sampled separately from the global ones and disagree
// with them at these magnitudes, which is worth seeing rather than averaging.
const limit = values.regions ? Number.parseInt(values.regions, 10) : 12;
const places = [];
for (const code of regionCodes()) {
  let data;
  try {
    data = unpackRegion(require(`caniuse-lite/data/regions/${code}.js`));
  } catch {
    continue;
  }
  let legacy = 0;
  let all = 0;
  for (const [version, usage] of Object.entries(data.ie ?? {})) {
    if (!usage) { continue; }
    all += usage;
    if (isLegacy('ie', version)) { legacy += usage; }
  }
  if (legacy > 0 || code.startsWith('alt-')) { places.push({ code, legacy, all }); }
}

const continents = places.filter(place => place.code.startsWith('alt-'));
const countries = places
  .filter(place => !place.code.startsWith('alt-'))
  .sort((a, b) => b.legacy - a.legacy);

console.log(`\nIE 8 and older by continent, share of that continent's page views`);
for (const place of continents.sort((a, b) => b.legacy - a.legacy)) {
  console.log(`  ${place.code.padEnd(8)} ${place.legacy.toFixed(4)}%   all IE ${place.all.toFixed(4)}%`);
}

console.log(`\nthe ${limit} places with the most of it, share of their own page views`);
for (const place of countries.slice(0, limit)) {
  console.log(`  ${place.code.padEnd(6)} ${place.legacy.toFixed(3)}%   all IE ${place.all.toFixed(3)}%`);
}
console.log(`\n${countries.length} of the places in the data record any IE 8 or older at all`);

function regionCodes() {
  // the data ships one file per place, and the package exports no index
  const { readdirSync } = require('node:fs');
  const dir = require.resolve('caniuse-lite/data/regions/US.js').replace(/US\.js$/, '');
  return readdirSync(dir).map(file => file.replace(/\.js$/, ''));
}
