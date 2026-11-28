//! SVG DOM-property surface — pure-Rust port of `src/runtime/svg.mjs`.
//!
//! In JS these are live wrapper objects (`SVGAnimatedLength` `.baseVal.value`,
//! `SVGAnimatedString` className, `SVGAnimatedRect` viewBox) that read/write the
//! underlying attribute on demand — HONEST + LIVE, no cached snapshot, no
//! animation engine (animVal === baseVal). The native Rust API exposes the
//! same surface as plain FUNCTIONS that read the live attribute off the tree:
//!   * `length_value` = `SVGAnimatedLength` `.baseVal.value` (a number),
//!   * `class_name`   = `SVGAnimatedString` `.baseVal`,
//!   * `view_box`     = `SVGAnimatedRect` `.baseVal` as (x, y, width, height).
//!
//! Only meaningful on svg-namespace elements; HTML elements are unaffected.

use super::tree::{Handle, Namespace, Tree};

/// Attributes that surface as `SVGAnimatedLength` on SVG elements. Exact list
/// mirrored from `svg.mjs` `SVG_LENGTH_ATTRS`.
pub const SVG_LENGTH_ATTRS: &[&str] = &[
    "width",
    "height",
    "x",
    "y",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "x1",
    "y1",
    "x2",
    "y2",
    "dx",
    "dy",
    "fx",
    "fy",
    "refX",
    "refY",
    "markerWidth",
    "markerHeight",
    "startOffset",
    "textLength",
];

/// True if `name` is one of the SVG geometry attributes (`SVGAnimatedLength`).
#[inline]
#[must_use]
pub fn is_length_attr(name: &str) -> bool {
    SVG_LENGTH_ATTRS.contains(&name)
}

/// True if `h` is an svg-namespace element.
#[inline]
pub fn is_svg(tree: &Tree, h: Handle) -> bool {
    tree.namespace(h) == Namespace::Svg
}

/// Leading-numeric float parse mirroring JS `parseFloat`: consumes an optional
/// sign, digits, a single decimal point, more digits, and an optional exponent,
/// stopping at the first char that can't extend the number (so "50px" -> 50.0,
/// "10%" -> 10.0, "100" -> 100.0). Returns None if no number leads the string.
fn parse_leading_float(s: &str) -> Option<f64> {
    let bytes = s.as_bytes();
    let mut i = 0;
    let n = bytes.len();
    while i < n && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    let start = i;
    if i < n && (bytes[i] == b'+' || bytes[i] == b'-') {
        i += 1;
    }
    let mut saw_digit = consume_digits_svg(bytes, &mut i, false);
    if i < n && bytes[i] == b'.' {
        i += 1;
        saw_digit = consume_digits_svg(bytes, &mut i, saw_digit);
    }
    if !saw_digit {
        return None;
    }
    try_consume_svg_exponent(bytes, &mut i);
    s[start..i].parse::<f64>().ok()
}

fn consume_digits_svg(bytes: &[u8], i: &mut usize, mut saw: bool) -> bool {
    while *i < bytes.len() && bytes[*i].is_ascii_digit() {
        *i += 1;
        saw = true;
    }
    saw
}

fn try_consume_svg_exponent(bytes: &[u8], i: &mut usize) {
    if *i >= bytes.len() {
        return;
    }
    if !matches!(bytes[*i], b'e' | b'E') {
        return;
    }
    let mut j = *i + 1;
    if j < bytes.len() && matches!(bytes[j], b'+' | b'-') {
        j += 1;
    }
    let exp_start = j;
    while j < bytes.len() && bytes[j].is_ascii_digit() {
        j += 1;
    }
    if j > exp_start {
        *i = j;
    }
}

/// `SVGAnimatedLength` `.baseVal.value` for `attr` on `h`. Parses the live
/// attribute to a number, stripping units ("50px" -> 50.0, "10%" -> 10.0).
/// None if the attribute is absent. (JS coerces a NaN parse to 0 for an
/// existing-but-unparseable attr; here an unparseable value also yields None
/// only when absent — present-but-garbage parses as None, callers default 0.)
pub fn length_value(tree: &Tree, h: Handle, attr: &str) -> Option<f64> {
    let raw = tree.get_attribute(h, attr)?;
    Some(parse_leading_float(raw).unwrap_or(0.0))
}

/// `SVGAnimatedString` `.baseVal` — the `class` attribute, "" if absent.
pub fn class_name(tree: &Tree, h: Handle) -> String {
    tree.get_attribute(h, "class").unwrap_or("").to_string()
}

/// `SVGAnimatedRect` `.baseVal` for `viewBox` — "minX minY width height"
/// (whitespace/comma separated). None if absent or malformed (< 4 numbers).
pub fn view_box(tree: &Tree, h: Handle) -> Option<(f64, f64, f64, f64)> {
    let raw = tree.get_attribute(h, "viewBox")?;
    let mut it = raw
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .map(|p| parse_leading_float(p).unwrap_or(0.0));
    let x = it.next()?;
    let y = it.next()?;
    let w = it.next()?;
    let hgt = it.next()?;
    Some((x, y, w, hgt))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rtdom::tree::Tree;

    fn find_local(tree: &Tree, name: &str) -> Handle {
        for h in tree.handles() {
            if tree.local_name(h) == Some(name) {
                return h;
            }
        }
        panic!("element <{name}> not found");
    }

    #[test]
    fn svg_length_viewbox_and_html_negative() {
        let tree = Tree::parse(
            r#"<svg viewBox="0 0 100 50"><rect width=20 height="10px" x=5/></svg><div class="d"></div>"#,
        );
        let rect = find_local(&tree, "rect");
        let svg = find_local(&tree, "svg");
        let div = find_local(&tree, "div");

        assert!(is_svg(&tree, rect), "rect should be svg-namespaced");
        assert!(is_svg(&tree, svg), "svg should be svg-namespaced");
        assert_eq!(length_value(&tree, rect, "width"), Some(20.0));
        assert_eq!(length_value(&tree, rect, "height"), Some(10.0)); // "10px" -> 10.0
        assert_eq!(length_value(&tree, rect, "x"), Some(5.0));
        assert_eq!(view_box(&tree, svg), Some((0.0, 0.0, 100.0, 50.0)));

        // HTML div: not svg, geometry attr absent -> None.
        assert!(!is_svg(&tree, div), "div should not be svg-namespaced");
        assert_eq!(length_value(&tree, div, "width"), None);
        assert_eq!(view_box(&tree, div), None);
    }

    #[test]
    fn length_attr_helper_and_coercion() {
        assert!(is_length_attr("width"));
        assert!(is_length_attr("markerWidth"));
        assert!(!is_length_attr("fill"));
        assert_eq!(parse_leading_float("100"), Some(100.0));
        assert_eq!(parse_leading_float("50px"), Some(50.0));
        assert_eq!(parse_leading_float("10%"), Some(10.0));
        assert_eq!(parse_leading_float("-3.5em"), Some(-3.5));
        assert_eq!(parse_leading_float("abc"), None);
    }

    #[test]
    fn parse_float_exponent_whitespace_and_edges() {
        let tree =
            Tree::parse("<svg viewBox='1 2 3'><rect width=' 1.5e3' x='abc' y='-2.5e+1'/></svg>");
        let rect = find_local(&tree, "rect");
        assert_eq!(length_value(&tree, rect, "width"), Some(1500.0)); // leading ws + exponent
        assert_eq!(length_value(&tree, rect, "y"), Some(-25.0)); // signed exponent
        assert_eq!(length_value(&tree, rect, "x"), Some(0.0)); // present-but-garbage → 0
        assert_eq!(length_value(&tree, rect, "height"), None); // absent
        let svg = find_local(&tree, "svg");
        assert_eq!(view_box(&tree, svg), None); // only 3 numbers → None
        assert!(is_length_attr("width") && !is_length_attr("fill"));
    }

    #[test]
    fn class_name_and_viewbox_commas() {
        let tree = Tree::parse(r#"<svg class="icon" viewBox="0,0,16,16"></svg>"#);
        let svg = find_local(&tree, "svg");
        assert_eq!(class_name(&tree, svg), "icon");
        assert_eq!(view_box(&tree, svg), Some((0.0, 0.0, 16.0, 16.0)));
    }
}
