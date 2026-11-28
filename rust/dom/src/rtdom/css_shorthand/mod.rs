//! CSSOM shorthand properties as Chrome 156 implements them (turbo-dom#90): the shorthand
//! table, setting a shorthand (each longhand set — omitted ones to their initial value, or to
//! a pending substitution when the value holds `var()`), serializing a shorthand from its
//! longhands (`getPropertyValue`) and serializing a declaration block (`cssText`), checked
//! against `tests/fixtures/css_shorthand_chrome156.json`.
//!
//! Shared by turbo-dom-browser-env's `CSSStyleDeclaration` (inline style, style rules) and kept
//! in lockstep with the npm runtime's `src/runtime/css-shorthand.mjs`. Longhand values set
//! directly are the embedder's: this module only reads them.
mod block;
mod components;
pub use components::LENGTH_UNITS;
mod grammar;
mod longhand;
mod math;
mod serialize;
mod shape;
mod table;

pub use block::{
    declarations, longhand_alias, DeclarationBlock, LonghandSpelling, LONGHAND_ALIASES,
};
use components::{components, has_substitution, substitution_text, CSS_WIDE};
pub use longhand::{longhand_value, Spelled};
pub use table::{is_shorthand, longhands};

/// One longhand a shorthand sets.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Longhand {
    pub name: &'static str,
    /// The specified value (`""` for a pending substitution).
    pub value: String,
    /// Set for a shorthand value holding `var()` / `env()`: the shorthand and its value text,
    /// which only that shorthand serializes back.
    pub pending: Option<Pending>,
}

/// A pending-substitution longhand's origin.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pending {
    pub shorthand: &'static str,
    pub text: String,
}

/// A declaration of a block, as the serializers read it.
#[derive(Clone, Copy, Debug)]
pub struct Declaration<'a> {
    pub name: &'a str,
    pub value: &'a str,
    pub important: bool,
    pub pending: Option<(&'a str, &'a str)>,
}

/// Every shorthand (and shorthand alias) name, sorted.
pub fn shorthand_names() -> impl Iterator<Item = &'static str> {
    table::SHORTHANDS.iter().map(|entry| entry.name)
}

/// The shorthand's canonical name (aliases such as `-webkit-flex` resolve to `flex`).
#[must_use]
pub fn canonical(name: &str) -> Option<&'static str> {
    table::entry(name).map(|entry| entry.canonical)
}

/// Set shorthand `name` to `value`: its longhands in the order Chrome adds them, or `None`
/// when the value is invalid for the shorthand (or `name` is not a shorthand).
#[must_use]
pub fn expand(name: &str, value: &str) -> Option<Vec<Longhand>> {
    let entry = table::entry(name)?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    if CSS_WIDE.contains(&lower.as_str()) {
        return Some(
            entry
                .longhands
                .iter()
                .map(|&name| Longhand {
                    name,
                    value: lower.clone(),
                    pending: None,
                })
                .collect(),
        );
    }
    if has_substitution(trimmed) {
        components(trimmed)?;
        let text = substitution_text(trimmed);
        return Some(
            entry
                .longhands
                .iter()
                .map(|&name| Longhand {
                    name,
                    value: String::new(),
                    pending: Some(Pending {
                        shorthand: entry.canonical,
                        text: text.clone(),
                    }),
                })
                .collect(),
        );
    }
    let comps = components(trimmed)?;
    if comps.is_empty() {
        return None;
    }
    grammar::expand(entry.grammar, &comps).map(|parsed| match parsed {
        grammar::Parsed::Values(values) => values
            .into_iter()
            .map(|(name, value)| Longhand {
                name,
                value,
                pending: None,
            })
            .collect(),
        // A system font keyword: every longhand pending on `font: <keyword>`.
        grammar::Parsed::Pending(text) => entry
            .longhands
            .iter()
            .map(|&name| Longhand {
                name,
                value: String::new(),
                pending: Some(Pending {
                    shorthand: entry.canonical,
                    text: text.clone(),
                }),
            })
            .collect(),
    })
}

/// The shorthand text when every longhand holds the same CSS-wide keyword or the same
/// pending (unexpanded) shorthand value; `None` to serialize the longhands instead.
fn uniform_shorthand_value(values: &[Declaration<'_>], entry: &table::Entry) -> Option<String> {
    let first = values[0];
    if !(first.pending.is_some() || CSS_WIDE.contains(&first.value))
        || !values
            .iter()
            .all(|value| value.value == first.value && value.pending == first.pending)
    {
        return None;
    }
    if let Some((shorthand, text)) = first.pending {
        if shorthand == "font" && entry.canonical == "font-variant" && grammar::is_system_font(text)
        {
            return Some("normal".into());
        }
        return Some(if shorthand == entry.canonical {
            text.to_string()
        } else {
            String::new()
        });
    }
    Some(first.value.to_string())
}

/// `getPropertyValue(shorthand)`: the shorthand serialized from the block's longhands, or `""`
/// when a longhand is missing, importance is mixed, or the values have no shorthand spelling.
#[must_use]
pub fn shorthand_value(name: &str, declarations: &[Declaration<'_>]) -> String {
    let Some(entry) = table::entry(name) else {
        return String::new();
    };
    let found = |longhand: &str| {
        declarations
            .iter()
            .rev()
            .find(|declaration| declaration.name == longhand)
    };
    let mut values = Vec::with_capacity(entry.longhands.len());
    for longhand in entry.longhands {
        let Some(declaration) = found(longhand) else {
            return String::new();
        };
        values.push(*declaration);
    }
    if values.iter().any(|value| value.important) && values.iter().any(|value| !value.important) {
        return String::new();
    }
    if let Some(text) = uniform_shorthand_value(&values, entry) {
        return text;
    }
    let blocked = |value: &Declaration<'_>| {
        value.pending.is_some()
            || (CSS_WIDE.contains(&value.value)
                && (value.value != "initial" || !entry.allow_initial))
    };
    if values.iter().any(blocked) {
        return String::new();
    }
    let texts: Vec<&str> = values.iter().map(|value| value.value).collect();
    serialize::value(entry.grammar, &texts)
}

/// Shorthands that may represent `longhand`, in Chrome's preference order (most longhands
/// first, then by name); aliases never serialize.
fn candidates(longhand: &str) -> impl Iterator<Item = &'static table::Entry> + '_ {
    table::preferred()
        .iter()
        .copied()
        .filter(move |entry| entry.longhands.contains(&longhand))
}

/// The shorthands (not aliases) `longhand` belongs to, in Chrome's serialization preference.
pub fn shorthands_of(longhand: &str) -> impl Iterator<Item = &'static str> + '_ {
    candidates(longhand).map(|entry| entry.canonical)
}

/// `cssText`: the CSSOM "serialize a CSS declaration block" algorithm with Chrome's shorthand
/// preference order.
#[must_use]
pub fn block_text(declarations: &[Declaration<'_>]) -> String {
    let mut done = vec![false; declarations.len()];
    let mut out = String::new();
    let index_of = |name: &str| {
        declarations
            .iter()
            .position(|declaration| declaration.name == name)
    };
    for (index, declaration) in declarations.iter().enumerate() {
        if done[index] {
            continue;
        }
        let mut emitted = false;
        for entry in candidates(declaration.name) {
            let positions: Option<Vec<usize>> =
                entry.longhands.iter().map(|name| index_of(name)).collect();
            let Some(positions) = positions else {
                continue;
            };
            if positions.iter().any(|&position| done[position]) {
                continue;
            }
            let value = shorthand_value(entry.canonical, declarations);
            if value.is_empty() {
                continue;
            }
            push(&mut out, entry.canonical, &value, declaration.important);
            for position in positions {
                done[position] = true;
            }
            emitted = true;
            break;
        }
        if !emitted {
            push(
                &mut out,
                declaration.name,
                declaration.value,
                declaration.important,
            );
            done[index] = true;
        }
    }
    out
}

fn push(out: &mut String, name: &str, value: &str, important: bool) {
    if !out.is_empty() {
        out.push(' ');
    }
    out.push_str(name);
    out.push_str(": ");
    out.push_str(value);
    if important {
        out.push_str(" !important");
    }
    out.push(';');
}
