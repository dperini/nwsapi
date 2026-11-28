//! A CSS declaration block with Chrome 156's CSSOM semantics: parsing `cssText` (a later
//! declaration replaces an earlier one and moves to the end, `!important` wins over a later
//! normal one), `setProperty` (replaces in place), `removeProperty`, `getPropertyValue` /
//! `getPropertyPriority` for longhands and shorthands, `cssText` serialization, and alias
//! names (`word-wrap` is `overflow-wrap`). Longhand values are validated and spelled by the
//! caller's `longhand` callback (`None` rejects the declaration).
use super::{
    block_text, canonical, expand, longhands, shorthand_value, Declaration, Longhand, Pending,
};
use cssparser::{
    parse_important, AtRuleParser, CowRcStr, DeclarationParser, ParseError, Parser, ParserInput,
    ParserState, QualifiedRuleParser, RuleBodyItemParser, RuleBodyParser,
};

#[derive(Clone, Debug, PartialEq, Eq)]
struct Entry {
    name: String,
    value: String,
    important: bool,
    pending: Option<Pending>,
}

/// The longhand validator: `(name, value) -> canonical value`.
pub type LonghandSpelling<'a> = &'a dyn Fn(&str, &str) -> Option<String>;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DeclarationBlock {
    entries: Vec<Entry>,
}

/// Chrome 156's longhand aliases (`word-wrap`, `-webkit-*` prefixes, `page-break-*`, ...).
pub const LONGHAND_ALIASES: &[(&str, &str)] = &[
    ("-webkit-align-content", "align-content"),
    ("-webkit-align-items", "align-items"),
    ("-webkit-align-self", "align-self"),
    ("-webkit-animation-delay", "animation-delay"),
    ("-webkit-animation-direction", "animation-direction"),
    ("-webkit-animation-duration", "animation-duration"),
    ("-webkit-animation-fill-mode", "animation-fill-mode"),
    (
        "-webkit-animation-iteration-count",
        "animation-iteration-count",
    ),
    ("-webkit-animation-name", "animation-name"),
    ("-webkit-animation-play-state", "animation-play-state"),
    (
        "-webkit-animation-timing-function",
        "animation-timing-function",
    ),
    ("-webkit-app-region", "app-region"),
    ("-webkit-appearance", "appearance"),
    ("-webkit-backface-visibility", "backface-visibility"),
    ("-webkit-background-clip", "background-clip"),
    ("-webkit-background-origin", "background-origin"),
    ("-webkit-background-size", "background-size"),
    ("-webkit-border-after-color", "border-block-end-color"),
    ("-webkit-border-after-style", "border-block-end-style"),
    ("-webkit-border-after-width", "border-block-end-width"),
    ("-webkit-border-before-color", "border-block-start-color"),
    ("-webkit-border-before-style", "border-block-start-style"),
    ("-webkit-border-before-width", "border-block-start-width"),
    (
        "-webkit-border-bottom-left-radius",
        "border-bottom-left-radius",
    ),
    (
        "-webkit-border-bottom-right-radius",
        "border-bottom-right-radius",
    ),
    ("-webkit-border-end-color", "border-inline-end-color"),
    ("-webkit-border-end-style", "border-inline-end-style"),
    ("-webkit-border-end-width", "border-inline-end-width"),
    ("-webkit-border-start-color", "border-inline-start-color"),
    ("-webkit-border-start-style", "border-inline-start-style"),
    ("-webkit-border-start-width", "border-inline-start-width"),
    ("-webkit-border-top-left-radius", "border-top-left-radius"),
    ("-webkit-border-top-right-radius", "border-top-right-radius"),
    ("-webkit-box-shadow", "box-shadow"),
    ("-webkit-box-sizing", "box-sizing"),
    ("-webkit-clip-path", "clip-path"),
    ("-webkit-column-break-after", "break-after"),
    ("-webkit-column-break-before", "break-before"),
    ("-webkit-column-break-inside", "break-inside"),
    ("-webkit-column-count", "column-count"),
    ("-webkit-column-gap", "column-gap"),
    ("-webkit-column-rule-color", "column-rule-color"),
    ("-webkit-column-rule-style", "column-rule-style"),
    ("-webkit-column-rule-width", "column-rule-width"),
    ("-webkit-column-span", "column-span"),
    ("-webkit-column-width", "column-width"),
    ("-webkit-filter", "filter"),
    ("-webkit-flex-basis", "flex-basis"),
    ("-webkit-flex-direction", "flex-direction"),
    ("-webkit-flex-grow", "flex-grow"),
    ("-webkit-flex-shrink", "flex-shrink"),
    ("-webkit-flex-wrap", "flex-wrap"),
    ("-webkit-font-feature-settings", "font-feature-settings"),
    ("-webkit-hyphenate-character", "hyphenate-character"),
    ("-webkit-justify-content", "justify-content"),
    ("-webkit-logical-height", "block-size"),
    ("-webkit-logical-width", "inline-size"),
    ("-webkit-margin-after", "margin-block-end"),
    ("-webkit-margin-before", "margin-block-start"),
    ("-webkit-margin-end", "margin-inline-end"),
    ("-webkit-margin-start", "margin-inline-start"),
    ("-webkit-mask-clip", "mask-clip"),
    ("-webkit-mask-composite", "mask-composite"),
    ("-webkit-mask-image", "mask-image"),
    ("-webkit-mask-origin", "mask-origin"),
    ("-webkit-mask-repeat", "mask-repeat"),
    ("-webkit-mask-size", "mask-size"),
    ("-webkit-max-logical-height", "max-block-size"),
    ("-webkit-max-logical-width", "max-inline-size"),
    ("-webkit-min-logical-height", "min-block-size"),
    ("-webkit-min-logical-width", "min-inline-size"),
    ("-webkit-opacity", "opacity"),
    ("-webkit-order", "order"),
    ("-webkit-padding-after", "padding-block-end"),
    ("-webkit-padding-before", "padding-block-start"),
    ("-webkit-padding-end", "padding-inline-end"),
    ("-webkit-padding-start", "padding-inline-start"),
    ("-webkit-perspective", "perspective"),
    ("-webkit-perspective-origin", "perspective-origin"),
    ("-webkit-print-color-adjust", "print-color-adjust"),
    ("-webkit-shape-image-threshold", "shape-image-threshold"),
    ("-webkit-shape-margin", "shape-margin"),
    ("-webkit-shape-outside", "shape-outside"),
    ("-webkit-text-emphasis-color", "text-emphasis-color"),
    ("-webkit-text-emphasis-position", "text-emphasis-position"),
    ("-webkit-text-emphasis-style", "text-emphasis-style"),
    ("-webkit-text-size-adjust", "text-size-adjust"),
    ("-webkit-transform", "transform"),
    ("-webkit-transform-origin", "transform-origin"),
    ("-webkit-transform-style", "transform-style"),
    ("-webkit-transition-delay", "transition-delay"),
    ("-webkit-transition-duration", "transition-duration"),
    ("-webkit-transition-property", "transition-property"),
    (
        "-webkit-transition-timing-function",
        "transition-timing-function",
    ),
    ("-webkit-user-select", "user-select"),
    ("grid-column-gap", "column-gap"),
    ("grid-row-gap", "row-gap"),
    ("page-break-after", "break-after"),
    ("page-break-before", "break-before"),
    ("page-break-inside", "break-inside"),
    ("word-wrap", "overflow-wrap"),
];

/// The longhand a longhand alias names (`word-wrap` -> `overflow-wrap`); `None` otherwise.
#[must_use]
pub fn longhand_alias(name: &str) -> Option<&'static str> {
    LONGHAND_ALIASES
        .binary_search_by(|(alias, _)| (*alias).cmp(name))
        .ok()
        .map(|index| LONGHAND_ALIASES[index].1)
}

/// A property name as CSSOM keys it: custom properties as authored, others lowercase with
/// longhand aliases resolved.
fn property_name(name: &str) -> String {
    if name.starts_with("--") {
        return name.to_string();
    }
    let lower = name.to_ascii_lowercase();
    longhand_alias(&lower).map_or(lower, str::to_string)
}

impl DeclarationBlock {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Parse a declaration list (`cssText` / the `style` attribute).
    #[must_use]
    pub fn parse(text: &str, longhand: LonghandSpelling<'_>) -> Self {
        let mut block = Self::new();
        for (name, value, important) in declarations(text) {
            for entry in Self::resolve(&name, &value, important, longhand).unwrap_or_default() {
                if let Some(index) = block.position(&entry.name) {
                    if block.entries[index].important && !entry.important {
                        continue;
                    }
                    block.entries.remove(index);
                }
                block.entries.push(entry);
            }
        }
        block
    }

    /// The entries a declaration sets, or `None` when it is invalid.
    fn resolve(
        name: &str,
        value: &str,
        important: bool,
        longhand: LonghandSpelling<'_>,
    ) -> Option<Vec<Entry>> {
        let name = property_name(name);
        if let Some(longhands) = expand(&name, value) {
            return Some(
                longhands
                    .into_iter()
                    .map(
                        |Longhand {
                             name,
                             value,
                             pending,
                         }| Entry {
                            name: name.to_string(),
                            value,
                            important,
                            pending,
                        },
                    )
                    .collect(),
            );
        }
        if canonical(&name).is_some() {
            return None;
        }
        let value = longhand(&name, value)?;
        Some(vec![Entry {
            name,
            value,
            important,
            pending: None,
        }])
    }

    fn position(&self, name: &str) -> Option<usize> {
        self.entries.iter().position(|entry| entry.name == name)
    }

    /// `setProperty(name, value, priority)`: `false` when nothing changed.
    pub fn set_property(
        &mut self,
        name: &str,
        value: &str,
        priority: &str,
        longhand: LonghandSpelling<'_>,
    ) -> bool {
        if value.trim().is_empty() {
            self.remove_property(name);
            return true;
        }
        let important = if priority.is_empty() {
            false
        } else if priority.eq_ignore_ascii_case("important") {
            true
        } else {
            return false;
        };
        let Some(entries) = Self::resolve(name, value, important, longhand) else {
            return false;
        };
        for entry in entries {
            match self.position(&entry.name) {
                Some(index) => self.entries[index] = entry,
                None => self.entries.push(entry),
            }
        }
        true
    }

    /// `removeProperty(name)`: the removed longhand's value; `""` for a shorthand (Chrome).
    pub fn remove_property(&mut self, name: &str) -> String {
        let name = property_name(name);
        if let Some(longhands) = longhands(&name) {
            self.entries
                .retain(|entry| !longhands.contains(&entry.name.as_str()));
            return String::new();
        }
        match self.position(&name) {
            Some(index) => self.entries.remove(index).value,
            None => String::new(),
        }
    }

    fn declarations(&self) -> Vec<Declaration<'_>> {
        self.entries
            .iter()
            .map(|entry| Declaration {
                name: &entry.name,
                value: &entry.value,
                important: entry.important,
                pending: entry
                    .pending
                    .as_ref()
                    .map(|pending| (pending.shorthand, pending.text.as_str())),
            })
            .collect()
    }

    /// `getPropertyValue(name)`.
    #[must_use]
    pub fn property_value(&self, name: &str) -> String {
        let name = property_name(name);
        if canonical(&name).is_some() {
            return shorthand_value(&name, &self.declarations());
        }
        self.position(&name)
            .map_or_else(String::new, |index| self.entries[index].value.clone())
    }

    /// `getPropertyPriority(name)`.
    #[must_use]
    pub fn property_priority(&self, name: &str) -> &'static str {
        let name = property_name(name);
        let important = match longhands(&name) {
            Some(longhands) => longhands.iter().all(|longhand| {
                self.position(longhand)
                    .is_some_and(|index| self.entries[index].important)
            }),
            None => self
                .position(&name)
                .is_some_and(|index| self.entries[index].important),
        };
        if important {
            "important"
        } else {
            ""
        }
    }

    /// `cssText`.
    #[must_use]
    pub fn css_text(&self) -> String {
        block_text(&self.declarations())
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// `item(index)`: the longhand name at `index`.
    #[must_use]
    pub fn item(&self, index: usize) -> Option<&str> {
        self.entries.get(index).map(|entry| entry.name.as_str())
    }
}

struct DeclarationList;

impl<'i> DeclarationParser<'i> for DeclarationList {
    type Declaration = (String, String, bool);
    type Error = ();
    fn parse_value<'t>(
        &mut self,
        name: CowRcStr<'i>,
        input: &mut Parser<'i, 't>,
        _: &ParserState,
    ) -> Result<Self::Declaration, ParseError<'i, ()>> {
        let start = input.position();
        let value = input.parse_until_before(cssparser::Delimiter::Bang, |input| {
            while input.next().is_ok() {}
            Ok::<_, ParseError<'i, ()>>(())
        });
        value?;
        let text = input.slice_from(start).trim().to_string();
        let important = input.try_parse(parse_important).is_ok();
        input.expect_exhausted()?;
        Ok((name.to_string(), text, important))
    }
}
impl AtRuleParser<'_> for DeclarationList {
    type Prelude = ();
    type AtRule = (String, String, bool);
    type Error = ();
}
impl QualifiedRuleParser<'_> for DeclarationList {
    type Prelude = ();
    type QualifiedRule = (String, String, bool);
    type Error = ();
}
impl RuleBodyItemParser<'_, (String, String, bool), ()> for DeclarationList {
    fn parse_declarations(&self) -> bool {
        true
    }
    fn parse_qualified(&self) -> bool {
        false
    }
}

/// A declaration list's `(name, value, important)` declarations, in order.
#[must_use]
pub fn declarations(text: &str) -> Vec<(String, String, bool)> {
    let mut source = ParserInput::new(text);
    let mut input = Parser::new(&mut source);
    let mut parser = DeclarationList;
    RuleBodyParser::new(&mut input, &mut parser)
        .filter_map(Result::ok)
        .collect()
}
