//! Partial computed-style cascade — pure-Rust port of `src/runtime/cascade.mjs`.
//!
//! Resolves `getComputedStyle` from injected `<style>` sheets (emotion/MUI
//! `.css-HASH { … }`), inline styles, and specificity ordering (each rule item's Selectors 4
//! specificity from `parse_for_cascade`, then source order).
//!
//! HONEST: this only ever returns values that come from a REAL matched rule or
//! inline style (or inherited from one — see `INHERITED`). A property no
//! stylesheet/inline set still reads `""` — it never invents layout/cascade
//! numbers or initial values. Out of scope (return `""`): @media/@supports/
//! @keyframes, :hover & other stateful pseudo-classes, pseudo-elements, the
//! `inherit`/`initial`/`unset` keywords, CSS custom-property resolution. Colors
//! ARE canonicalized to `rgb()/rgba()` (`color.rs`) and bare-0 lengths to `0px`,
//! matching what a browser serializes.

use crate::rtdom::color;
use crate::rtdom::query::{
    match_for_cascade, parse_for_cascade, CascadeSelector, LiveNavigator, Navigator,
    ScopedNavigator, Specificity,
};
use crate::rtdom::tree::{Handle, NodeType, Tree};
use std::collections::{HashMap, HashSet};

/// Host policy exclusions affect style application without mutating the authored DOM.
#[derive(Default, Clone)]
pub struct StylePolicy {
    pub blocked_stylesheets: HashSet<Handle>,
    pub blocked_inline: HashSet<Handle>,
    /// Applied CSSOM declarations can differ from a policy-blocked authored attribute.
    pub inline_overrides: HashMap<Handle, String>,
}
impl StylePolicy {
    fn cache_key(&self) -> u64 {
        use std::hash::{Hash, Hasher};
        if self.blocked_stylesheets.is_empty()
            && self.blocked_inline.is_empty()
            && self.inline_overrides.is_empty()
        {
            return 0;
        }
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        for nodes in [&self.blocked_stylesheets, &self.blocked_inline] {
            let mut ordered = nodes.iter().copied().collect::<Vec<_>>();
            ordered.sort_unstable();
            ordered.hash(&mut hasher);
        }
        let mut overrides = self.inline_overrides.iter().collect::<Vec<_>>();
        overrides.sort_unstable_by_key(|(node, _)| **node);
        overrides.hash(&mut hasher);
        hasher.finish()
    }
}

/// camelCase → kebab-case property name (only ever fed kebab from CSS, but kept
/// for parity with the JS `kebab` used at the proxy boundary).
#[must_use]
pub fn kebab(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 4);
    for c in s.chars() {
        if c.is_ascii_uppercase() {
            out.push('-');
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

/// Longhand → shorthand fallback for single-token shorthands (mirrors dom.mjs styleGet).
fn shorthand_of(prop: &str) -> Option<&'static str> {
    match prop {
        "background-color" => Some("background"),
        "margin-top" | "margin-right" | "margin-bottom" | "margin-left" => Some("margin"),
        "padding-top" | "padding-right" | "padding-bottom" | "padding-left" => Some("padding"),
        _ => None,
    }
}

/// Length properties whose bare `0` real browsers serialize as `0px`.
const LENGTH_PROPS: &[&str] = &[
    "width",
    "height",
    "min-width",
    "max-width",
    "min-height",
    "max-height",
    "top",
    "right",
    "bottom",
    "left",
    "flex-basis",
    "gap",
    "row-gap",
    "column-gap",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-width",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "font-size",
    "letter-spacing",
    "word-spacing",
    "text-indent",
];

fn is_length_prop(p: &str) -> bool {
    LENGTH_PROPS.contains(&p)
}

const BORDER_STYLES: &[&str] = &[
    "none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset",
];

/// Inheritable properties propagated down the flattened tree (curated set).
const INHERITED: &[&str] = &[
    "color",
    "cursor",
    "direction",
    "font",
    "font-family",
    "font-size",
    "font-style",
    "font-variant",
    "font-weight",
    "letter-spacing",
    "line-height",
    "list-style",
    "list-style-type",
    "text-align",
    "text-indent",
    "text-transform",
    "visibility",
    "white-space",
    "word-spacing",
    "quotes",
];

/// `<token>` looks like a CSS length/number ("1px", "2.5em", "0", "50%").
fn looks_like_width_token(p: &str) -> bool {
    if p == "thin" || p == "medium" || p == "thick" {
        return true;
    }
    // /^[\d.]+(px|em|rem|%|pt|vh|vw)?$/
    let units = ["px", "em", "rem", "%", "pt", "vh", "vw"];
    let mut num_end = 0;
    for (i, c) in p.char_indices() {
        if c.is_ascii_digit() || c == '.' {
            num_end = i + c.len_utf8();
        } else {
            break;
        }
    }
    if num_end == 0 {
        return false; // no leading numeric part
    }
    let rest = &p[num_end..];
    rest.is_empty() || units.contains(&rest)
}

/// Mirror of the JS `setProp`: store the declaration AND expand common shorthands
/// into longhands so longhand computed getters resolve.
fn set_prop(map: &mut HashMap<String, String>, name: &str, val: &str) {
    map.insert(name.to_string(), val.to_string());
    if name == "margin" || name == "padding" {
        expand_box_shorthand(map, name, val);
    } else if name == "border" {
        expand_border_shorthand(map, val);
    } else if name == "background" && !val.trim().contains(char::is_whitespace) {
        map.insert("background-color".to_string(), val.trim().to_string());
    }
}

/// Expand a `margin`/`padding` shorthand value (1-4 tokens) into its four side longhands.
fn expand_box_shorthand(map: &mut HashMap<String, String>, name: &str, val: &str) {
    let t: Vec<&str> = val.split_whitespace().collect();
    let top = t.first().copied().unwrap_or("");
    let right = t.get(1).copied().unwrap_or(top);
    let bottom = t.get(2).copied().unwrap_or(top);
    let left = t.get(3).copied().unwrap_or(right);
    map.insert(format!("{name}-top"), top.to_string());
    map.insert(format!("{name}-right"), right.to_string());
    map.insert(format!("{name}-bottom"), bottom.to_string());
    map.insert(format!("{name}-left"), left.to_string());
}

/// Expand a `border` shorthand value into width/style/color longhands.
fn expand_border_shorthand(map: &mut HashMap<String, String>, val: &str) {
    let mut width: Option<&str> = None;
    let mut style: Option<&str> = None;
    let mut color_v: Option<&str> = None;
    for p in val.split_whitespace() {
        if BORDER_STYLES.contains(&p) {
            style = Some(p);
        } else if looks_like_width_token(p) {
            width = Some(p);
        } else {
            color_v = Some(p);
        }
    }
    if let Some(w) = width {
        map.insert("border-width".to_string(), w.to_string());
        for s in ["top", "right", "bottom", "left"] {
            map.insert(format!("border-{s}-width"), w.to_string());
        }
    }
    if let Some(s) = style {
        map.insert("border-style".to_string(), s.to_string());
    }
    if let Some(c) = color_v {
        map.insert("border-color".to_string(), c.to_string());
    }
}

/// Strip a trailing `!important` (case-insensitive, surrounding whitespace) from a value.
fn strip_important(v: &str) -> String {
    let trimmed = v.trim_end();
    let lower = trimmed.to_ascii_lowercase();
    // match /\s*!\s*important\s*$/i — but the JS applied it after .trim() of the
    // value; here we replicate `!<ws>important` at the (already trimmed) end.
    if let Some(bang) = lower.rfind('!') {
        let after = lower[bang + 1..].trim_start();
        if after == "important" {
            return trimmed[..bang].trim_end().to_string();
        }
    }
    trimmed.to_string()
}

/// Parse a `prop:val;prop:val` declaration block into `map` (later wins).
fn parse_decls(text: &str, map: &mut HashMap<String, String>) {
    for decl in text.split(';') {
        let Some(c) = decl.find(':') else { continue };
        let name = decl[..c].trim().to_ascii_lowercase();
        if name.is_empty() {
            continue;
        }
        let raw = decl[c + 1..].trim();
        let val = strip_important(raw);
        set_prop(map, &name, &val);
    }
}

/// Strip `/* … */` comments.
fn strip_comments(css: &str) -> String {
    let mut out = String::with_capacity(css.len());
    let bytes = css.as_bytes();
    let n = bytes.len();
    let mut i = 0;
    while i < n {
        if i + 1 < n && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < n && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i += 2;
        } else {
            // push the char (handle UTF-8 boundaries via the str slice)
            let ch_len = utf8_len(bytes[i]);
            out.push_str(&css[i..(i + ch_len).min(n)]);
            i += ch_len;
        }
    }
    out
}

fn utf8_len(b: u8) -> usize {
    if b < 0x80 {
        1
    } else if b < 0xE0 {
        2
    } else if b < 0xF0 {
        3
    } else {
        4
    }
}

#[derive(Clone)]
pub(crate) struct Rule {
    /// One complex selector of the rule's list and its parse.
    parsed: CascadeSelector,
    decls: HashMap<String, String>,
    /// Selectors 4 specificity from `parse_for_cascade` (`:where()` 0, `:is()` / `:not()` /
    /// `:has()` their most specific argument, `:nth-child(… of S)` a pseudo-class plus S).
    spec: Specificity,
    order: u32,
}

impl Rule {
    /// Does the rule's selector match `h` (stylesheet semantics: `:scope` is `:root`,
    /// pseudo-elements never match)?
    fn matches(&self, tree: &Tree, h: Handle) -> bool {
        match_for_cascade(&LiveNavigator(tree), h, &self.parsed)
    }
}

/// Version-keyed cascade cache held on the `Tree` (mirrors the JS `__computedStyle`
/// memo keyed on `Document.__version`). `build_index` runs once per version, and
/// each element's resolved map is memoized — without this, `getComputedStyle`
/// re-parses every `<style>` per call AND per inheritance-recursion ancestor.
#[derive(Default)]
pub(crate) struct CssCache {
    pub version: u64,
    pub policy_key: u64,
    /// Hash of the `<style>` sources that produced `rules`. The DOM `version` bumps on ANY
    /// mutation (structure, attributes, text) — but the authored stylesheets usually don't
    /// change across those bumps (a React re-render restructures nodes, not the injected CSS).
    /// Keying the parsed rule index on the style SOURCE (not the DOM version) lets it survive
    /// version bumps, so `getComputedStyle` after a re-render skips re-parsing every `<style>`.
    /// `None` = no rules parsed yet.
    pub rules_key: Option<u64>,
    pub rules: Option<std::rc::Rc<Vec<Rule>>>,
    pub computed: HashMap<Handle, std::rc::Rc<HashMap<String, String>>>,
}

/// Hash every `<style>` element's text in document order — the cache key for the parsed rule
/// index. Reading + hashing the source is far cheaper than re-parsing it (strip-comments,
/// brace scan, per-rule decl maps, specificity, clones), so paying this on each version bump
/// to skip an unchanged re-parse is a net win. Also folds in the style count so adding an
/// empty `<style>` (or reordering) still invalidates.
fn style_source_hash(tree: &Tree, policy: &StylePolicy) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let styles = tree.get_elements_by_tag_name("style");
    styles.len().hash(&mut hasher);
    for h in styles {
        if policy.blocked_stylesheets.contains(&h) {
            continue;
        }
        h.hash(&mut hasher);
        tree.text_content(h).hash(&mut hasher);
        tree.cssom_sheets
            .get(&h)
            .map(crate::rtdom::cssom::CssStyleSheet::css_text)
            .hash(&mut hasher);
    }
    hasher.finish()
}

/// Brace-depth scan: emit only depth-1 rules whose selector isn't an at-rule;
/// the bodies of @media/@keyframes (nested braces) are skipped wholesale.
fn parse_stylesheet(css: &str, start_order: u32, rules: &mut Vec<Rule>) -> u32 {
    let css = strip_comments(css);
    let bytes = css.as_bytes();
    let n = bytes.len();
    let mut order = start_order;
    let mut i = 0;
    while i < n {
        let j = scan_to_delimiter(bytes, i);
        if j >= n {
            break;
        }
        match bytes[j] {
            b';' => {
                order += 1;
                i = j + 1;
            }
            b'}' => i = j + 1,
            _ => i = parse_rule_block(&css, i, bytes, j, &mut order, rules),
        }
    }
    order
}

fn scan_to_delimiter(bytes: &[u8], start: usize) -> usize {
    let mut j = start;
    while j < bytes.len() && bytes[j] != b'{' && bytes[j] != b'}' && bytes[j] != b';' {
        j += 1;
    }
    j
}

fn parse_rule_block(
    css: &str,
    sel_start: usize,
    bytes: &[u8],
    open: usize,
    order: &mut u32,
    rules: &mut Vec<Rule>,
) -> usize {
    let sel = css[sel_start..open].trim().to_string();
    let k = skip_brace_block(bytes, open + 1);
    if !sel.is_empty() && !sel.starts_with('@') {
        let body = &css[open + 1..k.saturating_sub(1)];
        emit_rule_list(&sel, body, order, rules);
    } else {
        *order += 1;
    }
    k
}

fn skip_brace_block(bytes: &[u8], start: usize) -> usize {
    let n = bytes.len();
    let mut depth = 1i32;
    let mut k = start;
    while k < n && depth > 0 {
        match bytes[k] {
            b'{' => depth += 1,
            b'}' => depth -= 1,
            _ => {}
        }
        k += 1;
    }
    k
}

fn emit_rule_list(sel: &str, body: &str, order: &mut u32, rules: &mut Vec<Rule>) {
    let mut decls = HashMap::new();
    parse_decls(body, &mut decls);
    if let (false, Ok(list)) = (decls.is_empty(), parse_for_cascade(sel)) {
        for item in list.selectors() {
            rules.push(Rule {
                parsed: item.clone(),
                decls: decls.clone(),
                spec: item.specificity(),
                order: *order,
            });
            *order += 1;
        }
    }
}

/// Build the rule index from every `<style>` element's text content in the doc.
fn build_index(tree: &Tree, policy: &StylePolicy) -> Vec<Rule> {
    let styles = tree.get_elements_by_tag_name("style");
    let mut rules = Vec::new();
    let mut order = 0u32;
    for h in styles {
        if policy.blocked_stylesheets.contains(&h) {
            continue;
        }
        if let Some(sheet) = tree.cssom_sheets.get(&h) {
            order = parse_stylesheet(&sheet.css_text(), order, &mut rules);
        } else {
            order = parse_stylesheet(&tree.text_content(h), order, &mut rules);
        }
    }
    rules
}

/// Collect document-scope rules whose selector matches `h`.
fn collect_matched(tree: &Tree, h: Handle, rules: &[Rule], into: &mut Vec<Rule>) {
    for r in rules {
        if r.matches(tree, h) {
            into.push(r.clone());
        }
    }
}

/// Sort by (spec, order) then apply in cascade order (later wins).
fn apply_matched(matched: &mut [Rule], out: &mut HashMap<String, String>) {
    matched.sort_by(|x, y| x.spec.cmp(&y.spec).then(x.order.cmp(&y.order)));
    for r in matched.iter() {
        for (k, v) in &r.decls {
            out.insert(k.clone(), v.clone());
        }
    }
}

/// Flattened-tree parent for inheritance. Crosses the shadow boundary: a
/// top-level shadow child inherits from the HOST (the JS hops shadow-root→host).
fn flattened_parent(tree: &Tree, h: Handle) -> Option<Handle> {
    let p = tree.parent(h)?;
    if tree.is_shadow_root(p) {
        return tree.shadow_host(p); // shadow-root→host hop
    }
    if tree.node_type(p) == NodeType::Element {
        Some(p)
    } else {
        None
    }
}

/// Parse every `<style>` inside a shadow root into scoped rules.
fn shadow_rules(tree: &Tree, shadow_root: Handle, policy: &StylePolicy) -> Vec<Rule> {
    let mut rules = Vec::new();
    let mut order = 0u32;
    for h in tree.descendants(shadow_root) {
        if tree.local_name(h) == Some("style") && !policy.blocked_stylesheets.contains(&h) {
            if let Some(sheet) = tree.cssom_sheets.get(&h) {
                order = parse_stylesheet(&sheet.css_text(), order, &mut rules);
            } else {
                order = parse_stylesheet(&tree.text_content(h), order, &mut rules);
            }
        }
    }
    rules
}

/// Look up a resolved property from the cascade map, applying shorthand fallback,
/// bare-0 → `0px`, font-family comma spacing, and color canonicalization.
fn lookup(map: &HashMap<String, String>, prop: &str) -> String {
    let v = map
        .get(prop)
        .cloned()
        .or_else(|| shorthand_fallback(map, prop));
    let Some(v) = v else { return String::new() };
    normalize_lookup_value(prop, v)
}

fn shorthand_fallback(map: &HashMap<String, String>, prop: &str) -> Option<String> {
    let sh = shorthand_of(prop)?;
    let s = map.get(sh)?;
    (!s.trim().contains(char::is_whitespace)).then(|| s.clone())
}

fn normalize_lookup_value(prop: &str, v: String) -> String {
    if v == "0" && is_length_prop(prop) {
        return "0px".to_string();
    }
    if prop == "font-family" {
        return normalize_font_family(&v);
    }
    if color::is_color_prop(prop) {
        if let Some(c) = color::canonicalize_color(&v, true) {
            return c;
        }
    }
    v
}

/// Replace `\s*,\s*` with `, ` (scoped to font-family).
fn normalize_font_family(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    let mut chars = v.chars().peekable();
    while let Some(c) = chars.next() {
        if c == ',' {
            // drop any whitespace we'd already pushed before the comma
            while out.ends_with(char::is_whitespace) {
                out.pop();
            }
            out.push_str(", ");
            // skip following whitespace
            while matches!(chars.peek(), Some(w) if w.is_whitespace()) {
                chars.next();
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Resolve the full computed-style map for element `h`.
///
/// Mirrors `makeGetComputedStyle`'s gcs(el): collect matched `<style>` rules,
/// sort by (spec, order), apply; overlay inline `style`; then inherit the
/// curated `INHERITED` set from the flattened parent (only values a REAL
/// rule/inline set, never an initial value).
pub fn computed_style(tree: &Tree, h: Handle) -> HashMap<String, String> {
    computed_style_with_policy(tree, h, &StylePolicy::default())
}

enum PrepareOutcome {
    Cached(HashMap<String, String>),
    Rules(std::rc::Rc<Vec<Rule>>),
}

fn prepare_cascade_cache(tree: &Tree, h: Handle, policy: &StylePolicy) -> PrepareOutcome {
    let version = tree.version;
    let policy_key = policy.cache_key();
    let mut c = tree.css_cache.borrow_mut();
    if c.version != version || c.policy_key != policy_key {
        c.version = version;
        c.policy_key = policy_key;
        c.computed.clear();
        let key = style_source_hash(tree, policy);
        if c.rules_key != Some(key) {
            c.rules = None;
            c.rules_key = Some(key);
        }
    }
    if let Some(cached) = c.computed.get(&h) {
        return PrepareOutcome::Cached((**cached).clone());
    }
    if c.rules.is_none() {
        if c.rules_key.is_none() {
            c.rules_key = Some(style_source_hash(tree, policy));
        }
        c.rules = Some(std::rc::Rc::new(build_index(tree, policy)));
    }
    PrepareOutcome::Rules(c.rules.clone().unwrap())
}

fn collect_shadow_and_light_matches(
    tree: &Tree,
    h: Handle,
    policy: &StylePolicy,
    light_rules: &[Rule],
    matched: &mut Vec<Rule>,
) {
    let in_shadow = tree.shadow_root_of(h);
    if in_shadow.is_none() {
        collect_matched(tree, h, light_rules, matched);
    } else if let Some(sr) = in_shadow {
        let nav = ScopedNavigator::new(LiveNavigator(tree), h, Some(sr));
        for r in shadow_rules(tree, sr, policy) {
            if r.matches_with_nav(&nav, h) {
                matched.push(r);
            }
        }
    }
    collect_host_matches(tree, h, policy, matched);
    collect_slotted_matches(tree, h, policy, matched);
}

fn collect_host_matches(tree: &Tree, h: Handle, policy: &StylePolicy, matched: &mut Vec<Rule>) {
    let Some(sr) = tree.shadow_root(h) else {
        return;
    };
    for r in shadow_rules(tree, sr, policy) {
        let nav = ScopedNavigator::new(LiveNavigator(tree), sr, Some(sr));
        if r.matches_with_nav(&nav, h) {
            matched.push(r);
        }
    }
}

impl Rule {
    fn matches_with_nav<N: Navigator + ?Sized>(&self, nav: &N, h: Handle) -> bool {
        match_for_cascade(nav, h, &self.parsed)
    }
}

fn collect_slotted_matches(tree: &Tree, h: Handle, policy: &StylePolicy, matched: &mut Vec<Rule>) {
    let Some(parent) = tree.parent(h) else {
        return;
    };
    let Some(sr) = tree.shadow_root(parent) else {
        return;
    };
    let nav = ScopedNavigator::new(LiveNavigator(tree), sr, Some(sr));
    for r in shadow_rules(tree, sr, policy) {
        if r.parsed.pseudo_element() == Some("slotted") && r.matches_with_nav(&nav, h) {
            matched.push(r);
        }
    }
}

fn apply_inline_overrides(
    tree: &Tree,
    h: Handle,
    policy: &StylePolicy,
    map: &mut HashMap<String, String>,
) {
    let inline = policy
        .inline_overrides
        .get(&h)
        .map(String::as_str)
        .or_else(|| tree.get_attribute(h, "style"));
    if let Some(inline) = inline {
        if !policy.blocked_inline.contains(&h) && !inline.is_empty() {
            let inline = inline.to_string();
            parse_decls(&inline, map);
        }
    }
}

fn apply_inheritance(
    tree: &Tree,
    h: Handle,
    policy: &StylePolicy,
    map: &mut HashMap<String, String>,
) {
    let Some(parent) = flattened_parent(tree, h) else {
        return;
    };
    let ps = computed_style_with_policy(tree, parent, policy);
    for prop in INHERITED {
        if !map.contains_key(*prop) {
            let pv = lookup(&ps, prop);
            if !pv.is_empty() {
                map.insert((*prop).to_string(), pv);
            }
        }
    }
}

/// Apply host-authorized stylesheet and inline-style exclusions to the same native cascade.
pub fn computed_style_with_policy(
    tree: &Tree,
    h: Handle,
    policy: &StylePolicy,
) -> HashMap<String, String> {
    let mut map: HashMap<String, String> = HashMap::new();
    if tree.node_type(h) != NodeType::Element {
        return map;
    }

    let light_rules = match prepare_cascade_cache(tree, h, policy) {
        PrepareOutcome::Cached(cached) => return cached,
        PrepareOutcome::Rules(rules) => rules,
    };

    let mut matched = Vec::new();
    collect_shadow_and_light_matches(tree, h, policy, &light_rules, &mut matched);
    apply_matched(&mut matched, &mut map);
    apply_inline_overrides(tree, h, policy, &mut map);
    apply_inheritance(tree, h, policy, &mut map);

    // memoize for this (handle, version) — inheritance recursion + repeat calls hit this.
    let result = std::rc::Rc::new(map);
    tree.css_cache
        .borrow_mut()
        .computed
        .insert(h, result.clone());
    (*result).clone()
}

/// Resolve one property from a computed-style map — `""` for absent (honest).
#[must_use]
pub fn get_property_value(map: &HashMap<String, String>, prop: &str) -> String {
    lookup(map, &prop.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rtdom::tree::Tree;

    fn gcs_prop(html: &str, selector: &str, prop: &str) -> String {
        let tree = Tree::parse(html);
        let h = tree.query_selector_all(selector)[0];
        let map = computed_style(&tree, h);
        get_property_value(&map, prop)
    }

    /// turbo-surf#117: one rule with an unknown pseudo-class is dropped on its own; the
    /// valid rules around it (Google's view-transition ones among them) still apply.
    #[test]
    fn invalid_rule_is_dropped_and_valid_rules_apply() {
        let css = "<style>#x{color:green;padding-left:1px} html:bogus #x{color:red} \
                   html:active-view-transition-type(aimc) #x{color:red} \
                   html:active-view-transition-type(aimc)::view-transition-new(sb):only-child{color:red} \
                   #x{padding-left:2px}</style><div id=x>hi</div>";
        assert_eq!(gcs_prop(css, "#x", "color"), "rgb(0, 128, 0)");
        assert_eq!(gcs_prop(css, "#x", "padding-left"), "2px");
    }

    #[test]
    fn a_parentless_element_resolves_its_own_inline_style() {
        // A detached element (no parent, so no shadow host to take `::slotted` rules
        // from and nothing to inherit) still resolves its inline declarations, and only
        // those: the body's inherited colour does not reach it.
        let mut tree = Tree::parse("<body style=\"color:blue\"></body>");
        let el = tree.create_element("div");
        tree.set_attribute(el, "style", "color:red;padding-left:3px");
        let map = computed_style(&tree, el);
        assert_eq!(get_property_value(&map, "color"), "rgb(255, 0, 0)");
        assert_eq!(get_property_value(&map, "padding-left"), "3px");
        assert_eq!(get_property_value(&map, "font-size"), "");
    }

    #[test]
    fn inline_color_canonicalized() {
        // (a) inline style="color:red" → rgb(255, 0, 0)
        let got = gcs_prop("<div id=x style=\"color:red\">hi</div>", "#x", "color");
        assert_eq!(got, "rgb(255, 0, 0)");
    }

    #[test]
    fn parsed_rules_survive_version_bumps_until_css_changes() {
        // The parsed rule index must be reused across DOM version bumps whose <style> source is
        // unchanged (the hot React-re-render path), and re-parsed only when the CSS actually
        // changes. Rc::ptr_eq proves reuse vs. rebuild without a parse counter.
        let mut tree = Tree::parse("<style>#x{color:green}</style><div id=x>hi</div>");
        let x = tree.query_selector("#x").unwrap();
        assert_eq!(
            get_property_value(&computed_style(&tree, x), "color"),
            "rgb(0, 128, 0)"
        );
        let rules_before = tree.css_cache.borrow().rules.clone().unwrap();

        // Mutate the DOM (bumps version) WITHOUT touching the stylesheet.
        tree.set_attribute(x, "data-n", "1");
        assert_eq!(
            get_property_value(&computed_style(&tree, x), "color"),
            "rgb(0, 128, 0)"
        );
        let rules_after = tree.css_cache.borrow().rules.clone().unwrap();
        assert!(
            std::rc::Rc::ptr_eq(&rules_before, &rules_after),
            "rule index re-parsed even though the <style> source was unchanged"
        );

        // Now edit the stylesheet itself — the index MUST be re-parsed and the result change.
        let style_h = tree.query_selector("style").unwrap();
        tree.set_text_content(style_h, "#x{color:red}");
        assert_eq!(
            get_property_value(&computed_style(&tree, x), "color"),
            "rgb(255, 0, 0)"
        );
        let rules_edited = tree.css_cache.borrow().rules.clone().unwrap();
        assert!(
            !std::rc::Rc::ptr_eq(&rules_before, &rules_edited),
            "stylesheet edit did not invalidate the parsed rule index"
        );
    }

    #[test]
    fn cssom_inserted_style_rules_join_and_invalidate_the_cascade() {
        let mut tree = Tree::parse("<style id=sheet></style><div id=target></div>");
        let sheet = tree.get_element_by_id("sheet").unwrap();
        let target = tree.get_element_by_id("target").unwrap();
        assert_eq!(
            tree.insert_style_rule(sheet, "#target { color: red; }", 0),
            Some(0)
        );
        assert_eq!(
            get_property_value(&computed_style(&tree, target), "color"),
            "rgb(255, 0, 0)"
        );
        assert_eq!(
            tree.insert_style_rule(sheet, "#target { color: blue; }", 1),
            Some(1)
        );
        assert_eq!(
            get_property_value(&computed_style(&tree, target), "color"),
            "rgb(0, 0, 255)"
        );
        assert!(tree.delete_style_rule(sheet, 1));
        assert_eq!(
            get_property_value(&computed_style(&tree, target), "color"),
            "rgb(255, 0, 0)"
        );
        assert!(!tree.delete_style_rule(sheet, 4));
        assert_eq!(
            tree.insert_style_rule(target, "#target { color: green; }", 0),
            None
        );
    }

    #[test]
    fn cssom_rule_indexes_include_authored_rules_and_text_edits_reset_the_sheet() {
        let mut tree = Tree::parse(
            "<style id=sheet>#target{color:red} #target{background-color:black}</style><div id=target></div>",
        );
        let sheet = tree.get_element_by_id("sheet").unwrap();
        let target = tree.get_element_by_id("target").unwrap();
        assert_eq!(
            tree.insert_style_rule(sheet, "#target{color:blue}", 1),
            Some(1)
        );
        assert_eq!(
            get_property_value(&computed_style(&tree, target), "color"),
            "rgb(0, 0, 255)"
        );
        assert!(tree.delete_style_rule(sheet, 1));
        assert_eq!(
            get_property_value(&computed_style(&tree, target), "color"),
            "rgb(255, 0, 0)"
        );

        tree.insert_style_rule(sheet, "#target{color:blue}", 1);
        tree.set_text_content(sheet, "#target{color:green}");
        assert_eq!(
            get_property_value(&computed_style(&tree, target), "color"),
            "rgb(0, 128, 0)"
        );

        tree.set_text_content(sheet, "");
        let nested = tree.create_element("span");
        let text = tree.create_text_node("#target{color:orange}");
        tree.append_child(nested, text);
        tree.append_child(sheet, nested);
        tree.insert_style_rule(sheet, "#target{color:blue}", 1);
        assert_eq!(
            get_property_value(&computed_style(&tree, target), "color"),
            "rgb(0, 0, 255)"
        );
        tree.set_node_value(text, "#target{color:purple}");
        assert_eq!(
            get_property_value(&computed_style(&tree, target), "color"),
            "rgb(128, 0, 128)"
        );
    }

    #[test]
    fn shadow_host_slotted_and_inheritance() {
        // host with a shadow root: :host styles host, a shadow-internal element
        // gets shadow <style> rules, ::slotted styles distributed light nodes,
        // and inheritance hops shadow-root→host.
        let mut tree = Tree::parse("<my-box style=\"color:green\"><span slot=t>S</span></my-box>");
        let host = tree.query_selector("my-box").unwrap();
        let sr = tree.attach_shadow(host);
        tree.set_inner_html(
            sr,
            "<style>:host{padding:4px} :host(.host) slot{padding-top:2px} :host-context(body) slot{margin-top:3px} p{color:blue} ::slotted(span){font-weight:bold}</style><p>inner</p><slot name=t></slot>",
        );
        tree.set_attribute(host, "class", "host");

        // :host applies to the host
        let host_cs = computed_style(&tree, host);
        assert_eq!(get_property_value(&host_cs, "padding"), "4px");

        // shadow-internal <p> matches the shadow's `p{color:blue}`
        let p = tree
            .descendants(sr)
            .into_iter()
            .find(|&h| tree.local_name(h) == Some("p"))
            .unwrap();
        let p_cs = computed_style(&tree, p);
        assert_eq!(get_property_value(&p_cs, "color"), "rgb(0, 0, 255)");
        // ...and inherits color from the host across the boundary (host has color:green inline)
        let p_color_inherited = {
            // <p> sets its own color (blue), so test inheritance on a node that does NOT:
            // the slot itself inherits host green via flattened parent
            let slot = tree
                .descendants(sr)
                .into_iter()
                .find(|&h| tree.local_name(h) == Some("slot"))
                .unwrap();
            get_property_value(&computed_style(&tree, slot), "color")
        };
        assert_eq!(p_color_inherited, "rgb(0, 128, 0)"); // green from host, crossed boundary
        let slot = tree
            .descendants(sr)
            .into_iter()
            .find(|&h| tree.local_name(h) == Some("slot"))
            .unwrap();
        let slot_style = computed_style(&tree, slot);
        assert_eq!(get_property_value(&slot_style, "padding-top"), "2px");
        assert_eq!(get_property_value(&slot_style, "margin-top"), "3px");

        // ::slotted(span) styles the distributed light <span>
        let span = tree.query_selector("span").unwrap();
        let span_cs = computed_style(&tree, span);
        assert_eq!(get_property_value(&span_cs, "font-weight"), "bold");
    }

    #[test]
    fn slotted_styles_require_assignment_and_match_the_slot_selector() {
        let mut tree = Tree::parse(
            "<x-host><span slot=named class=item id=assigned></span><span slot=missing class=item id=unassigned></span></x-host>",
        );
        let host = tree
            .handles()
            .find(|&node| tree.local_name(node) == Some("x-host"))
            .unwrap();
        let root = tree.attach_shadow(host);
        tree.set_inner_html(
            root,
            "<style>.item{color:green} section > slot::slotted(.item){font-weight:bold} slot[name=missing]::slotted(.item){color:red}</style><section><slot name=named></slot></section><slot name=named></slot>",
        );
        let assigned = tree
            .children(host)
            .into_iter()
            .find(|&node| tree.get_attribute(node, "id") == Some("assigned"))
            .unwrap();
        let unassigned = tree
            .children(host)
            .into_iter()
            .find(|&node| tree.get_attribute(node, "id") == Some("unassigned"))
            .unwrap();
        assert_eq!(
            get_property_value(&computed_style(&tree, assigned), "font-weight"),
            "bold"
        );
        assert_eq!(
            get_property_value(&computed_style(&tree, assigned), "color"),
            ""
        );
        assert_eq!(
            get_property_value(&computed_style(&tree, unassigned), "font-weight"),
            ""
        );
        assert_eq!(
            get_property_value(&computed_style(&tree, unassigned), "color"),
            ""
        );
    }

    #[test]
    fn matched_class_rule_color() {
        // (b) <style>.card{color:blue}</style> + <div class=card> → blue canonicalized
        let got = gcs_prop(
            "<style>.card{color:blue}</style><div class=card>hi</div>",
            ".card",
            "color",
        );
        assert_eq!(got, "rgb(0, 0, 255)");
    }

    #[test]
    fn id_beats_class_specificity() {
        // (c) #id{color:green} beats .card{color:blue}
        let got = gcs_prop(
            "<style>.card{color:blue} #x{color:green}</style><div id=x class=card>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got, "rgb(0, 128, 0)"); // green
    }

    #[test]
    fn inheritance_cascades_color() {
        // (d) body{color:red} cascades to a child <p> (color in INHERITED)
        let got = gcs_prop(
            "<style>body{color:red}</style><body><p id=p>hi</p></body>",
            "#p",
            "color",
        );
        assert_eq!(got, "rgb(255, 0, 0)");
    }

    #[test]
    fn unmatched_prop_empty() {
        // (e) unmatched prop → ""
        let got = gcs_prop(
            "<div id=x style=\"color:red\">hi</div>",
            "#x",
            "font-weight",
        );
        assert_eq!(got, "");
    }

    #[test]
    fn bare_zero_length_to_px() {
        // (f) bare-0 length → 0px
        let got = gcs_prop("<div id=x style=\"margin:0\">hi</div>", "#x", "margin-top");
        assert_eq!(got, "0px");
    }

    #[test]
    fn rules_carry_selectors_4_specificity() {
        // each rule's specificity is parse_for_cascade's (miaskiewicz/turbo-dom#24 item 2),
        // not a per-token count of `#` / `.` / `:` / `[` / type names
        let mut rules = Vec::new();
        parse_stylesheet(
            "#id, .card, div, div .card span { a: 1 } \
             :where(#a) p, :is(#a, .b), :not(.x, #y), p:has(> .a), :nth-child(2 of #a, .b) { a: 1 } \
             .md\\:x, [title=\"#t\"], div :is(i), [data-x], p::before { a: 1 }",
            0,
            &mut rules,
        );
        let specs: Vec<(&str, Specificity)> =
            rules.iter().map(|r| (r.parsed.text(), r.spec)).collect();
        assert_eq!(
            specs,
            [
                ("#id", (1, 0, 0)),
                (".card", (0, 1, 0)),
                ("div", (0, 0, 1)),
                ("div .card span", (0, 1, 2)),
                (":where(#a) p", (0, 0, 1)),
                (":is(#a, .b)", (1, 0, 0)),
                (":not(.x, #y)", (1, 0, 0)),
                ("p:has(> .a)", (0, 1, 1)),
                (":nth-child(2 of #a, .b)", (1, 1, 0)),
                (".md\\:x", (0, 1, 0)),
                ("[title=\"#t\"]", (0, 1, 0)),
                ("div :is(i)", (0, 0, 2)),
                ("[data-x]", (0, 1, 0)),
                ("p::before", (0, 0, 2)),
            ]
        );
        // lexicographic: one id beats any number of classes
        assert!((1, 0, 0) > (0, 99, 99));
    }

    #[test]
    fn equal_specificity_falls_back_to_source_order() {
        // `:where()` adds nothing and `:not(.zz)` counts its argument once, so the later rule
        // of equal specificity wins (Chrome 156: cascade_cases/specificity-*)
        let html = "<style>:where(#x) p { color: red } p { color: blue } \
                    #y:not(.zz) { color: red } #y.k { color: green }</style>\
                    <div id=x><p>a</p><p id=y class=k>b</p></div>";
        assert_eq!(gcs_prop(html, "#x > p", "color"), "rgb(0, 0, 255)");
        assert_eq!(gcs_prop(html, "#y", "color"), "rgb(0, 128, 0)");
    }

    #[test]
    fn kebab_camel_to_kebab() {
        // direct: camelCase → kebab (parity helper, only ever fed from the JS proxy)
        assert_eq!(kebab("backgroundColor"), "background-color");
        assert_eq!(kebab("color"), "color"); // already lowercase, no dashes
        assert_eq!(kebab("WebkitBoxShadow"), "-webkit-box-shadow");
    }

    #[test]
    fn looks_like_width_token_keywords_and_units() {
        // keyword widths
        assert!(looks_like_width_token("thin"));
        assert!(looks_like_width_token("medium"));
        assert!(looks_like_width_token("thick"));
        // numeric with units
        assert!(looks_like_width_token("1px"));
        assert!(looks_like_width_token("2.5em"));
        assert!(looks_like_width_token("0"));
        assert!(looks_like_width_token("50%"));
        // not numeric → false (no leading numeric part)
        assert!(!looks_like_width_token("red"));
        // numeric but unknown unit → false (rest not in units)
        assert!(!looks_like_width_token("10foo"));
    }

    #[test]
    fn border_shorthand_assembles_longhands() {
        // border: 1px solid red → border-width/style/color + per-side widths
        let mut map = HashMap::new();
        set_prop(&mut map, "border", "1px solid red");
        assert_eq!(map.get("border-width").unwrap(), "1px");
        assert_eq!(map.get("border-top-width").unwrap(), "1px");
        assert_eq!(map.get("border-left-width").unwrap(), "1px");
        assert_eq!(map.get("border-style").unwrap(), "solid");
        assert_eq!(map.get("border-color").unwrap(), "red");
        // through gcs: border-style resolves
        let got = gcs_prop(
            "<div id=x style=\"border:2px dashed blue\">hi</div>",
            "#x",
            "border-style",
        );
        assert_eq!(got, "dashed");
    }

    #[test]
    fn background_single_token_shorthand_to_color() {
        // background:red (no whitespace) → background-color fallback via lookup
        let got = gcs_prop(
            "<div id=x style=\"background:red\">hi</div>",
            "#x",
            "background-color",
        );
        assert_eq!(got, "rgb(255, 0, 0)");
    }

    #[test]
    fn strip_comments_and_multibyte() {
        // CSS comment is stripped; a multibyte char survives (utf8_len path)
        let got = gcs_prop(
            "<style>/* note: \u{00e9}\u{4e2d} */ #x { color: red }</style><div id=x>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got, "rgb(255, 0, 0)");
        // multibyte content selector text after a comment — content="café" 中
        let got2 = gcs_prop(
            "<style>/* x */ .caf\u{00e9} { color: blue }</style><div id=x class=\"caf\u{00e9}\">hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got2, "rgb(0, 0, 255)");
    }

    #[test]
    fn at_rule_and_stray_brace_skipped() {
        // @media body is skipped wholesale; the trailing real rule still applies.
        let got = gcs_prop(
            "<style>@media (max-width:600px){ #x{color:red} } #x{color:green}</style><div id=x>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got, "rgb(0, 128, 0)"); // green from the depth-1 rule, not the @media one
                                           // a stray leading `}` (depth underflow) is skipped, real rule still parses
        let got2 = gcs_prop(
            "<style>} #x{color:blue}</style><div id=x>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got2, "rgb(0, 0, 255)");
    }

    #[test]
    fn statement_at_rule_does_not_swallow_following_rule() {
        // A `;`-terminated statement at-rule (@import / @charset / @namespace) has no
        // block. The rule that follows it must still apply — only the at-statement is
        // skipped, not the next real selector.
        let got = gcs_prop(
            "<style>@import url(\"reset.css\"); #x{color:green}</style><div id=x>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got, "rgb(0, 128, 0)");
        // @charset followed immediately by a rule
        let got2 = gcs_prop(
            "<style>@charset \"utf-8\"; .card{color:blue}</style><div id=x class=card>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got2, "rgb(0, 0, 255)");
        // a block at-rule (@media) is still skipped wholesale, and a statement at-rule
        // BEFORE it does not disturb the later depth-1 rule
        let got3 = gcs_prop(
            "<style>@import url(a); @media print { #x{color:red} } #x{color:green}</style><div id=x>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got3, "rgb(0, 128, 0)");
    }

    #[test]
    fn trailing_selector_without_brace_breaks() {
        // a selector with no `{` (j reaches n) breaks the scan; earlier rule applied.
        let got = gcs_prop(
            "<style>#x{color:red} #y</style><div id=x>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got, "rgb(255, 0, 0)");
    }

    /// turbo-dom#18 (P5b): a rule's selector list splits at top-level commas only, an
    /// invalid list drops the whole rule, and items match with stylesheet semantics.
    #[test]
    fn selector_lists_split_at_top_level_commas_and_invalid_rules_drop() {
        let html = "<style>:is(.a, .b) { color: red } :not(.a, .c) { order: 2 } \
                    .c, :bogus { color: blue } [title=\"x,y\"], #n { width: 1px } \
                    :scope > body { margin: 3px }</style>\
                    <p class=b id=p title=\"x,y\">x</p><p class=c id=c>c</p>";
        assert_eq!(gcs_prop(html, "#p", "color"), "rgb(255, 0, 0)");
        assert_eq!(gcs_prop(html, "#p", "order"), "2");
        assert_eq!(
            gcs_prop(html, "#c", "color"),
            "",
            "the invalid list drops .c too"
        );
        assert_eq!(gcs_prop(html, "#c", "order"), "");
        assert_eq!(gcs_prop(html, "#p", "width"), "1px");
        assert_eq!(gcs_prop(html, "body", "margin"), "3px", ":scope is :root");
    }

    #[test]
    fn shadow_only_selector_does_not_match_light_dom() {
        // light-DOM element: a `:host` rule in a doc <style> must NOT match it.
        let got = gcs_prop(
            "<style>:host{color:red} #x{color:green}</style><div id=x>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got, "rgb(0, 128, 0)"); // green wins; :host has no shadow scope
    }

    #[test]
    fn normalize_font_family_comma_spacing() {
        // through lookup/gcs: comma spacing canonicalized to ", "
        let got = gcs_prop(
            "<div id=x style='font-family: \"Helvetica Neue\",Arial , sans-serif'>hi</div>",
            "#x",
            "font-family",
        );
        assert_eq!(got, "\"Helvetica Neue\", Arial, sans-serif");
        // direct helper
        assert_eq!(normalize_font_family("a ,b"), "a, b");
        assert_eq!(normalize_font_family("solo"), "solo");
    }

    #[test]
    fn margin_shorthand_fallback_via_lookup() {
        // margin-top resolves via the margin shorthand longhand expansion
        let got = gcs_prop(
            "<div id=x style=\"margin:10px 20px\">hi</div>",
            "#x",
            "margin-top",
        );
        assert_eq!(got, "10px");
    }

    #[test]
    fn get_property_value_mixed_case_prop() {
        // get_property_value lowercases the requested prop name
        let tree = Tree::parse("<div id=x style=\"color:red\">hi</div>");
        let h = tree.query_selector_all("#x")[0];
        let map = computed_style(&tree, h);
        assert_eq!(get_property_value(&map, "COLOR"), "rgb(255, 0, 0)");
        assert_eq!(get_property_value(&map, "Color"), "rgb(255, 0, 0)");
    }

    #[test]
    fn important_stripped() {
        // !important is stripped from the value (strip_important branch)
        let got = gcs_prop(
            "<div id=x style=\"color:red !important\">hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got, "rgb(255, 0, 0)");
        // direct helper coverage of the matched branch + the non-important passthrough
        assert_eq!(strip_important("10px ! important"), "10px");
        assert_eq!(strip_important("10px"), "10px");
    }

    #[test]
    fn parse_decls_skips_malformed() {
        // a decl with no colon is skipped, and an empty-name decl is skipped;
        // the valid one still applies.
        let got = gcs_prop(
            "<div id=x style=\"garbage; :nope; color:red\">hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got, "rgb(255, 0, 0)");
    }

    #[test]
    fn utf8_len_three_and_four_byte() {
        // direct helper: 1/2/3/4-byte lead bytes
        assert_eq!(utf8_len(b'a'), 1);
        assert_eq!(utf8_len(0xC3), 2); // é lead
        assert_eq!(utf8_len(0xE4), 3); // 中 lead
        assert_eq!(utf8_len(0xF0), 4); // 😀 lead
                                       // and through strip_comments: a 4-byte emoji outside a comment survives
        let got = gcs_prop(
            "<style>/* c */ #x{content:\"\u{1F600}\"; color:red}</style><div id=x>hi</div>",
            "#x",
            "color",
        );
        assert_eq!(got, "rgb(255, 0, 0)");
    }

    #[test]
    fn lookup_shorthand_fallback_accepts_singletoken() {
        // Direct lookup with a hand-built map that has the single-token shorthand
        // present but the longhand ABSENT — exercises the fallback success branch.
        // (In the full pipeline set_prop pre-expands single-token shorthands, so
        // this state only arises by direct construction.)
        let mut map = HashMap::new();
        map.insert("margin".to_string(), "7px".to_string());
        assert_eq!(lookup(&map, "margin-top"), "7px");
    }

    #[test]
    fn shorthand_fallback_rejects_multitoken() {
        // background:red url(x) (whitespace) → background-color fallback REJECTED,
        // so background-color reads "" (lookup 486-487 false branch).
        let got = gcs_prop(
            "<div id=x style=\"background:red url(x.png)\">hi</div>",
            "#x",
            "background-color",
        );
        assert_eq!(got, "");
    }

    #[test]
    fn non_element_node_empty_map() {
        // computed_style on a non-element (text node) returns an empty map
        let tree = Tree::parse("<div id=x>hello</div>");
        let div = tree.query_selector_all("#x")[0];
        let text = tree
            .descendants(div)
            .into_iter()
            .find(|&h| tree.node_type(h) != NodeType::Element);
        if let Some(t) = text {
            let map = computed_style(&tree, t);
            assert!(map.is_empty());
        }
    }
}
#[test]
fn host_style_policy_filters_cascade_and_inheritance_without_mutating_dom() {
    let tree=Tree::parse("<style>.child { color: red; }</style><div style='visibility:hidden;color:blue'><span class='child'></span></div>");
    let style = tree.get_elements_by_tag_name("style")[0];
    let parent = tree.get_elements_by_tag_name("div")[0];
    let child = tree.get_elements_by_tag_name("span")[0];
    let mut policy = StylePolicy::default();
    assert_eq!(
        get_property_value(
            &computed_style_with_policy(&tree, child, &policy),
            "visibility"
        ),
        "hidden"
    );
    assert_eq!(
        get_property_value(&computed_style_with_policy(&tree, child, &policy), "color"),
        "rgb(255, 0, 0)"
    );
    policy.blocked_stylesheets.insert(style);
    assert_eq!(
        get_property_value(&computed_style_with_policy(&tree, child, &policy), "color"),
        "rgb(0, 0, 255)"
    );
    policy.blocked_inline.insert(parent);
    let filtered = computed_style_with_policy(&tree, child, &policy);
    assert_eq!(get_property_value(&filtered, "color"), "");
    assert_eq!(get_property_value(&filtered, "visibility"), "");
    assert_eq!(
        tree.get_attribute(parent, "style"),
        Some("visibility:hidden;color:blue")
    );
    assert_eq!(tree.text_content(style), ".child { color: red; }");
    policy.blocked_inline.remove(&parent);
    policy
        .inline_overrides
        .insert(parent, "color:green;visibility:visible".into());
    let applied = computed_style_with_policy(&tree, child, &policy);
    assert_eq!(get_property_value(&applied, "color"), "rgb(0, 128, 0)");
    assert_eq!(get_property_value(&applied, "visibility"), "visible");

    assert_eq!(
        get_property_value(&computed_style(&tree, child), "color"),
        "rgb(255, 0, 0)"
    );
}
