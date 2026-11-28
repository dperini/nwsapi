//! DIRECT rtdom html5lib-tests conformance gate. Parses each fixture via the rtdom
//! `Tree`, dumps it through rtdom's traversal (`dump.rs`), and string-compares to the
//! fixture's `#document`. This proves rtdom's tree representation + traversal are
//! faithful — distinct from the transitive parser gate (`harness/conformance.mjs`),
//! which serializes the parser output in JS without going through rtdom.
//!
//! v1 scope: FULL-DOCUMENT tests. `#document-fragment` tests are skipped (counted)
//! — rtdom fragment parsing into a buffer isn't wired yet; those stay covered by the
//! transitive JS gate. `#script-on` fixtures are skipped (scripting flag is off).

use super::dump::{dump_children, dump_tree};
use super::tree::Tree;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

struct DatTest {
    data: String,
    document: String,
    fragment_context: Option<String>,
    script_on: bool,
}

const HEADERS: &[&str] = &[
    "#data",
    "#errors",
    "#new-errors",
    "#document",
    "#document-fragment",
    "#script-on",
    "#script-off",
];

fn trim_trailing_blank(lines: &[String]) -> Vec<String> {
    let mut v = lines.to_vec();
    while v.last().is_some_and(std::string::String::is_empty) {
        v.pop();
    }
    v
}

/// Port of `harness/dat.mjs` parseDatFile. Section keys are the `'static` HEADERS,
/// so the map never borrows from `text` (sidesteps lifetime tangles).
fn parse_dat(text: &str) -> Vec<DatTest> {
    let mut tests = Vec::new();
    let mut cur: HashMap<&'static str, Vec<String>> = HashMap::new();
    let mut have_cur = false;
    let mut section: Option<&'static str> = None;
    let mut buf: Vec<String> = Vec::new();

    for line in text.split('\n') {
        if let Some(&hdr) = HEADERS.iter().find(|&&h| h == line) {
            // flush the pending section's buffer into the current case
            if let Some(sec) = section {
                cur.insert(sec, std::mem::take(&mut buf));
            }
            if hdr == "#data" {
                if have_cur {
                    tests.push(normalize(&cur));
                    cur.clear();
                }
                have_cur = true;
            }
            section = Some(hdr);
            buf = Vec::new();
        } else {
            buf.push(line.to_string());
        }
    }
    if let Some(sec) = section {
        cur.insert(sec, std::mem::take(&mut buf));
    }
    if have_cur {
        tests.push(normalize(&cur));
    }
    tests
}

fn normalize(raw: &HashMap<&str, Vec<String>>) -> DatTest {
    let data = raw.get("#data").map_or_default(|v| v.join("\n"));
    let document = raw
        .get("#document")
        .map_or_default(|v| trim_trailing_blank(v).join("\n"));
    let fragment_context = raw.get("#document-fragment").and_then(|v| {
        let s = trim_trailing_blank(v).join("\n").trim().to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    });
    let script_on = raw.contains_key("#script-on");
    DatTest {
        data,
        document,
        fragment_context,
        script_on,
    }
}

fn eval_conformance_case(t: &DatTest) -> Option<(String, bool)> {
    if t.script_on || t.fragment_context.is_some() {
        return None;
    }
    let actual = dump_tree(&Tree::parse(&t.data));
    Some((actual.clone(), actual == t.document))
}

#[test]
fn rtdom_html5lib_conformance_full_document() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../vendor/html5lib-tests");
    let Ok(entries) = fs::read_dir(&dir) else {
        eprintln!("rtdom conformance: fixtures not found at {dir:?} — skipping");
        return;
    };
    let mut dat_files: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "dat"))
        .collect();
    dat_files.sort();

    let mut pass = 0usize;
    let mut fail = 0usize;
    let mut skip = 0usize;
    let mut bad: Vec<(String, String, String)> = Vec::new(); // (input, expected, actual)

    for path in &dat_files {
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        for t in parse_dat(&text) {
            let Some((actual, is_pass)) = eval_conformance_case(&t) else {
                skip += 1;
                continue;
            };
            if is_pass {
                pass += 1;
            } else {
                fail += 1;
                if !t.data.contains("select") {
                    bad.push((t.data.clone(), t.document.clone(), actual));
                }
            }
        }
    }

    let total = pass + fail;
    let rate = if total > 0 {
        pass as f64 / total as f64 * 100.0
    } else {
        0.0
    };
    eprintln!(
        "rtdom html5lib conformance (full-document): {pass}/{total} = {rate:.2}%  ({skip} skipped: fragment/script-on)"
    );

    for (input, expected, actual) in bad.iter().take(5) {
        eprintln!("--- NON-<select> FAILURE ---\ninput: {input}\nexpected:\n{expected}\nactual:\n{actual}\n");
    }

    assert!(
        bad.is_empty(),
        "{} non-<select> conformance failures — rtdom dump/traversal diverges from the fixtures",
        bad.len()
    );
    if total > 0 {
        assert!(rate >= 99.0, "rtdom conformance {rate:.2}% < 99% gate");
    }
}

/// Every html5lib fixture case, in sorted file order (empty when the vendored
/// fixtures are absent, as in the published crate).
fn fixture_cases() -> Vec<DatTest> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../vendor/html5lib-tests");
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut dat_files: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "dat"))
        .collect();
    dat_files.sort();
    dat_files
        .iter()
        .filter_map(|path| fs::read_to_string(path).ok())
        .flat_map(|text| parse_dat(&text))
        .collect()
}

/// A fixture's `#document-fragment` context as an element of a scratch tree:
/// `svg x` / `math x` are foreign, anything else an HTML element.
fn fragment_context(tree: &mut Tree, context: &str) -> super::tree::Handle {
    use super::tree::Namespace;
    match context.split_once(' ') {
        Some(("svg", local)) => tree.create_element_ns(local, Namespace::Svg),
        Some(("math", local)) => tree.create_element_ns(local, Namespace::MathMl),
        _ => tree.create_element(context),
    }
}

/// The UTF-16 tokenizer fork (`tree::unit_tokenizer`, behind the source-position
/// and contextual-fragment parse paths) builds exactly the tree upstream html5ever
/// builds (`Tree::parse` / `set_inner_html`) for every html5lib tree-construction
/// fixture, and so passes the same fixtures: full documents through
/// `parse_with_source_positions`, fragment cases through
/// `create_contextual_fragment_utf16` in the fixture's context element (with the
/// fixture's scripting flag).
#[test]
fn units_tokenizer_builds_the_upstream_tree_for_every_fixture() {
    let cases = fixture_cases();
    let (mut documents, mut fragments, mut pass) = (0usize, 0usize, 0usize);
    let mut divergent = Vec::new();
    for t in &cases {
        let units: Vec<u16> = t.data.encode_utf16().collect();
        let (native, upstream) = if let Some(context) = &t.fragment_context {
            fragments += 1;
            let mut tree = Tree::parse("");
            let element = fragment_context(&mut tree, context);
            let fragment = tree.create_contextual_fragment_utf16(element, &units, t.script_on);
            let native = dump_children(&tree, fragment);
            let upstream = if t.script_on {
                // `set_inner_html` parses with scripting off; the fixture is the oracle.
                t.document.clone()
            } else {
                let element = fragment_context(&mut tree, context);
                tree.set_inner_html(element, &t.data);
                dump_children(&tree, element)
            };
            (native, upstream)
        } else {
            documents += 1;
            let native = dump_tree(&Tree::parse_with_source_positions(&t.data));
            (native, dump_tree(&Tree::parse(&t.data)))
        };
        if native != upstream {
            divergent.push((t.data.clone(), upstream, native.clone()));
        }
        if native == t.document {
            pass += 1;
        }
    }
    eprintln!(
        "units tokenizer vs html5lib: {pass}/{} fixtures ({documents} documents, {fragments} fragments)",
        cases.len()
    );
    for (input, upstream, native) in divergent.iter().take(5) {
        eprintln!("--- DIVERGENT ---\ninput: {input}\nupstream:\n{upstream}\nnative:\n{native}\n");
    }
    assert!(
        divergent.is_empty(),
        "{} fixtures diverge from upstream html5ever",
        divergent.len()
    );
    if !cases.is_empty() {
        assert!(fragments > 0 && documents > 0);
        assert!(
            pass * 100 >= cases.len() * 99,
            "{pass}/{} < 99%",
            cases.len()
        );
    }
}

#[cfg(test)]
mod dat_tests {
    use super::*;

    #[test]
    fn parses_sections_and_normalizes() {
        let text = "#data\n<div>x</div>\n#errors\n#document\n| <html>\n|   <head>\n|   <body>\n|     <div>\n|       \"x\"\n\n#data\n<p>\n#document-fragment\ntd\n#document\n| <p>\n";
        let tests = parse_dat(text);
        assert_eq!(tests.len(), 2);
        assert_eq!(tests[0].data, "<div>x</div>");
        assert!(tests[0].document.starts_with("| <html>"));
        assert!(!tests[0].document.ends_with('\n')); // trailing blank trimmed
        assert_eq!(tests[0].fragment_context, None);
        assert_eq!(tests[1].fragment_context.as_deref(), Some("td"));
        assert!(!tests[1].script_on);
    }

    #[test]
    fn script_on_flag() {
        let text = "#data\n<noscript>x\n#script-on\n#document\n| <html>\n";
        let tests = parse_dat(text);
        assert_eq!(tests.len(), 1);
        assert!(tests[0].script_on);
    }
}
