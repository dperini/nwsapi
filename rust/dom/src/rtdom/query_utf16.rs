//! Parse original DOM string units into native selector records. Identifiers use
//! CSS replacement rules; raw quoted attribute strings preserve their units.
use super::prepared::PreparedList;
use super::{
    bounded_insert, custom_combinator_symbol, explicit_combinator, nth_of_position, parse_nth,
    parse_pseudo, valid_anb, Attr, AttrMatch, AttributeNamespace, Combinator, Complex, Compound,
    CompoundPart, Handle, NodeType, Pseudo, RelativeSelector, Tree, TypeNamespace,
};
#[derive(Debug, Clone)]
pub(super) struct UnitAttrMatch {
    op: u16,
    value: Vec<u16>,
    insensitive: bool,
    sensitive: bool,
    extension: Option<super::extensions::AttributeCallback>,
}
impl UnitAttrMatch {
    pub(super) fn operator(&self) -> u16 {
        self.op
    }

    pub(super) fn is_plain_equals_one(&self) -> bool {
        self.op == 61
            && self.value.as_slice() == [49]
            && !self.insensitive
            && !self.sensitive
            && self.extension.is_none()
    }

    pub(super) fn scalar(source: &AttrMatch) -> Self {
        let (op, value) = match source {
            AttrMatch::Present => (0, ""),
            AttrMatch::Equals(value) => (61, value.as_str()),
            AttrMatch::Includes(value) => (126, value.as_str()),
            AttrMatch::Prefix(value) => (94, value.as_str()),
            AttrMatch::Suffix(value) => (36, value.as_str()),
            AttrMatch::Substr(value) => (42, value.as_str()),
            AttrMatch::Units(_) => unreachable!("only scalar records are converted"),
        };
        Self {
            op,
            value: value.encode_utf16().collect(),
            insensitive: false,
            sensitive: false,
            extension: None,
        }
    }

    pub(super) fn bind_operator(
        &mut self,
        operators: &rustc_hash::FxHashMap<u16, super::extensions::AttributeCallback>,
    ) {
        if custom_operator_symbol(self.op) {
            self.extension = operators.get(&self.op).cloned();
        }
    }

    pub(super) fn supported_host_attribute(&self, name: &str) -> bool {
        if name.contains(':') {
            return false;
        }
        if custom_operator_symbol(self.op) {
            return self.extension.is_some();
        }
        if self.op == 0 {
            return true;
        }
        let _ = name;
        self.insensitive || !self.sensitive || self.value.iter().all(|&unit| unit <= 127)
    }

    pub(super) fn has_bound_operator(&self) -> bool {
        self.extension.is_some()
    }

    pub(super) fn unresolved_operator(&self) -> bool {
        custom_operator_symbol(self.op) && self.extension.is_none()
    }

    pub(super) fn matches(&self, got: &[u16]) -> bool {
        self.matches_case(got, false)
    }
    pub(super) fn matches_case(&self, got: &[u16], implicit: bool) -> bool {
        let value = &self.value;
        let insensitive = self.insensitive || (implicit && !self.sensitive);
        let equal = |a: &[u16], b: &[u16]| equal_units(a, b, insensitive);
        match self.op {
            0 => true,
            61 => equal(got, value),
            94 => !value.is_empty() && got.get(..value.len()).is_some_and(|a| equal(a, value)),
            36 => {
                !value.is_empty()
                    && got
                        .get(got.len().saturating_sub(value.len())..)
                        .is_some_and(|a| equal(a, value))
            }
            42 => !value.is_empty() && got.windows(value.len()).any(|a| equal(a, value)),
            126 => !value.is_empty() && got.split(|&u| whitespace(u)).any(|a| equal(a, value)),
            124 => {
                equal(got, value)
                    || (got.get(value.len()) == Some(&45)
                        && got.get(..value.len()).is_some_and(|a| equal(a, value)))
            }
            _ => self
                .extension
                .as_ref()
                .is_some_and(|predicate| predicate.matches(got, value, insensitive)),
        }
    }

    /// Preserve NWSAPI v3's HTML DOM behavior for regexp-backed attribute
    /// operators. Its generated matcher passes a missing `getAttribute()`
    /// result directly to `RegExp.test`, which JavaScript coerces to `"null"`.
    /// This quirk is limited to host HTML snapshots; XML and Rust-owned trees
    /// continue to use ordinary selector semantics.
    pub(super) fn matches_missing_html(&self, implicit: bool) -> bool {
        // Presence and equality use direct comparisons. The standard ~= path
        // wraps the reader in `(value || "")`; it sees an empty string for
        // absence. Prefix/suffix/substring/dash-match and custom operators
        // pass null directly to RegExp.test, which coerces it to "null".
        if self.extension.is_none() && !matches!(self.op, 94 | 36 | 42 | 124) {
            return false;
        }
        self.matches_case(&[110, 117, 108, 108], implicit)
    }
}
// The v3 HTML attribute table in src/core/initialize/runtime.mts.
pub(super) fn v3_default_insensitive(name: &str) -> bool {
    matches!(
        name,
        "accept"
            | "accept-charset"
            | "align"
            | "alink"
            | "axis"
            | "bgcolor"
            | "charset"
            | "checked"
            | "clear"
            | "codetype"
            | "color"
            | "compact"
            | "declare"
            | "defer"
            | "dir"
            | "direction"
            | "disabled"
            | "enctype"
            | "face"
            | "frame"
            | "hreflang"
            | "http-equiv"
            | "lang"
            | "language"
            | "link"
            | "media"
            | "method"
            | "multiple"
            | "nohref"
            | "noresize"
            | "noshade"
            | "nowrap"
            | "readonly"
            | "rel"
            | "rev"
            | "rules"
            | "scope"
            | "scrolling"
            | "selected"
            | "shape"
            | "target"
            | "text"
            | "type"
            | "valign"
            | "valuetype"
            | "vlink"
    )
}
fn equal_units(a: &[u16], b: &[u16], insensitive: bool) -> bool {
    a.len() == b.len()
        && a.iter().zip(b).all(|(&a, &b)| {
            let fold = |u| {
                if insensitive && (65..=90).contains(&u) {
                    u + 32
                } else {
                    u
                }
            };
            fold(a) == fold(b)
        })
}
fn whitespace(unit: u16) -> bool {
    matches!(unit, 9 | 10 | 12 | 13 | 32)
}
pub(super) fn has_class_units(got: &[u16], value: &[u16]) -> bool {
    !value.is_empty()
        && got
            .split(|&unit| whitespace(unit))
            .any(|word| word == value)
}
fn trim(mut units: &[u16]) -> &[u16] {
    while units.first().is_some_and(|&u| whitespace(u)) {
        units = &units[1..];
    }
    while units.last().is_some_and(|&u| whitespace(u)) {
        units = &units[..units.len() - 1];
    }
    units
}
// Hex escapes denote Unicode scalar values. Raw quoted units take a different
// path and must not be repaired just because a DOM string is not valid UTF-8.
fn decoded(units: &[u16], quoted: bool) -> Vec<u16> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < units.len() {
        let unit = units[i];
        i += 1;
        if unit != 92 {
            out.push(if unit == 0 { 0xfffd } else { unit });
            continue;
        }
        decode_escape(units, &mut i, quoted, &mut out);
    }
    if quoted {
        out
    } else {
        String::from_utf16_lossy(&out).encode_utf16().collect()
    }
}

fn decode_escape(units: &[u16], i: &mut usize, quoted: bool, out: &mut Vec<u16>) {
    if *i == units.len() {
        if !quoted {
            out.push(0xfffd);
        }
        return;
    }
    if matches!(units[*i], 10 | 12 | 13) {
        consume_newline(units, i);
        return;
    }
    let (hex, count) = scan_hex_digits(units, i);
    if count != 0 {
        if *i < units.len() && whitespace(units[*i]) {
            consume_newline(units, i);
        }
        let scalar = char::from_u32(hex)
            .filter(|&c| c != '\0')
            .unwrap_or('\u{fffd}');
        let mut buffer = [0; 2];
        out.extend_from_slice(scalar.encode_utf16(&mut buffer));
    } else {
        out.push(units[*i]);
        *i += 1;
    }
}

/// Advance `*i` past one newline. A `\r\n` counts as one newline (skip two code units);
/// every other code unit at `*i` is treated as a single-unit newline.
fn consume_newline(units: &[u16], i: &mut usize) {
    if units[*i] == 13 && units.get(*i + 1) == Some(&10) {
        *i += 1;
    }
    *i += 1;
}

/// Scan up to 6 hex digits at `*i`, advancing `*i` past them. Returns `(value, count)`.
fn scan_hex_digits(units: &[u16], i: &mut usize) -> (u32, usize) {
    let mut hex = 0u32;
    let mut count = 0;
    while count < 6 && *i < units.len() {
        let Some(digit) = char::from_u32(u32::from(units[*i])).and_then(|c| c.to_digit(16)) else {
            break;
        };
        hex = hex * 16 + digit;
        *i += 1;
        count += 1;
    }
    (hex, count)
}
fn identifier(units: &[u16]) -> String {
    String::from_utf16_lossy(&decoded(units, false))
}
/// A `:lang()` (or `:dir()`) argument: exactly one CSS identifier (escapes decoded, ASCII-lowercased),
/// surrounded by optional whitespace. Chrome 156 rejects strings (`:lang("de")`), lists
/// (`:lang(en, de)`), numbers and the empty argument.
pub(super) fn lang_range(arg: &[u16]) -> Option<String> {
    let arg = trim(arg);
    let chars: Vec<char> = String::from_utf16_lossy(arg).chars().collect();
    let mut end = 0;
    if !super::starts_ident(&chars, 0) {
        return None;
    }
    super::scan_name(&chars, &mut end, super::is_name_char);
    (end == chars.len()).then(|| identifier(arg).to_ascii_lowercase())
}
/// Is `units` exactly one CSS identifier (escapes allowed)?
fn is_ident(units: &[u16]) -> bool {
    let chars: Vec<char> = String::from_utf16_lossy(units).chars().collect();
    let mut end = 0;
    super::starts_ident(&chars, 0) && {
        super::scan_name(&chars, &mut end, super::is_name_char);
        end == chars.len()
    }
}
/// An attribute selector's (trimmed) name split at its unescaped namespace bar: `*|a` (any
/// namespace), `|a` (no namespace), or `a` (default lookup). `None` means invalid, as in
/// Chrome 156 — for an undeclared prefix (`ns|a`) or a name that is not an identifier
/// (`[1a]`).
fn attribute_name(raw: &[u16]) -> Option<(AttributeNamespace, String)> {
    let mut i = 0;
    let bar = loop {
        match raw.get(i) {
            None => break None,
            Some(92) => i = escaped_end(raw, i),
            Some(124) => break Some(i),
            Some(_) => i += 1,
        }
    };
    let (namespace, local) = match bar {
        None => (AttributeNamespace::Default, raw),
        Some(bar) => match &raw[..bar] {
            [42] => (AttributeNamespace::Any, &raw[bar + 1..]),
            [] => (AttributeNamespace::Null, &raw[bar + 1..]),
            _ => return None,
        },
    };
    is_ident(local).then(|| (namespace, identifier(local)))
}
/// The units record of an attribute that cannot match (an invalid selector).
fn invalid_attr(name: String) -> Attr {
    Attr::new(
        name,
        AttrMatch::Units(UnitAttrMatch {
            op: u16::MAX,
            value: Vec::new(),
            insensitive: false,
            sensitive: false,
            extension: None,
        }),
    )
}
pub(super) fn custom_operator_symbol(unit: u16) -> bool {
    matches!(unit, 33 | 35 | 37 | 38 | 47 | 60 | 62 | 63 | 64)
}

pub(super) fn attr(inner: &[u16]) -> Attr {
    let Some(eq) = inner.iter().position(|&u| u == 61) else {
        let Some((namespace, name)) = attribute_name(trim(inner)) else {
            return invalid_attr(identifier(trim(inner)));
        };
        return Attr::namespaced(
            namespace,
            name,
            AttrMatch::Units(UnitAttrMatch {
                op: 0,
                value: Vec::new(),
                insensitive: false,
                sensitive: false,
                extension: None,
            }),
        );
    };
    let raw = trim(&inner[..eq]);
    let operator = raw.last().copied().filter(|&u| {
        matches!(u, 126 | 124 | 94 | 36 | 42)
            || (custom_operator_symbol(u) && attribute_name(raw).is_none())
    });
    let name = operator.map_or(raw, |_| &raw[..raw.len() - 1]);
    let source = trim(&inner[eq + 1..]);
    let (value, quoted, modifier) = attribute_value(source);
    // an unquoted value is an identifier (Chrome: `[a=1]`, `[a=]`, `[href=a.html]` throw).
    let valid = (quoted || is_ident(value))
        && modifier
            .as_deref()
            .is_some_and(|m| m.is_empty() || m == [105] || m == [73] || m == [115] || m == [83]);
    let Some((namespace, name)) = attribute_name(trim(name)) else {
        return invalid_attr(identifier(trim(name)));
    };
    Attr::namespaced(
        namespace,
        name,
        AttrMatch::Units(UnitAttrMatch {
            op: if valid {
                operator.unwrap_or(61)
            } else {
                u16::MAX
            },
            value: decoded(value, quoted),
            insensitive: modifier.as_deref().is_some_and(|m| m == [105] || m == [73]),
            sensitive: modifier.as_deref().is_some_and(|m| m == [115] || m == [83]),
            extension: None,
        }),
    )
}
fn attribute_value(source: &[u16]) -> (&[u16], bool, Option<Vec<u16>>) {
    if source.first().is_some_and(|u| matches!(u, 34 | 39)) {
        let quote = source[0];
        let mut end = 1;
        while end < source.len() {
            if source[end] == quote {
                return (
                    &source[1..end],
                    true,
                    Some(decoded(trim(&source[end + 1..]), false)),
                );
            }
            end = escaped_end(source, end);
        }
        // the bracket scanner only closes `[` outside a string, and DOM-API sources are
        // EOF-closed string first (`selector_source`): the quote always ends here
        unreachable!("unterminated quoted attribute value");
    }
    let end = unquoted_end(source);
    (
        &source[..end],
        false,
        Some(decoded(trim(&source[end..]), false)),
    )
}
fn unquoted_end(source: &[u16]) -> usize {
    let mut end = 0;
    while end < source.len() && !whitespace(source[end]) {
        end = escaped_end(source, end);
    }
    end
}
fn scan_hex_escape(source: &[u16], position: usize) -> usize {
    let mut end = position + 1;
    while end < source.len()
        && end < position + 7
        && char::from_u32(u32::from(source[end])).is_some_and(|c| c.is_ascii_hexdigit())
    {
        end += 1;
    }
    end
}

fn escaped_end(source: &[u16], position: usize) -> usize {
    if source[position] != 92 || position + 1 == source.len() {
        return position + 1;
    }
    let end = scan_hex_escape(source, position);
    if end == position + 1 {
        return (position + 2).min(source.len());
    }
    skip_escape_whitespace(source, end)
}

fn skip_escape_whitespace(source: &[u16], mut end: usize) -> usize {
    if source.get(end).is_some_and(|&u| whitespace(u)) {
        if source.get(end) == Some(&13) && source.get(end + 1) == Some(&10) {
            end += 1;
        }
        end += 1;
    }
    end
}
pub(super) fn valid_attribute(inner: &str) -> bool {
    let parsed = attr(&inner.encode_utf16().collect::<Vec<_>>());
    !matches!(
        parsed.m,
        AttrMatch::Units(UnitAttrMatch { op: u16::MAX, .. })
    )
}
pub(super) fn specialized_attribute(inner: &str) -> Option<Attr> {
    let parsed = attr(&inner.encode_utf16().collect::<Vec<_>>());
    match &parsed.m {
        AttrMatch::Units(m)
            if m.insensitive
                || m.sensitive
                || m.unresolved_operator()
                || m.op == u16::MAX
                || parsed.name.eq_ignore_ascii_case("type")
                || inner.contains('\\')
                || inner.contains('|') =>
        {
            Some(parsed)
        }
        _ => None,
    }
}
fn split_step(unit: u16, depth: &mut i32, quote: &mut u16, escaped: &mut bool) -> bool {
    if *escaped {
        *escaped = false;
        return false;
    }
    if unit == 92 {
        *escaped = true;
        return false;
    }
    if *quote != 0 {
        if unit == *quote {
            *quote = 0;
        }
        return false;
    }
    match unit {
        34 | 39 => *quote = unit,
        40 | 91 => *depth += 1,
        41 | 93 => *depth -= 1,
        _ => {}
    }
    true
}

fn split(units: &[u16], separator: u16) -> Vec<&[u16]> {
    let mut parts = Vec::new();
    let (mut depth, mut quote, mut escaped, mut start) = (0, 0, false, 0);
    for (i, &unit) in units.iter().enumerate() {
        if !split_step(unit, &mut depth, &mut quote, &mut escaped) {
            continue;
        }
        if unit == separator && depth == 0 {
            parts.push(&units[start..i]);
            start = i + 1;
        }
    }
    parts.push(&units[start..]);
    parts
}
fn balanced_step(
    unit: u16,
    open: u16,
    close: u16,
    depth: &mut i32,
    quote: &mut u16,
    escaped: &mut bool,
) -> bool {
    if *escaped {
        *escaped = false;
    } else if unit == 92 {
        *escaped = true;
    } else if *quote != 0 {
        if unit == *quote {
            *quote = 0;
        }
    } else if matches!(unit, 34 | 39) {
        *quote = unit;
    } else if unit == open {
        *depth += 1;
    } else if unit == close {
        *depth -= 1;
        if *depth == 0 {
            return true;
        }
    }
    false
}

fn balanced<'a>(source: &'a [u16], index: &mut usize, open: u16, close: u16) -> &'a [u16] {
    let start = *index;
    let (mut depth, mut quote, mut escaped) = (1, 0, false);
    while *index < source.len() {
        if balanced_step(
            source[*index],
            open,
            close,
            &mut depth,
            &mut quote,
            &mut escaped,
        ) {
            break;
        }
        *index += 1;
    }
    let end = *index;
    if *index < source.len() {
        *index += 1;
    }
    &source[start..end]
}
fn ident(source: &[u16], index: &mut usize) -> String {
    let start = *index;
    while *index < source.len() {
        let unit = source[*index];
        if unit == 92 {
            *index += 1;
            skip_ident_escape(source, index);
            continue;
        }
        if whitespace(unit) || matches!(unit, 35 | 46 | 58 | 91 | 93 | 40 | 41 | 62 | 43 | 126 | 44)
        {
            break;
        }
        if char::from_u32(u32::from(unit)).is_some_and(custom_combinator_symbol) {
            break;
        }
        *index += 1;
    }
    identifier(&source[start..*index])
}

/// Advance `*index` past the body of a CSS escape (after the leading `\\`): either up to
/// 6 hex digits followed by an optional trailing whitespace, or a single non-newline code
/// unit. Matches the CSS Syntax 3 §4.3.7 "consume an escaped code point" state.
fn skip_ident_escape(source: &[u16], index: &mut usize) {
    let mut hex = 0;
    while *index < source.len()
        && hex < 6
        && char::from_u32(u32::from(source[*index])).is_some_and(|c| c.is_ascii_hexdigit())
    {
        *index += 1;
        hex += 1;
    }
    if hex != 0 {
        if *index < source.len() && whitespace(source[*index]) {
            consume_newline(source, index);
        }
    } else if *index < source.len() {
        *index += 1;
    }
}
fn pseudo(name: &str, arg: Option<&[u16]>) -> Pseudo {
    let Some(arg) = arg else {
        return parse_pseudo(name, None);
    };
    let lower = name.to_ascii_lowercase();
    let name = lower.as_str();
    if name.eq_ignore_ascii_case("state") {
        return state_argument(arg).map_or_else(
            || Pseudo::unknown(name, Some(&String::from_utf16_lossy(arg))),
            Pseudo::State,
        );
    }
    // the unforgiving lists reject an empty item or one ending in a combinator
    // (`:not(p, )`, `:not(p >)`; Chrome: SyntaxError), the forgiving ones drop it
    let invalid = |relative| {
        split(arg, 44)
            .into_iter()
            .any(|item| invalid_item(item, relative))
    };
    let forgiving = || {
        split(arg, 44)
            .into_iter()
            .filter(|item| !invalid_item(item, false))
            .filter_map(complex)
            .collect()
    };
    match name {
        "is" => Pseudo::Is(forgiving()),
        "where" => Pseudo::Where(forgiving()),
        "not" if invalid(false) => Pseudo::unknown(name, Some(&String::from_utf16_lossy(arg))),
        "has" if invalid(true) => Pseudo::unknown(name, Some(&String::from_utf16_lossy(arg))),
        "not" => Pseudo::Not(list(arg)),
        // `An+B of S`: S keeps its original units (escapes decoded by `list`).
        "nth-child" | "nth-last-child" if nth_of_position(arg).is_some() => {
            let at = nth_of_position(arg).unwrap_or_default();
            let anb = String::from_utf16_lossy(&arg[..at]);
            if !valid_anb(&anb) {
                return Pseudo::unknown(name, Some(&String::from_utf16_lossy(arg)));
            }
            let of = &arg[at + 2..];
            if split(of, 44)
                .into_iter()
                .any(|item| invalid_item(item, false))
            {
                return Pseudo::unknown(name, Some(&String::from_utf16_lossy(arg)));
            }
            let (a, b) = parse_nth(&anb);
            let mut of = list(of);
            if of.iter().any(|selector| {
                std::iter::once(&selector.first)
                    .chain(selector.rest.iter().map(|(_, compound)| compound))
                    .any(|compound| {
                        compound
                            .pseudos
                            .iter()
                            .any(super::cascade::is_pseudo_element_marker)
                    })
            }) {
                of.clear();
            }
            if name == "nth-child" {
                Pseudo::NthChildOf(a, b, of)
            } else {
                Pseudo::NthLastChildOf(a, b, of)
            }
        }
        "has" => Pseudo::Has(
            split(arg, 44)
                .into_iter()
                .filter_map(|part| {
                    let part = trim(part);
                    let (leading, rest) = match part.first() {
                        Some(62) => (Combinator::Child, &part[1..]),
                        Some(43) => (Combinator::Adjacent, &part[1..]),
                        Some(126) => (Combinator::GeneralSibling, &part[1..]),
                        Some(&unit) if custom_symbol(unit).is_some() => {
                            (Combinator::Custom(custom_symbol(unit)?, None), &part[1..])
                        }
                        _ => (Combinator::Descendant, part),
                    };
                    complex(rest).map(|mut complex| {
                        super::forgive_nested_has(&mut complex);
                        RelativeSelector {
                            combinator: leading,
                            complex,
                        }
                    })
                })
                .collect(),
        ),
        _ => parse_pseudo(name, Some(&String::from_utf16_lossy(arg))),
    }
}
/// A list item that is empty, ends in an unescaped combinator (`p >`) or — unless
/// `relative` (`:has()`) — starts with one (`> p`).
fn custom_symbol(unit: u16) -> Option<char> {
    char::from_u32(u32::from(unit)).filter(|&c| custom_combinator_symbol(c))
}

fn combinator_unit(unit: u16) -> bool {
    char::from_u32(u32::from(unit)).is_some_and(explicit_combinator)
}

fn invalid_item(item: &[u16], relative: bool) -> bool {
    let item = trim(item);
    item.is_empty()
        || (item.last().copied().is_some_and(combinator_unit)
            && item.len().checked_sub(2).and_then(|at| item.get(at)) != Some(&92))
        || (!relative && item.first().copied().is_some_and(combinator_unit))
}
fn parse_type_selector(source: &[u16], index: &mut usize, compound: &mut Compound) {
    let start = *index;
    let tag = ident(source, index);
    if let Some((namespace, name)) = namespaced_type(&source[start..*index]) {
        compound.namespace = namespace;
        compound.tag = name;
    } else if tag != "*" && !tag.is_empty() {
        compound.tag = Some(tag);
    }
}

fn complex(source: &[u16]) -> Option<Complex> {
    let mut index = 0;
    let mut first = None;
    let mut rest = Vec::new();
    let mut combinator = Combinator::Descendant;
    while index < source.len() {
        if whitespace(source[index]) {
            index += 1;
            continue;
        }
        match source[index] {
            62 => {
                combinator = Combinator::Child;
                index += 1;
                continue;
            }
            43 => {
                combinator = Combinator::Adjacent;
                index += 1;
                continue;
            }
            126 => {
                combinator = Combinator::GeneralSibling;
                index += 1;
                continue;
            }
            _ => {}
        }
        if let Some(symbol) = custom_symbol(source[index]) {
            combinator = Combinator::Custom(symbol, None);
            index += 1;
            continue;
        }
        let begin = index;
        let mut compound = Compound::default();
        if !matches!(source[index], 35 | 46 | 58 | 91) {
            parse_type_selector(source, &mut index, &mut compound);
        }
        parse_compound_parts(source, &mut index, &mut compound);
        if index == begin {
            index += 1;
            continue;
        }
        if first.is_none() {
            first = Some(compound);
        } else {
            rest.push((combinator, compound));
        }
        combinator = Combinator::Descendant;
    }
    first.map(|first| Complex { first, rest })
}

/// Consume id (`#`), class (`.`), attribute (`[...]`) and pseudo (`:name(...)`) parts of
/// a compound selector at `*index`, folding each into `compound`. Stops at the first
/// code unit that does not start one of these.
fn parse_compound_parts(source: &[u16], index: &mut usize, compound: &mut Compound) {
    while *index < source.len() {
        match source[*index] {
            35 => {
                *index += 1;
                let id = ident(source, index);
                compound.id = Some(id.clone());
                compound.id_is_candidate = true;
                compound.order.push(CompoundPart::Id(id));
            }
            46 => {
                *index += 1;
                compound.id_is_candidate = false;
                let class_index = compound.classes.len();
                compound.classes.push(ident(source, index));
                compound.order.push(CompoundPart::Class(class_index));
            }
            91 => {
                *index += 1;
                let attribute_index = compound.attrs.len();
                compound.attrs.push(attr(balanced(source, index, 91, 93)));
                compound
                    .order
                    .push(CompoundPart::Attribute(attribute_index));
            }
            58 => {
                *index += 1;
                let name = ident(source, index);
                let arg = if source.get(*index) == Some(&40) {
                    *index += 1;
                    Some(balanced(source, index, 40, 41))
                } else {
                    None
                };
                let pseudo_index = compound.pseudos.len();
                compound.pseudos.push(pseudo(&name, arg));
                compound.order.push(CompoundPart::Pseudo(pseudo_index));
            }
            _ => break,
        }
    }
}

/// A type selector's raw units split at an unescaped namespace bar: `*|p`, `|p`, `*|*`.
/// `None` when there is no bar (an escaped `\|` is part of the name). Only `*` (any) and
/// the empty prefix (no namespace) are declared for DOM selector APIs.
fn namespaced_type(raw: &[u16]) -> Option<(TypeNamespace, Option<String>)> {
    let mut i = 0;
    let bar = loop {
        match raw.get(i) {
            None => return None,
            Some(92) => i = escaped_end(raw, i),
            Some(124) => break i,
            Some(_) => i += 1,
        }
    };
    let (prefix, name) = (&raw[..bar], &raw[bar + 1..]);
    let namespace = match prefix {
        _ if name.is_empty() => TypeNamespace::Invalid,
        [42] => TypeNamespace::Any,
        [] => TypeNamespace::Null,
        _ => TypeNamespace::Invalid,
    };
    let name = (name != [42]).then(|| identifier(name));
    Some((namespace, name))
}
pub(super) fn list(source: &[u16]) -> Vec<Complex> {
    split(source, 44).into_iter().filter_map(complex).collect()
}
/// [`list`] of a DOM-API selector: comments removed, EOF-closed (`selector_source`).
fn dom_list(source: &[u16]) -> Vec<Complex> {
    match super::source::normalize(source, super::source::Mode::Dom) {
        Some(normalized) => list(&normalized),
        None => list(source),
    }
}
impl Tree {
    pub(super) fn parse_units_cached(&self, source: &[u16]) -> std::rc::Rc<PreparedList> {
        if let Some(hit) = self.units_parse_cache.borrow_mut().get(source) {
            return hit;
        }
        let prepared = std::rc::Rc::new(PreparedList::new(
            dom_list(source),
            std::mem::size_of_val(source),
        ));
        self.units_parse_cache.borrow_mut().retain_plan(
            self.selector_config,
            std::mem::size_of_val(source),
            || source.to_vec(),
            &prepared,
        );
        prepared
    }

    /// Original-unit selector path, preserving the exact UTF-16 cache key.
    pub fn query_selector_all_units(&self, source: &[u16]) -> std::rc::Rc<[Handle]> {
        self.query_selector_all_from_units(self.root(), source)
    }
    pub fn query_selector_all_from_units(
        &self,
        root: Handle,
        source: &[u16],
    ) -> std::rc::Rc<[Handle]> {
        {
            let mut cache = self.qcache.borrow_mut();
            cache.sync(self.version);
            if let Some(hit) = cache
                .units_by_root
                .get(&root)
                .and_then(|entries| entries.get(source))
            {
                return hit.clone();
            }
        }
        let selectors = self.parse_units_cached(source);
        let result = selectors.select_from(self, root);
        let result: std::rc::Rc<[Handle]> = result.into();
        if result.len() > 16_384 {
            return result;
        }
        let mut cache = self.qcache.borrow_mut();
        // Bound both retained roots and retained selector results per root.
        if cache.units_by_root.len() == 16 && !cache.units_by_root.contains_key(&root) {
            cache.units_by_root.clear();
        }
        let entries = cache.units_by_root.entry(root).or_default();
        if entries.len() == 64 {
            entries.clear();
        }
        entries.insert(source.to_vec(), result.clone());
        result
    }

    pub fn query_selector_units(&self, source: &[u16]) -> Option<Handle> {
        {
            let mut cache = self.qcache.borrow_mut();
            cache.sync(self.version);
            if let Some(hit) = cache
                .units_by_root
                .get(&self.root())
                .and_then(|entries| entries.get(source))
            {
                return hit.first().copied();
            }
            if let Some(&hit) = cache.first_units.get(source) {
                return hit;
            }
        }
        let first = self
            .parse_units_cached(source)
            .first_from(self, self.root(), None);
        bounded_insert(
            &mut self.qcache.borrow_mut().first_units,
            source.to_vec(),
            first,
        );
        first
    }
    /// `element.matches()` for original units: `:scope` is `node`.
    pub fn matches_units(&self, node: Handle, source: &[u16]) -> bool {
        self.matches_units_scoped(node, source, node)
    }
    /// [`Tree::matches_units`] with `scope` as the `:scope` element.
    pub fn matches_units_scoped(&self, node: Handle, source: &[u16], scope: Handle) -> bool {
        self.parse_units_cached(source)
            .matches(self, node, Some(scope))
    }
    /// [`Tree::closest`] for original units.
    #[must_use]
    pub fn closest_units(&self, node: Handle, source: &[u16]) -> Option<Handle> {
        self.parse_units_cached(source).closest_from(self, node)
    }
    pub fn get_element_by_id_units(&self, id: &[u16]) -> Option<Handle> {
        let mut stack = vec![self.root()];
        while let Some(node) = stack.pop() {
            if self.node_type(node) == NodeType::Element
                && self.get_attribute_ns_utf16(node, None, "id").as_deref() == Some(id)
            {
                return Some(node);
            }
            let begin = stack.len();
            self.for_each_light_child(node, |child| stack.push(child));
            stack[begin..].reverse();
        }
        None
    }
}

// Comments are already gone (`selector_source`), so only whitespace surrounds the name.
fn skip_state_trivia(source: &[u16], mut index: usize) -> usize {
    while source.get(index).is_some_and(|&unit| whitespace(unit)) {
        index += 1;
    }
    index
}
fn state_name_start(unit: u16) -> bool {
    unit >= 128 || unit == 95 || (65..=90).contains(&unit) || (97..=122).contains(&unit)
}
fn state_escape_end(source: &[u16], mut index: usize) -> Option<usize> {
    index += 1;
    let next = *source.get(index)?;
    if matches!(next, 10 | 12 | 13) {
        return None;
    }
    let start = index;
    while index < start + 6
        && source.get(index).is_some_and(|&unit| {
            char::from_u32(u32::from(unit)).is_some_and(|c| c.is_ascii_hexdigit())
        })
    {
        index += 1;
    }
    if index == start {
        return Some(index + 1);
    }
    if source.get(index).is_some_and(|&unit| whitespace(unit)) {
        if source.get(index..index + 2) == Some(&[13, 10]) {
            index += 1;
        }
        index += 1;
    }
    Some(index)
}
/// `:state()` accepts one CSS ident, including CSS-wide words. CSS preprocessing
/// replaces NUL/unpaired surrogates independently of exact DOM state membership.
pub(super) fn state_argument(units: &[u16]) -> Option<Vec<u16>> {
    let normalized = String::from_utf16_lossy(units).replace('\0', "\u{fffd}");
    let source: Vec<u16> = normalized.encode_utf16().collect();
    let start = skip_state_trivia(&source, 0);
    if !state_has_valid_start(&source, start) {
        return None;
    }
    let mut index = start;
    while let Some(&unit) = source.get(index) {
        if state_name_start(unit) || unit == 45 || (48..=57).contains(&unit) {
            index += 1;
        } else if unit == 92 {
            index = state_escape_end(&source, index)?;
        } else {
            break;
        }
    }
    if skip_state_trivia(&source, index) != source.len() {
        return None;
    }
    Some(decoded(&source[start..index], false))
}

/// Can a `:state()` identifier start at `start` in `source`? Accepts a name-start,
/// an escape (`\\`-prefixed), or a `-` followed by any of (`-`, name-start, escape).
fn state_has_valid_start(source: &[u16], start: usize) -> bool {
    let Some(&first) = source.get(start) else {
        return false;
    };
    state_name_start(first)
        || first == 92 && state_escape_end(source, start).is_some()
        || first == 45
            && source.get(start + 1).is_some_and(|&next| {
                next == 45
                    || state_name_start(next)
                    || next == 92 && state_escape_end(source, start + 1).is_some()
            })
}
