/*
 * Maps WPT subtest names to the "// section" comment groups found inside
 * upstream/wpt/dom/nodes/selectors.js.
 *
 * The selector arrays in that file (invalidSelectors, validSelectors,
 * scopedSelectors) group entries under comment headers such as:
 *
 *   // Attribute Selectors
 *   // - presence                  [att]
 *
 * ParentNode-querySelector-All.js reports each entry as subtests named
 * "<type>.querySelectorAll: <name>: <selector>" and
 * "<type>.querySelector: <name>: <selector>" (see runValidSelectorTest /
 * runInvalidSelectorTest), so an entry's "name" appears in the subtest name
 * between ": " and ":". That anchor is what getSection() matches on.
 *
 * Run directly to list all sections:  node test/upstream/sections.mjs
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const selectorsJsPath = path.resolve(
  here, '..', '..', 'upstream', 'wpt', 'dom', 'nodes', 'selectors.js',
);

// Fresh clones don't have the sparse WPT checkout yet; fail with a pointer
// to the setup command instead of a raw ENOENT from readFileSync below.
if (!existsSync(selectorsJsPath)) {
  throw new Error('upstream/wpt missing — run: pnpm run upstream:clone');
}

const ARRAY_RE = /^var (invalidSelectors|validSelectors|scopedSelectors)\s*=\s*\[/;
const ENTRY_RE = /^\s*\{\s*name:\s*"((?:[^"\\]|\\.)*)"/;
const COMMENT_RE = /^\s*\/\/(.*)$/;

function parseSelectorsJs(text) {
  // entries: [{ name, section }] in file order; sections: unique, in order.
  const entries = [];
  const sections = [];

  let arrayName = null;
  let topHeader = null;
  let currentSection = null;

  const noteSection = (section) => {
    if (section && !sections.includes(section)) {
      sections.push(section);
    }
    return section;
  };

  for (const line of text.split('\n')) {
    if (arrayName === null) {
      const m = ARRAY_RE.exec(line);
      if (m) {
        arrayName = m[1];
        topHeader = null;
        // Entries before any comment header (e.g. all of invalidSelectors)
        // fall back to the array name as their section.
        currentSection = arrayName;
      }
      continue;
    }
    if (/^\s*\];?\s*$/.test(line)) {
      arrayName = null;
      continue;
    }

    const entry = ENTRY_RE.exec(line);
    if (entry) {
      const name = entry[1].replace(/\\(.)/g, '$1');
      entries.push({ name, section: noteSection(currentSection) });
      continue;
    }

    const comment = COMMENT_RE.exec(line);
    if (!comment) {
      continue;
    }
    const text_ = comment[1].trim().replace(/\s+/g, ' ');
    // Only group headers count: skip commented-out code, XXX notes and prose.
    if (
      text_ === ''
      || text_.startsWith('//')
      || text_.startsWith('XXX')
      || text_.includes('{name:')
      || text_.endsWith('.')
    ) {
      continue;
    }
    if (text_.startsWith('- ')) {
      currentSection = topHeader ? `${topHeader} > ${text_}` : text_;
    } else {
      topHeader = text_;
      currentSection = topHeader;
    }
  }

  // Longest names first so that when one entry name is a substring of
  // another, the more specific entry wins.
  const byLength = entries
    .filter((e, i) => entries.findIndex(o => o.name === e.name) === i)
    .sort((a, b) => b.name.length - a.name.length);

  return { byLength, sections };
}

const { byLength, sections } = parseSelectorsJs(readFileSync(selectorsJsPath, 'utf8'));

/**
 * Given a reported WPT subtest name, return the selectors.js section it
 * belongs to, or null when the subtest does not come from selectors.js.
 */
export function getSection(subtestName) {
  for (const { name, section } of byLength) {
    if (subtestName.includes(`: ${name}:`)) {
      return section;
    }
  }
  return null;
}

/**
 * All known section names, in the order they appear in selectors.js.
 */
export function listSections() {
  return sections.slice();
}

// `node test/upstream/sections.mjs` prints the available sections.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(listSections().join('\n'));
}
