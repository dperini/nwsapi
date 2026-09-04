/*
 * Who the legacy handling is for, and how many of them there are.
 *
 * Config.LEGACY exists because some hosts do not behave the way the DOM says.
 * The clearest example is IE 8 and older, whose getElementsByTagName('*')
 * handed back comment nodes. How old that is, and how many people are still
 * on it, belongs in a script rather than in prose, because the answer moves.
 * Everything here is computed from the caniuse usage data in devDependencies,
 * apart from the population figures, which are listed below with their source.
 *
 * Where the data comes from
 * --------------------------
 * caniuse-lite, a devDependency pinned in the pnpm catalog: usage shares per
 *   browser version (usage_global), release dates (release_date), per-place
 *   shares (data/regions) and support tables for the features it tracks
 *   (data/features). Everything computed below reads one of those four.
 * MDN compatibility tables, for the two features caniuse does not track,
 *   getAttributeNames() and isConnected. Their first versions are written into
 *   NEEDS with the date they shipped, and nothing else about them is asserted.
 * ITU Facts and Figures for the number of people online worldwide, and
 *   national regulator or CNNIC-style figures of the same vintage per place.
 *   POPULATION_YEAR says how old those are.
 *
 * Keeping it current
 * ------------------
 * The usage data ages, so this warns when it is stale, and --check turns the
 * warning into a non-zero exit for CI. To refresh it:
 *
 *   1. npm view caniuse-lite version           # what is published
 *   2. put that version in the catalog in pnpm-workspace.yaml
 *   3. pnpm install
 *   4. pnpm run browsers:share -- --markdown   # paste the tables into docs
 *
 * Usage:
 *   node scripts/browser-share.mjs [--places 12] [--markdown] [--check]
 */

import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { agents } = require('caniuse-lite/dist/unpacker/agents.js');
const unpackFeature = require('caniuse-lite/dist/unpacker/feature.js').default;
const unpackRegion = require('caniuse-lite/dist/unpacker/region.js').default;
const dataVersion = require('caniuse-lite/package.json').version;

const { values } = parseArgs({
  args: process.argv.slice(2).filter(arg => arg !== '--'),
  options: {
    places: { type: 'string' },
    markdown: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log('Usage: node scripts/browser-share.mjs [--places <n>] [--markdown] [--check]');
  process.exit(0);
}

const placeLimit = values.places ? Number.parseInt(values.places, 10) : 12;

// What the engine needs from a host, and where each of those arrived. A
// caniuse feature id means the support table is read from the data. The rest
// are not tracked there, so the first supporting version is written down with
// the note it came from, and only the dates and the shares are computed.
const NEEDS = [
  { label: 'getElementsByClassName', caniuse: 'getelementsbyclassname', usedBy: 'the class fetch' },
  { label: 'closest()', caniuse: 'element-closest', usedBy: 'installing over the host' },
  { label: 'matches()', caniuse: 'matchesselector', usedBy: 'handing a state pseudo-class back' },
  {
    label: 'getAttributeNames()',
    // caniuse does not track these two, so the first versions come from the
    // MDN compatibility tables and a browser counts as having it when it
    // shipped after the last of them. That is exact for anything Chromium and
    // close enough for the rest, which all shipped it within the same year.
    versions: { chrome: 61, firefox: 45, safari: 10.1, edge: 18, opera: 48 },
    since: '2017-09-05',
    usedBy: 'namespaced attribute selectors',
  },
  {
    label: 'isConnected',
    versions: { chrome: 51, firefox: 49, safari: 10, edge: 15, opera: 38 },
    since: '2016-09-20',
    usedBy: ':lang()',
  },
];

// The places the data shows, named so a table reads without a lookup.
const NAMES = {
  CN: 'China', IN: 'India', US: 'United States', RU: 'Russia', JP: 'Japan',
  DE: 'Germany', DZ: 'Algeria', UA: 'Ukraine', TW: 'Taiwan', NL: 'Netherlands',
  KH: 'Cambodia', IE: 'Ireland', CV: 'Cape Verde', GF: 'French Guiana',
};

// Internet users, rounded. The world total is ITU Facts and Figures 2024; the
// rest are national regulator and CNNIC-style figures of the same vintage.
// They turn a percentage into people, so read them as an order of magnitude
// rather than as a census.
const POPULATION_YEAR = 2024;

const ONLINE = {
  world: 5_500_000_000,
  CN: 1_090_000_000,
  IN: 900_000_000,
  US: 320_000_000,
  RU: 130_000_000,
  JP: 104_000_000,
  DE: 79_000_000,
  DZ: 33_000_000,
  UA: 30_000_000,
  TW: 21_000_000,
  NL: 17_000_000,
  KH: 14_000_000,
  IE: 4_600_000,
  CV: 400_000,
  GF: 250_000,
};

// ---------------------------------------------------------------------------
// Global usage, and how old each version is
// ---------------------------------------------------------------------------

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

const isLegacyIE = (browser, version) => browser === 'ie' && Number.parseFloat(version) <= 8;
const day = timestamp => new Date(timestamp * 1000).toISOString().slice(0, 10);
const share = predicate => rows.filter(predicate).reduce((sum, row) => sum + row.usage, 0);

function releasedBefore(year, month = 1) {
  const cutoff = Date.UTC(year, month - 1, 1) / 1000;
  return share(row => row.released !== null && row.released < cutoff);
}

function ageOf(browser, version) {
  const released = agents[browser]?.release_date?.[String(version)];
  if (!released) { return null; }
  return { released: day(released), years: (Date.now() / 1000 - released) / (365.25 * 24 * 3600) };
}

function inYears(years) {
  if (years === null || years === undefined) { return 'unknown'; }
  return `${Math.round(years)} years ago`;
}

// Usage on a browser that does not have one of the things the engine needs.
// A caniuse feature is decided by its support flag; the others by version.
function usageLacking(need) {
  let lacking = 0;
  if (need.caniuse) {
    const feature = unpackFeature(require(`caniuse-lite/data/features/${need.caniuse}.js`));
    for (const row of rows) {
      const flag = feature.stats?.[row.browser]?.[row.version];
      if (!flag || !flag.startsWith('y')) { lacking += row.usage; }
    }
    return lacking;
  }
  const since = Date.parse(need.since) / 1000;
  for (const row of rows) {
    const threshold = need.versions[row.browser];
    if (threshold !== undefined) {
      // a browser the table knows: its own version decides
      if (Number.parseFloat(row.version) < threshold) { lacking += row.usage; }
    } else if (row.browser === 'ie') {
      lacking += row.usage;
    } else if (row.released !== null && row.released < since) {
      // one it does not: anything older than the feature cannot have it
      lacking += row.usage;
    }
  }
  return lacking;
}

function firstWith(need) {
  if (!need.caniuse) { return need.versions; }
  const feature = unpackFeature(require(`caniuse-lite/data/features/${need.caniuse}.js`));
  const first = {};
  for (const [browser, versions] of Object.entries(feature.stats ?? {})) {
    for (const [version, flag] of Object.entries(versions)) {
      if (flag.startsWith('y')) { first[browser] = version; break; }
    }
  }
  return first;
}

// ---------------------------------------------------------------------------
// Where it is. A share is of that place's own page views, so a big share of a
// small place is fewer people than a small share of a large one.
// ---------------------------------------------------------------------------

function regionCodes() {
  // the data ships one file per place and exports no index of them
  const dir = require.resolve('caniuse-lite/data/regions/US.js').replace(/US\.js$/, '');
  return readdirSync(dir).map(file => file.replace(/\.js$/, ''));
}

const places = [];
for (const code of regionCodes()) {
  if (code.startsWith('alt-')) { continue; }
  let data;
  try {
    data = unpackRegion(require(`caniuse-lite/data/regions/${code}.js`));
  } catch {
    continue;
  }
  let legacy = 0;
  let all = 0;
  const versions = [];
  for (const [version, usage] of Object.entries(data.ie ?? {})) {
    if (!usage) { continue; }
    all += usage;
    if (isLegacyIE('ie', version)) {
      legacy += usage;
      versions.push(`IE ${version}`);
    }
  }
  if (legacy > 0) {
    const online = ONLINE[code] ?? null;
    places.push({
      code,
      legacy,
      all,
      name: NAMES[code] ?? code,
      versions,
      online,
      people: online === null ? null : Math.round((legacy / 100) * online),
    });
  }
}
places.sort((a, b) => (b.people ?? 0) - (a.people ?? 0) || b.legacy - a.legacy);

const counted = places.filter(place => place.people !== null);
const peopleTotal = counted.reduce((sum, place) => sum + place.people, 0);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

// How old the data itself is. A quarter is about how long it takes for a
// share this small to move, and for a browser release or two to land.
const STALE_DAYS = 120;
const dataAgeDays = Math.round((Date.now() / 1000 - newestRelease) / 86400);
const stale = dataAgeDays > STALE_DAYS;

const ie8 = ageOf('ie', 8);
const ie9 = ageOf('ie', 9);
const globalLegacy = share(row => isLegacyIE(row.browser, row.version));
const modernIE = share(row => row.browser === 'ie' && Number.parseFloat(row.version) >= 9);
const millions = people => `${(people / 1e6).toFixed(people >= 1e6 ? 1 : 3)}M`;

if (values.markdown) {
  console.log(`Measured with \`caniuse-lite\` ${dataVersion}, whose newest browser release is dated`);
  console.log(`${day(newestRelease)}, as a share of the ${recorded.toFixed(1)}% of usage it records. Re-run it`);
  console.log('with `pnpm run browsers:share`.\n');

  console.log('| browsers | share of usage |');
  console.log('| --- | --- |');
  console.log(`| IE 8 and older, the quirk \`LEGACY\` is for | ${globalLegacy.toFixed(4)}% |`);
  console.log(`| IE 9 to 11, which do not have that quirk | ${modernIE.toFixed(4)}% |`);
  console.log(`| any browser released before 2016 | ${releasedBefore(2016).toFixed(4)}% |`);
  console.log(`| any browser released before September 2017 | ${releasedBefore(2017, 9).toFixed(4)}% |`);
  console.log(`| any browser released before 2020 | ${releasedBefore(2020).toFixed(4)}% |`);

  console.log('');

  console.log('| what the engine needs | first shipped in | how long ago | usage without it | used by |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const need of NEEDS) {
    const first = firstWith(need);
    const where = ['chrome', 'firefox', 'safari']
      .filter(browser => first[browser] !== undefined)
      .map(browser => `${browser} ${first[browser]}`)
      .join(', ');
    console.log(`| \`${need.label}\` | ${where} | ${inYears(ageOf('chrome', first.chrome)?.years)} ` +
      `| ${usageLacking(need).toFixed(2)}% | ${need.usedBy} |`);
  }

  console.log('');

  console.log('| place | IE 8 and older | all IE | people online | that implies |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const place of places.slice(0, placeLimit)) {
    console.log(`| ${place.name} | ${place.legacy.toFixed(3)}% (${place.versions.join(' ')}) ` +
      `| ${place.all.toFixed(3)}% | ${place.online === null ? 'not listed' : millions(place.online)} ` +
      `| ${place.people === null ? '-' : millions(place.people)} |`);
  }
  console.log('');
  console.log(`IE 8 shipped ${ie8?.released}, ${inYears(ie8?.years)}; IE 9 shipped ${ie9?.released} and ` +
    `stopped putting comment nodes in an element collection. Across the ${counted.length} places with a ` +
    `population figure the legacy share comes to about ${millions(peopleTotal)} people, of roughly ` +
    `${(ONLINE.world / 1e9).toFixed(1)} billion online.`);
} else {
  console.log(`caniuse-lite ${dataVersion}, newest browser release in it ${day(newestRelease)}`);
  console.log(`shares are of the ${recorded.toFixed(1)}% of usage it records\n`);

  console.log('what LEGACY is for, globally');
  console.log(`  IE 8 and older                    ${globalLegacy.toFixed(4)}%`);
  console.log(`  IE 9 to 11, without the quirk     ${modernIE.toFixed(4)}%`);
  console.log(`  released before 2016              ${releasedBefore(2016).toFixed(4)}%`);
  console.log(`  released before September 2017    ${releasedBefore(2017, 9).toFixed(4)}%`);
  console.log(`  released before 2020              ${releasedBefore(2020).toFixed(4)}%`);

  console.log('');

  console.log('how old that is');
  console.log(`  IE 8 shipped ${ie8?.released}, ${inYears(ie8?.years)}`);
  console.log(`  IE 9 shipped ${ie9?.released}, ${inYears(ie9?.years)}, and stopped doing it`);

  console.log('');

  console.log('what the engine needs from a host');
  for (const need of NEEDS) {
    const first = firstWith(need);
    const age = ageOf('chrome', first.chrome);
    console.log(`  ${need.label.padEnd(23)} chrome ${String(first.chrome ?? '?').padEnd(4)} ` +
      `${(age ? age.released : '?').padEnd(12)} without it ${usageLacking(need).toFixed(2).padStart(6)}%  ` +
      `(${need.usedBy})`);
  }

  console.log('');

  console.log('where IE 8 and older still shows up, by people rather than by share');
  for (const place of places.slice(0, placeLimit)) {
    console.log(`  ${place.name.padEnd(14)} ${place.legacy.toFixed(3)}% of its page views ` +
      `${`(${place.versions.join(' ')})`.padEnd(14)} ` +
      `${place.people === null ? 'no population figure here' : `${millions(place.people)} people`}`);
  }
  console.log('');
  console.log(`  ${places.length} places record any of it, ${places.length - counted.length} ` +
    'of them without a population figure here');
  console.log(`  the rest come to about ${millions(peopleTotal)} people, of roughly ` +
    `${(ONLINE.world / 1e9).toFixed(1)} billion online`);
}

console.log('');
console.log(`sources: caniuse-lite ${dataVersion} for usage, releases, places and features; ` +
  'MDN for getAttributeNames() and isConnected; ' +
  `ITU and national figures from ${POPULATION_YEAR} for the population counts`);
console.log(`the newest browser release in the data is ${dataAgeDays} days old` +
  (stale ? ', which is stale' : ''));
if (stale) {
  console.log('refresh it: npm view caniuse-lite version, then set that version in the ' +
    'pnpm-workspace.yaml catalog and run pnpm install');
}
if (values.check && stale) {
  process.exitCode = 1;
}
