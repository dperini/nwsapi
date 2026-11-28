//! Pure-Rust port of `src/runtime/cssom.mjs` — a minimal CSSOM rule store for
//! CSS-in-JS engines to inject rules at runtime and feed them into the partial cascade.
//!
//! The store is pure Rust; `Tree::insert_style_rule` associates inserted rules with a
//! `<style>` owner so computed-style resolution can include them.
//!
//! HONEST: rules are parsed into `(selector, declarations)` with no normalization,
//! no @media evaluation, no specificity. Declarations are `prop: value` pairs split
//! on `;`, trimmed. `!important` is preserved verbatim inside the value (the JS keeps
//! the raw cssText and lets cascade.mjs parse it the same way — we mirror that by not
//! stripping it).

/// A single style rule: `selector { prop: val; ... }`.
#[derive(Debug, Clone, PartialEq)]
pub struct CssStyleRule {
    pub selector_text: String,
    pub declarations: Vec<(String, String)>,
}

impl CssStyleRule {
    /// Parse one `selector { decls }` block into a rule. The braces are optional in
    /// the input; if absent the whole string is treated as the selector with no decls.
    #[must_use]
    pub fn parse(rule: &str) -> CssStyleRule {
        let open = rule.find('{');
        match open {
            None => CssStyleRule {
                selector_text: rule.trim().to_string(),
                declarations: Vec::new(),
            },
            Some(o) => {
                let selector_text = rule[..o].trim().to_string();
                // body is everything between the first '{' and the matching/last '}'
                let after = &rule[o + 1..];
                let body = match after.rfind('}') {
                    Some(c) => &after[..c],
                    None => after,
                };
                CssStyleRule {
                    selector_text,
                    declarations: parse_declarations(body),
                }
            }
        }
    }

    /// Render as `selector { prop: val; ... }`, matching the JS cssText spacing:
    /// `"<selector> { <prop>: <val>; <prop>: <val>; }"`.
    #[must_use]
    pub fn css_text(&self) -> String {
        let mut decls = String::new();
        for (i, (prop, val)) in self.declarations.iter().enumerate() {
            if i > 0 {
                decls.push(' ');
            }
            decls.push_str(prop);
            decls.push_str(": ");
            decls.push_str(val);
            decls.push(';');
        }
        if decls.is_empty() {
            format!("{} {{ }}", self.selector_text)
        } else {
            format!("{} {{ {} }}", self.selector_text, decls)
        }
    }
}

/// Parse a declaration body (`prop: value; prop: value`) into trimmed pairs.
/// Empty / property-less segments are skipped.
fn parse_declarations(body: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for seg in body.split(';') {
        let seg = seg.trim();
        if seg.is_empty() {
            continue;
        }
        if let Some(colon) = seg.find(':') {
            let prop = seg[..colon].trim();
            let val = seg[colon + 1..].trim();
            if !prop.is_empty() {
                out.push((prop.to_string(), val.to_string()));
            }
        }
    }
    out
}

/// A minimal stylesheet: an ordered list of style rules.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CssStyleSheet {
    pub rules: Vec<CssStyleRule>,
}

impl CssStyleSheet {
    #[must_use]
    pub fn new() -> CssStyleSheet {
        CssStyleSheet { rules: Vec::new() }
    }

    #[must_use]
    pub fn from_css(css: &str) -> CssStyleSheet {
        CssStyleSheet {
            rules: parse_stylesheet(css),
        }
    }

    /// Insert a rule at `index`, returning the index. Mirrors the JS:
    /// valid range is `0..=len`; out-of-range is clamped (the JS throws a `RangeError`,
    /// but as a standalone store we clamp to keep callers infallible — see note).
    ///
    /// NOTE: the JS `insertRule` throws on out-of-bounds. To keep this Rust port
    /// panic-free for embedders we clamp `index` to `0..=len` instead of panicking.
    pub fn insert_rule(&mut self, rule: &str, index: usize) -> usize {
        let i = index.min(self.rules.len());
        self.rules.insert(i, CssStyleRule::parse(rule));
        i
    }

    /// Delete the rule at `index`. Out-of-range is a no-op (JS throws `RangeError`;
    /// standalone store stays panic-free).
    pub fn delete_rule(&mut self, index: usize) {
        if index < self.rules.len() {
            self.rules.remove(index);
        }
    }

    /// Render every rule joined by newlines.
    #[must_use]
    pub fn css_text(&self) -> String {
        let mut out = String::new();
        for (i, r) in self.rules.iter().enumerate() {
            if i > 0 {
                out.push('\n');
            }
            out.push_str(&r.css_text());
        }
        out
    }
}

impl crate::rtdom::tree::Tree {
    /// Insert a CSSOM rule associated with a live `<style>` element.
    ///
    /// The rule participates in the native computed-style cascade even though it is not
    /// represented by the element's text child. Out-of-range indexes append, matching this
    /// crate's infallible [`CssStyleSheet::insert_rule`] contract.
    pub fn insert_style_rule(
        &mut self,
        owner: crate::rtdom::tree::Handle,
        rule: &str,
        index: usize,
    ) -> Option<usize> {
        if !self.is_live(owner) || self.local_name(owner) != Some("style") {
            return None;
        }
        let authored = self.text_content(owner);
        let sheet = self
            .cssom_sheets
            .entry(owner)
            .or_insert_with(|| CssStyleSheet::from_css(&authored));
        let inserted = sheet.insert_rule(rule, index);
        self.stylesheet_changed();
        Some(inserted)
    }

    /// Delete an indexed CSSOM rule associated with a live `<style>` element.
    ///
    /// Returns false when the element has no overlay sheet or the index is out of range.
    pub fn delete_style_rule(&mut self, owner: crate::rtdom::tree::Handle, index: usize) -> bool {
        let Some(sheet) = self.cssom_sheets.get_mut(&owner) else {
            return false;
        };
        if index >= sheet.rules.len() {
            return false;
        }
        sheet.delete_rule(index);
        self.stylesheet_changed();
        true
    }
}

/// Find the next `{` or `}` from `start`.
fn find_brace(bytes: &[u8], start: usize) -> Option<(usize, u8)> {
    let mut j = start;
    while j < bytes.len() {
        if bytes[j] == b'{' || bytes[j] == b'}' {
            return Some((j, bytes[j]));
        }
        j += 1;
    }
    None
}

/// Scan from just after an opening `{` to the byte AFTER the matching `}`.
fn scan_matching_close(bytes: &[u8], start: usize) -> usize {
    let mut depth = 1usize;
    let mut k = start;
    while k < bytes.len() && depth > 0 {
        match bytes[k] {
            b'{' => depth += 1,
            b'}' => depth -= 1,
            _ => {}
        }
        k += 1;
    }
    k
}

/// Split a stylesheet string into top-level `selector { decls }` rules and parse
/// each. Brace-depth aware; skips `/* ... */` comments. Mirrors `splitTopLevelRules`
/// in cascade.mjs / cssom.mjs (depth scan) plus comment stripping.
#[must_use]
pub fn parse_stylesheet(css: &str) -> Vec<CssStyleRule> {
    let cleaned = strip_comments(css);
    let bytes = cleaned.as_bytes();
    let mut out = Vec::new();
    let mut i = 0usize;
    while let Some((j, brace)) = find_brace(bytes, i) {
        if brace == b'}' {
            i = j + 1;
            continue;
        }
        let k = scan_matching_close(bytes, j + 1);
        let piece = cleaned[i..k].trim();
        if !piece.is_empty() {
            let rule = CssStyleRule::parse(piece);
            if !rule.selector_text.is_empty() || !rule.declarations.is_empty() {
                out.push(rule);
            }
        }
        i = k;
    }
    out
}

/// Find the end of a `/* ... */` comment starting at `open` (the `/` of `/*`).
/// Returns the index just past `*/`, or `bytes.len()` if unterminated.
fn find_comment_end(bytes: &[u8], open: usize) -> usize {
    let mut k = open + 2;
    while k + 1 < bytes.len() {
        if bytes[k] == b'*' && bytes[k + 1] == b'/' {
            return k + 2;
        }
        k += 1;
    }
    bytes.len()
}

/// Remove `/* ... */` comments (CSS has no nested comments). Hand-scanned, no regex.
fn strip_comments(css: &str) -> String {
    if !css.contains("/*") {
        return css.to_string();
    }
    let bytes = css.as_bytes();
    let mut out = String::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            i = find_comment_end(bytes, i);
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_stylesheet_two_rules() {
        let rules = parse_stylesheet(".a{color:red;padding:0}\n#b { margin: 1px }");
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].selector_text, ".a");
        assert_eq!(rules[0].declarations.len(), 2);
        assert_eq!(
            rules[0].declarations[0],
            ("color".to_string(), "red".to_string())
        );
        assert_eq!(
            rules[0].declarations[1],
            ("padding".to_string(), "0".to_string())
        );
        assert_eq!(rules[1].selector_text, "#b");
        assert_eq!(
            rules[1].declarations[0],
            ("margin".to_string(), "1px".to_string())
        );
    }

    #[test]
    fn css_text_round_trip() {
        let rules = parse_stylesheet(".a{color:red;padding:0}");
        let txt = rules[0].css_text();
        assert!(txt.contains("color: red"), "got: {txt}");
        assert_eq!(txt, ".a { color: red; padding: 0; }");
    }

    #[test]
    fn insert_and_delete_rule_index() {
        let mut sheet = CssStyleSheet::new();
        // insert into empty at 0
        assert_eq!(sheet.insert_rule(".x { color: blue }", 0), 0);
        assert_eq!(sheet.rules.len(), 1);
        // insert at 0 pushes the existing rule down
        assert_eq!(sheet.insert_rule(".y { color: green }", 0), 0);
        assert_eq!(sheet.rules[0].selector_text, ".y");
        assert_eq!(sheet.rules[1].selector_text, ".x");
        // append at end
        assert_eq!(sheet.insert_rule(".z { color: red }", 2), 2);
        assert_eq!(sheet.rules.len(), 3);
        // out-of-range clamps to len
        assert_eq!(sheet.insert_rule(".w { margin: 0 }", 99), 3);
        assert_eq!(sheet.rules.len(), 4);
        assert_eq!(sheet.rules[3].selector_text, ".w");
        // delete the first
        sheet.delete_rule(0);
        assert_eq!(sheet.rules.len(), 3);
        assert_eq!(sheet.rules[0].selector_text, ".x");
        // out-of-range delete is a no-op
        sheet.delete_rule(99);
        assert_eq!(sheet.rules.len(), 3);
    }

    #[test]
    fn parse_stylesheet_brace_edges() {
        // leading stray `}` is skipped; trailing text with no brace breaks cleanly
        let rules = parse_stylesheet("}.a{color:red} trailing-no-brace");
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].selector_text, ".a");
        // nested braces increment depth (outer body contains a `{ }` pair)
        let nested = parse_stylesheet("x{ y{ z:1 } }");
        assert_eq!(nested.len(), 1);
        assert_eq!(nested[0].selector_text, "x");
    }

    #[test]
    fn parse_edges_and_empty_css_text() {
        // rule with '{' but no closing '}' → body is everything after '{'
        let r = CssStyleRule::parse("a { color: red");
        assert_eq!(r.selector_text, "a");
        assert_eq!(
            r.declarations,
            vec![("color".to_string(), "red".to_string())]
        );
        // rule with no '{' at all → whole string is the selector, no decls
        let r2 = CssStyleRule::parse(".x");
        assert_eq!(r2.selector_text, ".x");
        assert_eq!(r2.declarations, [] as [(String, String); 0]);
        // empty-declaration css_text → "sel { }"
        assert_eq!(CssStyleRule::parse(".x {}").css_text(), ".x { }");
    }

    #[test]
    fn declarations_with_important_preserved() {
        let rules = parse_stylesheet(".a { color: red !important; }");
        assert_eq!(rules[0].declarations[0].1, "red !important");
    }

    #[test]
    fn comments_stripped() {
        let rules = parse_stylesheet("/* c */ .a { color: /* x */ red }");
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].selector_text, ".a");
        assert_eq!(rules[0].declarations[0].1, "red");
    }

    #[test]
    fn unterminated_comment_treated_as_eof() {
        let rules = parse_stylesheet(".a { color: red } /* unterminated");
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].selector_text, ".a");
    }

    #[test]
    fn sheet_css_text_joins_with_newline() {
        let sheet = CssStyleSheet::from_css(".a{color:red} .b{color:blue}");
        let txt = sheet.css_text();
        assert_eq!(txt, ".a { color: red; }\n.b { color: blue; }");
    }
}
