//! Selector matching + query API over `Tree`. Mirrors the JS runtime's
//! alloc-free matcher discipline (whole-word class scan, index loops, no regex)
//! and version-keyed result caching (`Document.__version` → `Tree.version`).
//!
//! Selector support: comma lists, descendant (` `), child (`>`), adjacent (`+`)
//! and general-sibling (`~`) combinators, compounds of `tag` (optionally `*|` / `|`
//! namespace-prefixed) / `.class` / `#id` / `[attr]` / `[attr=val]`, the `:is()` /
//! `:where()` / `:not()` selector-list pseudo-classes, the relational `:has()`, and the
//! structural / form-state / link pseudo-classes listed on `Pseudo`. Enough for
//! RTL-style queries; extend as the gauntlet demands.
//!
//! Chrome 156 is the reference (consolidation S3a + P5b, miaskiewicz/turbo-dom#18, control
//! `tests/fixtures/cascade_selectors_chrome156.json`): CSS escapes and non-ASCII
//! identifiers (a selector containing `\` is parsed by the UTF-16 parser in
//! `query_utf16.rs`, which decodes escapes), `:empty` ignoring comments / processing
//! instructions / template content, the HTML `:read-only` / `:read-write` and `:disabled`
//! rules, `:nth-child(An+B of S)`, `:link` / `:any-link`, `:lang()`, `:dir()`, `:defined`,
//! `:root` = the document element, queries that never enter template content, and
//! `_checked` validity equal to Chrome's `querySelector` (see `docs/selector-engine.md`).
//! The npm JS engine (`src/runtime/selectors.mjs`) is kept in lockstep against the same
//! control.
//! Stylesheet selectors (`parse_for_cascade` / `match_for_cascade`, consolidation S3b) live
//! in `query_cascade.rs`; matching is generic over a [`Navigator`].

#[path = "query/prepared.rs"]
pub(crate) mod prepared;

#[path = "query/adapter.rs"]
mod adapter;
#[path = "query/compiled.rs"]
mod compiled;
pub use adapter::{AdapterError, DomSelector, QueryOptions, SelectorSubject, StylesheetMatch};
#[path = "query/config.rs"]
pub(crate) mod config;
pub use config::{ResolverCache, SelectorConfig, SelectorErrorMode};
#[path = "query/extensions.rs"]
mod extensions;
pub use compiled::{CompiledRelativeSelector, CompiledSelector, TraversalTarget};
pub use extensions::{
    AttributePredicate, CombinatorCallback, CombinatorResolver, ExtensionSyntax, SelectorArity,
    SelectorCallback, SelectorExtensions, SelectorForm, SelectorPredicate,
};
use prepared::PreparedList;

#[path = "query/language.rs"]
mod language;

#[path = "query/jquery.rs"]
mod jquery;

#[path = "query/host.rs"]
mod host;
pub(crate) use host::HostDocumentKind;
pub use host::HostSnapshot;

#[path = "query/slot.rs"]
mod slot;

use super::tree::{FormProp, Handle, NodeType, SelectorState, Tree};

/// Max distinct entries held in the version-keyed query cache (`Tree.qcache`)
/// before it is cleared wholesale. Mirrors the JS `__selectorCache` cap (10000):
/// the cache exists for the repeated-query RTL pattern, not to memoize an
/// unbounded stream of unique selectors, so a hard ceiling keeps it from leaking.
const CACHE_CAP: usize = 10_000;

const HTML_NS: &str = "http://www.w3.org/1999/xhtml";

/// `<input type>` states the `readonly` attribute applies to (HTML); a missing or unknown
/// type is the Text state.
const READONLY_INPUT_TYPES: &[&str] = &[
    "text",
    "search",
    "url",
    "tel",
    "email",
    "password",
    "date",
    "month",
    "week",
    "time",
    "datetime-local",
    "number",
];

/// Every `<input type>` keyword HTML defines (anything else falls back to Text).
const KNOWN_INPUT_TYPES: &[&str] = &[
    "hidden",
    "text",
    "search",
    "tel",
    "url",
    "email",
    "password",
    "date",
    "month",
    "week",
    "time",
    "datetime-local",
    "number",
    "range",
    "color",
    "checkbox",
    "radio",
    "file",
    "submit",
    "image",
    "reset",
    "button",
];

/// Insert `(key, val)` into a `CACHE_CAP`-bounded map, clearing it wholesale first
/// if it has reached the cap. Shared by the parse cache and the two query caches so
/// the clear-on-overflow idiom lives in one place.
fn bounded_insert<K: std::hash::Hash + Eq, V>(
    map: &mut rustc_hash::FxHashMap<K, V>,
    key: K,
    val: V,
) {
    if map.len() >= CACHE_CAP {
        map.clear();
    }
    map.insert(key, val);
}

/// How an `[attr...]` test compares against the element's attribute value. The
/// operator and its operand are ONE inseparable thing: a presence test `[attr]`
/// carries no value, and every value-bearing operator carries its value. This
/// makes "presence with a value" / "equals with no value" unrepresentable — the
/// old `Attr { op, value }` could express both.
#[derive(Debug, Clone)]
enum AttrMatch {
    Present, // [attr]
    Units(UnitAttrMatch),
    Equals(String),   // [attr=v]
    Includes(String), // [attr~=v]  whitespace-separated word
    // (`[attr|=v]` always takes the unit path: `specialized_attribute` claims every `|`)
    Prefix(String), // [attr^=v]
    Suffix(String), // [attr$=v]
    Substr(String), // [attr*=v]
}

#[path = "selector_source.rs"]
mod source;

#[cfg(test)]
#[path = "query_internal_tests.rs"]
mod internal_tests;

#[path = "query_utf16.rs"]
mod units;
use units::UnitAttrMatch;

#[path = "query_cascade.rs"]
mod cascade;
pub(super) use cascade::parse_for_cascade_with_extensions;
pub use cascade::{
    match_for_cascade, parse_for_cascade, parse_for_supports, CascadeSelector, PositionCache,
    SelectorList, SiblingGroup, Specificity,
};

impl AttrMatch {
    /// Does `got` (the element's attribute value) satisfy this test? SAME
    /// semantics as the old `attr_op_matches`: the `!want.is_empty()` guards on
    /// prefix/suffix/substr/includes are preserved.
    fn matches(&self, got: &str) -> bool {
        match self {
            AttrMatch::Present => true,
            // unit records are matched against unit values (`matches_compound`)
            AttrMatch::Units(_) => unreachable!("unit attribute records match units"),
            AttrMatch::Equals(want) => got == want,
            AttrMatch::Prefix(want) => !want.is_empty() && got.starts_with(want.as_str()),
            AttrMatch::Suffix(want) => !want.is_empty() && got.ends_with(want.as_str()),
            AttrMatch::Substr(want) => !want.is_empty() && got.contains(want.as_str()),
            AttrMatch::Includes(want) => {
                !want.is_empty() && got.split_ascii_whitespace().any(|w| w == want)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AttributeNamespace {
    Default,
    Any,
    Null,
}

#[derive(Debug, Clone)]
struct Attr {
    name: String,
    html_name: Option<String>,
    namespace: AttributeNamespace,
    m: AttrMatch,
}
impl Attr {
    fn new(name: String, m: AttrMatch) -> Self {
        Self::namespaced(AttributeNamespace::Default, name, m)
    }

    fn namespaced(namespace: AttributeNamespace, name: String, m: AttrMatch) -> Self {
        let html_name = name
            .bytes()
            .any(|b| b.is_ascii_uppercase())
            .then(|| name.to_ascii_lowercase());
        Self {
            name,
            html_name,
            namespace,
            m,
        }
    }
}

/// The namespace prefix of a type/universal selector. DOM selector APIs have no
/// `@namespace` declarations, so (as in Chrome) the only meaningful prefixes are `*|`
/// (any namespace — same as no prefix) and `|` (no namespace); any other prefix is
/// undeclared, which the strict `_checked` path rejects and the lenient path never matches.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
enum TypeNamespace {
    /// No prefix (`p`, `*`): any namespace.
    #[default]
    Default,
    /// `*|p`: any namespace.
    Any,
    /// `|p`: elements with no namespace.
    Null,
    /// `foo|p` (undeclared prefix) or a prefix with no name (`p|`): never matches.
    Invalid,
}

/// Split a type/universal selector's raw text at its namespace bar. `None` tag = any
/// element. The input never contains escapes (the string API hands escaped selectors to
/// the UTF-16 parser, which splits on the raw units itself).
fn split_type_selector(raw: &str) -> (TypeNamespace, Option<String>) {
    let Some(bar) = raw.find('|') else {
        return (
            TypeNamespace::Default,
            (raw != "*").then(|| raw.to_string()),
        );
    };
    let (prefix, name) = (&raw[..bar], &raw[bar + 1..]);
    let namespace = match prefix {
        _ if name.is_empty() => TypeNamespace::Invalid,
        "*" => TypeNamespace::Any,
        "" => TypeNamespace::Null,
        _ => TypeNamespace::Invalid,
    };
    (namespace, (name != "*").then(|| name.to_string()))
}

#[derive(Debug, Clone, Default)]
struct Compound {
    tag: Option<String>, // None or "*" = any
    namespace: TypeNamespace,
    id: Option<String>,
    // NWSAPI uses the last terminal class/ID token as the candidate seed.
    // This matters for IDS_DUPES=false: an ID seed uses only getElementById's
    // first document match, while a class seed still sees duplicate IDs.
    id_is_candidate: bool,
    classes: Vec<String>,
    attrs: Vec<Attr>,
    pseudos: Vec<Pseudo>,
    order: Vec<CompoundPart>,
}

#[derive(Debug, Clone)]
enum CompoundPart {
    Id(String),
    Class(usize),
    Attribute(usize),
    Pseudo(usize),
}

/// Supported pseudo-classes. Mirrors `src/runtime/selectors.mjs` `matchPseudo`.
/// `Unknown` (anything not parsed into a variant) NEVER matches — honest, not a
/// silent true — matching the JS `default: return false`.
#[derive(Debug, Clone)]
enum Pseudo {
    // Structural
    Heading(u8),
    Open(bool),
    HostState(SelectorState),
    HasSlotted(Option<Box<Complex>>, Option<String>),
    FirstChild,
    LastChild,
    OnlyChild,
    FirstOfType,
    LastOfType,
    OnlyOfType,
    NthChild(i64, i64), // (a, b) from `an+b`
    NthLastChild(i64, i64),
    // `:nth-child(An+B of S)` / `:nth-last-child(An+B of S)`: positions count only the
    // element siblings matching the selector list S, and the element itself must match S.
    NthChildOf(i64, i64, Vec<Complex>),
    NthLastChildOf(i64, i64, Vec<Complex>),
    NthOfType(i64, i64),
    NthLastOfType(i64, i64),
    Empty,
    Root,
    // `:scope`: the scoping element of a DOM-API match (`matches` / `closest`: the element
    // called on; element-rooted queries: that element; document queries and stylesheets:
    // `:root`; miaskiewicz/turbo-dom#96).
    Scope,
    // Form-state
    Checked,
    Disabled,
    Enabled,
    Required,
    Optional,
    ReadOnly,
    ReadWrite,
    Selected,
    State(Vec<u16>),
    // `:link` / `:any-link`: an HTML `a`/`area` or SVG `a` with an `href` (every link is
    // unvisited here, so the two are identical and `:visited` never matches).
    Link,
    /// Shadow-tree host selector; only matches when the navigator supplies a shadow scope.
    Host {
        selectors: Option<Vec<Complex>>,
        contextual: bool,
    },
    // Matching pseudos whose argument is a SELECTOR LIST (comma-separated complex
    // selectors), each anchored at the element under test. `:where` matches
    // identically to `:is` (the specificity difference is a cascade concern, out of
    // scope here); `:not` is the negation (NONE of the list may match).
    Is(Vec<Complex>),
    /// Legacy DOM-query alias for `:is()`; rejected in stylesheet selector lists.
    Matches(Vec<Complex>),
    Where(Vec<Complex>),
    Not(Vec<Complex>),
    // `:has(<relative-selector-list>)` — relational. Each entry is a leading
    // combinator (None = descendant) paired with the relative complex selector.
    // `el:has(S)` is true iff SOME element reachable from `el` per S's leading
    // combinator matches S, scoped to `el`. Empty list → never matches.
    Has(Vec<RelativeSelector>),
    Lang(Vec<language::LanguageRange>),
    // `:dir(ltr|rtl)`: the element's HTML directionality; any other identifier is valid and
    // never matches (`Some(true)` = rtl, `None` = neither).
    Dir(Option<bool>),
    // `:defined`: not an (undefined) custom element — see `query_cascade::is_defined`.
    Defined,
    // `:fullscreen`: in the embedder-reported fullscreen stack
    // (`Tree::fullscreen_stack`, miaskiewicz/turbo-dom#58).
    Fullscreen,
    // Cascade-only (produced by `parse_for_cascade`, never by the DOM-API parsers):
    // `:-webkit-any()` (matches like `:is()`, specificity of a pseudo-class).
    WebkitAny(Vec<Complex>),
    // Unrecognized / unparseable → never matches. Keeps the name and argument text so the
    // cascade parser (`parse_for_cascade`) can tell pseudo-elements and the pseudo-classes
    // Chrome knows from invalid ones.
    Unknown(UnknownPseudo),
    Extension(extensions::SelectorCallback, Option<String>),
    Jquery(jquery::Test),
    JqueryPosition(jquery::Position),
}

/// The name and argument of a pseudo the engine does not implement (`Pseudo::Unknown`).
#[derive(Debug, Clone, Default)]
struct UnknownPseudo {
    name: String,
    arg: Option<String>,
}

impl Pseudo {
    fn unknown(name: &str, arg: Option<&str>) -> Pseudo {
        Pseudo::Unknown(UnknownPseudo {
            name: name.to_string(),
            arg: arg.map(str::to_string),
        })
    }
}

/// One relative selector inside `:has()`: an optional leading combinator (None =
/// descendant) and the complex selector that follows. `> li.active` → `(Child,
/// li.active)`; `.a .b` → `(Descendant, .a .b)`.
#[derive(Debug, Clone)]
struct RelativeSelector {
    combinator: Combinator,
    complex: Complex,
}

#[derive(Debug, Clone)]
enum Combinator {
    Descendant,
    Child,
    Adjacent,       // + immediately-preceding element sibling
    GeneralSibling, // ~ any preceding element sibling
    Column,         // || elements occupying the same table column
    Custom(char, Option<extensions::CombinatorCallback>),
}

fn custom_combinator_symbol(c: char) -> bool {
    c.is_ascii_punctuation()
        && !matches!(
            c,
            '"' | '#'
                | '\''
                | '('
                | ')'
                | '*'
                | '+'
                | ','
                | '-'
                | '.'
                | ':'
                | '='
                | '>'
                | '_'
                | '['
                | ']'
                | '\\'
                | '|'
                | '~'
        )
}

fn explicit_combinator(c: char) -> bool {
    matches!(c, '>' | '+' | '~') || custom_combinator_symbol(c)
}

/// A complex selector = a non-empty head compound + a tail of
/// `(combinator, compound)` pairs, left-to-right. In `rest`, entry `i`'s
/// combinator connects its compound to the one on its LEFT (`rest[i-1].1`, or
/// `first` when `i==0`). Modeling the head separately makes "empty complex" and
/// "meaningless leading combinator" unrepresentable — `parse_complex` returns
/// `Option<Complex>`, so a `Complex` is always non-empty by construction.
#[derive(Debug, Clone)]
pub(crate) struct Complex {
    first: Compound,
    rest: Vec<(Combinator, Compound)>,
}

/// A lexical token. The lexer is the ONE pass that centrally handles quoted
/// strings and balanced `[...]` / `(...)`; everything the grammar sees is already
/// well-formed tokens, so the recursive-descent parser never tracks bracket/paren
/// depth itself (the class of bug this refactor exists to kill).
///
/// `*` and digits are ordinary identifier characters here, so a leading `*` lexes
/// as `Ident("*")` (the parser maps it to "any tag") and `*foo` stays `Ident("*foo")`
/// — preserving the old substring-tag semantics. `[..]` / `(..)` carry their already
/// quote-/depth-balanced inner text, so `svg[viewBox="0 0 10 10"]` is one `Attr` token
/// and `:not(:nth-child(2))` is one `Paren` token.
enum Token {
    Ident(String), // run of non-special chars: tag / class / id / pseudo-name / stray
    Hash,          // #
    Dot,           // .
    Colon,         // :
    Attr(String),  // inner text of a balanced `[ ... ]`
    Paren(String), // inner text of a balanced `( ... )` (a pseudo argument)
    Ws,            // a run of significant whitespace (descendant separator)
    Gt,            // > child combinator
    Plus,          // + adjacent-sibling combinator
    Tilde,         // ~ general-sibling combinator
    Column,        // || column combinator
    Custom(char),
}

/// is `ch` a token boundary (the lexer can never put it inside an `Ident`)?
#[inline]
fn is_special(ch: char) -> bool {
    let delimiter = matches!(
        ch,
        '>' | '+' | '~' | '#' | '.' | ':' | '[' | ']' | '(' | ')'
    );
    ch.is_whitespace() || delimiter || custom_combinator_symbol(ch)
}

/// A type-selector / pseudo-name may START with an ASCII letter (mirrors the JS
/// `isTypeStart`).
#[inline]
fn is_type_start(ch: char) -> bool {
    ch.is_ascii_alphabetic()
}

/// A name character inside a type/id/class run (mirrors the JS `NAME_CHAR` `[\w-]`).
#[inline]
fn is_name_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '-'
}

/// Why a selector string is invalid. The infallible `query_selector*`/`matches` path is
/// deliberately lenient (drops the bad bits and does its best); the `_checked` variants
/// return this instead, matching the `SyntaxError` the JS runtime — and real browsers —
/// throw for the same inputs. Kept in lockstep with `selectors.mjs` `tokenize`/
/// `parseCompound`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SelectorError {
    /// An unterminated `[...]` attribute selector, e.g. `div[href` (JS: "unterminated
    /// attribute selector").
    UnterminatedAttribute,
    /// A character that cannot start any selector token, e.g. the `!` in `div!p`
    /// (JS: "unexpected '{c}' in selector").
    UnexpectedChar(char),
    /// A combinator with no compound on one side — a leading (`>`), doubled (`a > > b`),
    /// mixed (`a + > b`) or trailing (`a >`) combinator — or an empty list item (`""`,
    /// `a,,b`) (JS: "empty compound").
    EmptyCompound,
    /// A selector the lenient grammar reads but Chrome rejects: an unknown or misplaced
    /// pseudo, a type selector after another simple selector (`[a]div`), a simple selector
    /// after a pseudo-element (`::before.x`), an invalid `An+B` (`:nth-child(foo)`), …
    Invalid(&'static str),
    /// A pseudo-class Chrome does not know, named as written (a functional one ends in
    /// `()`): `a:bogus` → `"bogus"` (turbo-surf#117).
    UnknownPseudoClass(String),
}

impl std::fmt::Display for SelectorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SelectorError::UnterminatedAttribute => f.write_str("unterminated attribute selector"),
            SelectorError::UnexpectedChar(c) => write!(f, "unexpected '{c}' in selector"),
            SelectorError::EmptyCompound => f.write_str("empty compound (stray combinator)"),
            SelectorError::Invalid(reason) => write!(f, "invalid selector: {reason}"),
            SelectorError::UnknownPseudoClass(name) => {
                write!(f, "invalid selector: unknown pseudo-class ':{name}'")
            }
        }
    }
}

impl std::error::Error for SelectorError {}

/// One coarse token for STRICT validation only (not the matching lexer above): we care
/// only about a token's structural role — a compound `Part`, a `Comb`inator, the `Ws`
/// separator, or a `Comma` segment break — plus the two lexical errors a browser rejects
/// (unterminated `[...]`, an unexpected char). Reuses `scan_balanced` for `[...]`/`(...)`.
enum StrictTok {
    /// A type or universal selector (with its namespace prefix): only valid as the first
    /// simple selector of a compound (`[a]div`, `.x*` are invalid).
    Type,
    Part,
    Comb,
    Ws,
    Comma,
}

/// Is `chars[i]` (a `\`) a valid CSS escape — i.e. not followed by a newline? A `\` at the
/// very end is valid (CSS turns it into U+FFFD).
fn valid_escape(chars: &[char], i: usize) -> bool {
    chars
        .get(i + 1)
        .is_none_or(|&next| !matches!(next, '\n' | '\r' | '\u{c}'))
}

/// Index just past the CSS escape starting at `chars[i]` (a `\`): up to six hex digits
/// plus one optional whitespace terminator, or the single escaped code point.
fn escape_end(chars: &[char], i: usize) -> usize {
    let mut j = i + 1;
    while j < chars.len() && j < i + 7 && chars[j].is_ascii_hexdigit() {
        j += 1;
    }
    if j == i + 1 {
        return (i + 2).min(chars.len());
    }
    if chars.get(j).is_some_and(|c| c.is_whitespace()) {
        if chars[j] == '\r' && chars.get(j + 1) == Some(&'\n') {
            j += 1;
        }
        j += 1;
    }
    j
}

/// Scan a run of name code points from `*i`: `keep(c)` ASCII characters, any non-ASCII
/// code point, and valid CSS escapes (CSS ident rules; Chrome accepts `.café`, `.md\:flex`).
fn scan_name(chars: &[char], i: &mut usize, keep: fn(char) -> bool) {
    while *i < chars.len() {
        let c = chars[*i];
        if keep(c) || !c.is_ascii() {
            *i += 1;
        } else if c == '\\' && valid_escape(chars, *i) {
            *i = escape_end(chars, *i);
        } else {
            break;
        }
    }
}

/// Does a CSS identifier start at `chars[i]` (CSS Syntax "would start an ident")? A letter,
/// `_`, a non-ASCII code point or a valid escape, or `-` followed by one of those or by a
/// second `-`. Type, class, id and pseudo names are identifiers (`.1a`, `#-1` are invalid).
fn starts_ident(chars: &[char], i: usize) -> bool {
    let name_start = |j: usize| {
        chars.get(j).is_some_and(|&c| {
            is_type_start(c) || c == '_' || !c.is_ascii() || (c == '\\' && valid_escape(chars, j))
        })
    };
    name_start(i)
        || (chars.get(i) == Some(&'-') && (chars.get(i + 1) == Some(&'-') || name_start(i + 1)))
}

/// The CSS2 pseudo-elements that also parse with a single colon (`:before`).
const LEGACY_PSEUDO_ELEMENT_NAMES: &[&str] = &["after", "before", "first-letter", "first-line"];

/// Strict lex (the structural half of [`validate_checked`] / [`parse_for_cascade`];
/// `selectors.mjs` `tokenize` mirrors it): throws on an unterminated attribute, an
/// unexpected character, a type/class/id/pseudo name that is not a CSS identifier
/// (`.1a`, `p:`), and a non-pseudo simple selector after a pseudo-element (`::before.x`).
/// Unterminated `(...)` is tolerated (CSS closes blocks at the end of input). Names follow
/// CSS ident rules (non-ASCII code points and escapes included), and a type/universal
/// selector may carry the `*|` or `|` namespace prefix (no other prefix is declared for DOM
/// selector APIs).
fn lex_strict(src: &str) -> Result<Vec<StrictTok>, SelectorError> {
    let chars: Vec<char> = src.chars().collect();
    let n = chars.len();
    let mut out = Vec::new();
    let mut i = 0;
    let mut after_pseudo_element = false;
    while i < n {
        lex_strict_step(&chars, &mut i, &mut out, &mut after_pseudo_element)?;
        if matches!(
            out.last(),
            Some(StrictTok::Ws | StrictTok::Comb | StrictTok::Comma)
        ) {
            after_pseudo_element = false;
        }
    }
    Ok(out)
}

fn lex_id_or_class(
    chars: &[char],
    i: &mut usize,
    c: char,
    out: &mut Vec<StrictTok>,
    after_pseudo_element: bool,
) -> Result<(), SelectorError> {
    *i += 1;
    if !starts_ident(chars, *i) {
        return Err(SelectorError::UnexpectedChar(c));
    }
    scan_name(chars, i, is_name_char);
    push_part(out, StrictTok::Part, after_pseudo_element)
}

fn lex_strict_step(
    chars: &[char],
    i: &mut usize,
    out: &mut Vec<StrictTok>,
    after_pseudo_element: &mut bool,
) -> Result<(), SelectorError> {
    let c = chars[*i];
    if let Some(result) = lex_strict_simple(chars, i, c, out) {
        return result;
    }
    if c == '*' || (c == '|' && !matches!(out.last(), Some(StrictTok::Part | StrictTok::Type))) {
        lex_universal_or_ns_prefix(chars, i, c, out, *after_pseudo_element)
    } else if matches!(c, '#' | '.') {
        lex_id_or_class(chars, i, c, out, *after_pseudo_element)
    } else if c == '[' {
        lex_attribute(chars, i, out, *after_pseudo_element)
    } else if c == ':' {
        lex_pseudo(chars, i, out, after_pseudo_element)
    } else if starts_ident(chars, *i) {
        scan_name(chars, i, is_name_char);
        push_part(out, StrictTok::Type, *after_pseudo_element)
    } else {
        Err(SelectorError::UnexpectedChar(c))
    }
}

/// Handle whitespace, ',' and combinator tokens. Returns `Some(_)` when the character
/// was handled (the result to propagate), `None` to let the caller continue.
fn lex_strict_simple(
    chars: &[char],
    i: &mut usize,
    c: char,
    out: &mut Vec<StrictTok>,
) -> Option<Result<(), SelectorError>> {
    if c == '|' && chars.get(*i + 1) == Some(&'|') {
        out.push(StrictTok::Comb);
        *i += 2;
        return Some(Ok(()));
    }
    if c.is_whitespace() {
        while *i < chars.len() && chars[*i].is_whitespace() {
            *i += 1;
        }
        out.push(StrictTok::Ws);
        return Some(Ok(()));
    }
    if c == ',' {
        out.push(StrictTok::Comma);
        *i += 1;
        return Some(Ok(()));
    }
    if explicit_combinator(c) {
        out.push(StrictTok::Comb);
        *i += 1;
        return Some(Ok(()));
    }
    None
}

fn lex_universal_or_ns_prefix(
    chars: &[char],
    i: &mut usize,
    c: char,
    out: &mut Vec<StrictTok>,
    after_pseudo_element: bool,
) -> Result<(), SelectorError> {
    if c == '*' {
        *i += 1;
    }
    if chars.get(*i) == Some(&'|') {
        if chars.get(*i + 1) == Some(&'*') {
            *i += 2;
        } else if starts_ident(chars, *i + 1) {
            *i += 1;
            scan_name(chars, i, is_name_char);
        } else {
            return Err(SelectorError::UnexpectedChar('|'));
        }
    }
    push_part(out, StrictTok::Type, after_pseudo_element)
}

fn lex_attribute(
    chars: &[char],
    i: &mut usize,
    out: &mut Vec<StrictTok>,
    after_pseudo_element: bool,
) -> Result<(), SelectorError> {
    *i += 1; // past '['
    let attribute = scan_balanced(chars, i, '[', ']');
    if *i >= chars.len() {
        return Err(SelectorError::UnterminatedAttribute);
    }
    if !units::valid_attribute(&attribute) {
        return Err(SelectorError::UnexpectedChar('['));
    }
    *i += 1; // past ']'
    push_part(out, StrictTok::Part, after_pseudo_element)
}

fn lex_pseudo(
    chars: &[char],
    i: &mut usize,
    out: &mut Vec<StrictTok>,
    after_pseudo_element: &mut bool,
) -> Result<(), SelectorError> {
    let n = chars.len();
    *i += 1; // past ':'
    let double = chars.get(*i) == Some(&':');
    if double {
        *i += 1;
    }
    if !starts_ident(chars, *i) {
        return Err(SelectorError::UnexpectedChar(':'));
    }
    let name_start = *i;
    scan_name(chars, i, is_name_char);
    let lower = chars[name_start..*i]
        .iter()
        .collect::<String>()
        .to_ascii_lowercase();
    if double || LEGACY_PSEUDO_ELEMENT_NAMES.contains(&lower.as_str()) {
        *after_pseudo_element = true;
    }
    let selector_list = matches!(lower.as_str(), "not" | "has");
    let state = chars[name_start..*i]
        .iter()
        .map(char::to_ascii_lowercase)
        .eq("state".chars());
    if *i < n && chars[*i] == '(' {
        lex_pseudo_argument(chars, i, n, &lower, selector_list, state)?;
    } else if state {
        return Err(SelectorError::UnexpectedChar(':'));
    }
    out.push(StrictTok::Part);
    Ok(())
}

fn invalid_state_ident(argument: &str, at_end: bool) -> bool {
    at_end || units::state_argument(&argument.encode_utf16().collect::<Vec<_>>()).is_none()
}

fn lex_pseudo_argument(
    chars: &[char],
    i: &mut usize,
    n: usize,
    lower: &str,
    selector_list: bool,
    state: bool,
) -> Result<(), SelectorError> {
    *i += 1; // past '('
    let argument = scan_balanced(chars, i, '(', ')');
    if selector_list {
        lex_strict(&argument)?;
    } else if matches!(lower, "nth-child" | "nth-last-child") {
        if let Some(at) = nth_of_position(argument.as_bytes()) {
            lex_strict(&argument[at + 2..])?;
        }
    }
    if state && invalid_state_ident(argument.as_str(), *i == n) {
        return Err(SelectorError::UnexpectedChar('('));
    }
    if *i < n {
        *i += 1;
    }
    Ok(())
}

/// Push a non-pseudo simple selector, rejecting one that follows a pseudo-element in the
/// same compound (`::before.x`, `::-webkit-scrollbar[a]`).
fn push_part(
    out: &mut Vec<StrictTok>,
    tok: StrictTok,
    after_pseudo_element: bool,
) -> Result<(), SelectorError> {
    if after_pseudo_element {
        return Err(SelectorError::Invalid(
            "simple selector after a pseudo-element",
        ));
    }
    out.push(tok);
    Ok(())
}

/// Structural validation of one selector-list item: a combinator must have a non-empty
/// compound on its LEFT (else "empty compound"), and a type selector must be the first
/// simple selector of its compound (`[a]div`). A trailing combinator passes here;
/// [`parse_for_cascade`] (which calls this per item) rejects it, as Chrome does.
fn validate_selector_list(src: &str) -> Result<(), SelectorError> {
    let toks = lex_strict(src)?;
    // `matched` = the compound currently being built has at least one part; whitespace
    // is a transparent separator.
    let mut matched = false;
    // `compound` = the current compound has a part not separated from the next by
    // whitespace (a type selector must come first).
    let mut compound = false;
    for t in &toks {
        match t {
            // callers validate one top-level item (commas inside arguments are lexed
            // by the nested `lex_strict` only)
            StrictTok::Comma => unreachable!("validate_selector_list takes one item"),
            StrictTok::Ws => compound = false,
            StrictTok::Comb => {
                if !matched {
                    return Err(SelectorError::EmptyCompound);
                }
                // a compound must follow (a trailing combinator is the stylesheet layer's
                // concern: `parse_for_cascade` rejects it)
                (matched, compound) = (false, false);
            }
            StrictTok::Type if compound => {
                return Err(SelectorError::Invalid(
                    "type selector after another simple selector",
                ));
            }
            StrictTok::Type | StrictTok::Part => (matched, compound) = (true, true),
        }
    }
    Ok(())
}

/// Scan from just past an opening `open` to its matching `close`, honoring quotes
/// and nesting. Returns the inner text and leaves `*i` on the closing delimiter
/// (or at end if unterminated). Centralizing this is the whole point: `[...]` and
/// `(...)` share one balanced, quote-aware scanner instead of two ad-hoc loops.
fn scan_balanced(chars: &[char], i: &mut usize, open: char, close: char) -> String {
    let start = *i;
    let mut depth = 1i32;
    let mut quote: Option<char> = None;
    while *i < chars.len() {
        let c = chars[*i];
        if c == '\\' {
            *i = (*i + 2).min(chars.len());
            continue;
        }
        if let Some(q) = quote {
            if c == q {
                quote = None;
            }
        } else if matches!(c, '"' | '\'') {
            quote = Some(c);
        } else if c == open {
            depth += 1;
        } else if c == close {
            depth -= 1;
            if depth == 0 {
                break;
            }
        }
        *i += 1;
    }
    chars[start..*i].iter().collect()
}

/// Lex one complex selector (already comma-split + trimmed) into tokens.
fn tokenize(src: &str) -> Vec<Token> {
    let chars: Vec<char> = src.chars().collect();
    let n = chars.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        let ch = chars[i];
        match ch {
            c if c.is_whitespace() => {
                // collapse a whitespace run into a single descendant separator
                while i < n && chars[i].is_whitespace() {
                    i += 1;
                }
                out.push(Token::Ws);
            }
            '>' => {
                out.push(Token::Gt);
                i += 1;
            }
            '+' => {
                out.push(Token::Plus);
                i += 1;
            }
            '~' => {
                out.push(Token::Tilde);
                i += 1;
            }
            '|' if chars.get(i + 1) == Some(&'|') => {
                out.push(Token::Column);
                i += 2;
            }
            c if custom_combinator_symbol(c) => {
                out.push(Token::Custom(c));
                i += 1;
            }
            '#' => {
                out.push(Token::Hash);
                i += 1;
            }
            '.' => {
                out.push(Token::Dot);
                i += 1;
            }
            ':' => {
                out.push(Token::Colon);
                i += 1;
            }
            '[' => {
                i += 1; // past '['
                let inner = scan_balanced(&chars, &mut i, '[', ']');
                if i < n {
                    i += 1; // past ']'
                }
                out.push(Token::Attr(inner));
            }
            '(' => {
                i += 1; // past '('
                let inner = scan_balanced(&chars, &mut i, '(', ')');
                if i < n {
                    i += 1; // past ')'
                }
                out.push(Token::Paren(inner));
            }
            // a stray closer at top level isn't part of any token — drop it
            ']' | ')' => i += 1,
            _ => {
                let start = i;
                while i < n
                    && !is_special(chars[i])
                    && !(chars[i] == '|' && chars.get(i + 1) == Some(&'|'))
                {
                    i += 1;
                }
                out.push(Token::Ident(chars[start..i].iter().collect()));
            }
        }
    }
    out
}

/// Consume the `Ident` at `*i` (advancing past it) or `""` if the current token
/// isn't an `Ident`. Lets `.`/`#`/`:` with no following name yield an empty
/// class/id/pseudo-name — exactly the old "read until the next part-start" result.
fn take_ident(toks: &[Token], i: &mut usize) -> String {
    if let Some(Token::Ident(s)) = toks.get(*i) {
        let s = s.clone();
        *i += 1;
        s
    } else {
        String::new()
    }
}

/// Parse a single compound starting at `*i`, stopping at a combinator (`Ws`/`Gt`)
/// or end. Leniency preserved: a bare `Ident` in the suffix position (e.g. the
/// trailing `y` of `div[id=x]y`) is skipped, an unknown pseudo becomes
/// `Pseudo::Unknown`, and a leading `Ident` of `"*"` means "any tag".
fn parse_compound_tokens(toks: &[Token], i: &mut usize) -> Compound {
    let mut c = Compound::default();
    // optional leading type selector (with an optional `*|` / `|` namespace prefix)
    if let Some(Token::Ident(s)) = toks.get(*i) {
        (c.namespace, c.tag) = split_type_selector(s);
        *i += 1;
    }
    while let Some(tok) = toks.get(*i) {
        match tok {
            Token::Ws
            | Token::Gt
            | Token::Plus
            | Token::Tilde
            | Token::Column
            | Token::Custom(_) => break,
            Token::Dot => {
                *i += 1;
                c.id_is_candidate = false;
                let index = c.classes.len();
                c.classes.push(take_ident(toks, i));
                c.order.push(CompoundPart::Class(index));
            }
            Token::Hash => {
                *i += 1;
                let id = take_ident(toks, i);
                c.id = Some(id.clone());
                c.id_is_candidate = true;
                c.order.push(CompoundPart::Id(id));
            }
            Token::Colon => {
                *i += 1;
                let name = take_ident(toks, i);
                // borrow the paren's argument text — parse_pseudo takes &str, so the
                // old `.clone()` here only to immediately re-borrow was pure waste.
                let arg = match toks.get(*i) {
                    Some(Token::Paren(p)) => {
                        *i += 1;
                        Some(p.as_str())
                    }
                    _ => None,
                };
                let index = c.pseudos.len();
                c.pseudos.push(parse_pseudo(&name, arg));
                c.order.push(CompoundPart::Pseudo(index));
            }
            Token::Attr(inner) => {
                let index = c.attrs.len();
                let attribute = parse_attr(inner);
                c.attrs.push(attribute);
                c.order.push(CompoundPart::Attribute(index));
                *i += 1;
            }
            // bare ident (lenient trailing junk) or stray paren → ignore
            Token::Ident(_) | Token::Paren(_) => *i += 1,
        }
    }
    c
}

/// Split a selector string on TOP-LEVEL commas only — commas inside `[...]`,
/// `(...)`, or quoted strings are NOT separators. Mirrors the JS `splitTopLevel`
/// and is required now that `:is()/:where()/:not()` arguments hold comma-separated
/// lists: a naive `split(',')` would break `li:not(.a, .b)` mid-paren.
fn split_top_level_commas(src: &str) -> Vec<&str> {
    let bytes = src.as_bytes();
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut quote: Option<u8> = None;
    let mut last = 0usize;
    let mut escaped = false;
    for (i, &b) in bytes.iter().enumerate() {
        if escaped {
            escaped = false;
            continue;
        }
        if b == b'\\' {
            escaped = true;
            continue;
        }
        if top_level_comma_at(b, &mut quote, &mut depth) {
            out.push(&src[last..i]);
            last = i + 1;
        }
    }
    out.push(&src[last..]);
    out
}

/// Advance the quote/bracket state for one byte and return `true` iff this byte is a
/// top-level comma (outside quotes and all brackets). The in/out `quote` and `depth`
/// track the running state; an escaped byte (`\\c`) must be filtered out upstream.
fn top_level_comma_at(b: u8, quote: &mut Option<u8>, depth: &mut i32) -> bool {
    if let Some(q) = *quote {
        if b == q {
            *quote = None;
        }
        return false;
    }
    match b {
        b'"' | b'\'' => {
            *quote = Some(b);
        }
        b'(' | b'[' => *depth += 1,
        b')' | b']' => *depth -= 1,
        b',' if *depth == 0 => return true,
        _ => {}
    }
    false
}

/// Parse a pseudo argument as a SELECTOR LIST (comma-separated complex selectors)
/// for `:is(...)` / `:where(...)` / `:not(...)`. Each non-empty segment becomes a
/// `Complex` (reusing `parse_complex`); empty segments are dropped. A single-item
/// list is the degenerate `:not(.x)` case, so existing behavior is preserved.
fn parse_selector_list_str(src: &str) -> Vec<Complex> {
    split_top_level_commas(src)
        .into_iter()
        .filter_map(|s| parse_complex(s.trim()))
        .collect()
}

/// Parse a `:has()` argument into a list of relative selectors. Each top-level
/// comma segment may begin with a combinator (`>`/`+`/`~`); absent ⇒ descendant.
/// The remainder is parsed as a normal complex (reusing `parse_complex`). Segments
/// that yield no complex (empty, or a lone combinator) are dropped.
fn parse_relative_selector_list(src: &str) -> Vec<RelativeSelector> {
    split_top_level_commas(src)
        .into_iter()
        .filter_map(|seg| {
            // Tokenize once, then strip the leading combinator at the TOKEN level
            // (mirrors the JS parseRelativeSelectorList): skip a leading `Ws`, then
            // peek for a `Gt`/`Plus`/`Tilde` combinator token — combinator recognition
            // stays inside the lexer rather than re-spelled on raw bytes.
            let toks = tokenize(seg);
            let mut lo = 0;
            while matches!(toks.get(lo), Some(Token::Ws)) {
                lo += 1; // skip the segment's leading whitespace
            }
            let combinator = match toks.get(lo) {
                Some(Token::Gt) => {
                    lo += 1;
                    Combinator::Child
                }
                Some(Token::Plus) => {
                    lo += 1;
                    Combinator::Adjacent
                }
                Some(Token::Tilde) => {
                    lo += 1;
                    Combinator::GeneralSibling
                }
                Some(Token::Column) => {
                    lo += 1;
                    Combinator::Column
                }
                Some(Token::Custom(symbol)) => {
                    lo += 1;
                    Combinator::Custom(*symbol, None)
                }
                _ => Combinator::Descendant,
            };
            parse_complex_tokens(&toks[lo..]).map(|mut complex| {
                forgive_nested_has(&mut complex);
                RelativeSelector {
                    combinator,
                    complex,
                }
            })
        })
        .collect()
}

/// Inside `:has()`, the forgiving `:is()` / `:where()` / `:-webkit-any()` drop their items
/// that contain a nested `:has()` (Chrome 156: `:has(:is(p, :has(q)))` is `:has(p)`); a
/// direct or unforgiving nesting is a stylesheet error (`query_cascade::reject_nested_has`).
fn forgive_nested_has(complex: &mut Complex) {
    let compounds =
        std::iter::once(&mut complex.first).chain(complex.rest.iter_mut().map(|(_, c)| c));
    for compound in compounds {
        for pseudo in &mut compound.pseudos {
            if let Pseudo::Is(list)
            | Pseudo::Matches(list)
            | Pseudo::Where(list)
            | Pseudo::WebkitAny(list) = pseudo
            {
                list.retain(|c| !cascade::contains_has(c));
            }
        }
    }
}

/// Does a selector-list argument have an invalid item: empty (`p, `, `,p`, `p,,a`, or
/// nothing), ending in a combinator (`p >`), or — unless `relative` (`:has()`) —
/// starting with one (`> p`)? The unforgiving lists reject it.
fn has_empty_item(arg: &str, relative: bool) -> bool {
    split_top_level_commas(arg)
        .iter()
        .any(|item| invalid_list_item(item, relative))
}

/// See [`has_empty_item`]; an escaped `\>` is a name, not a combinator.
fn invalid_list_item(item: &str, relative: bool) -> bool {
    let item = item.trim();
    let mut tail = item.chars().rev();
    item.is_empty()
        || (tail.next().is_some_and(explicit_combinator) && tail.next() != Some('\\'))
        || (!relative && item.starts_with(explicit_combinator))
}

/// A forgiving list (`:is()` / `:where()`): its invalid items are dropped.
fn parse_forgiving_list(src: &str) -> Vec<Complex> {
    split_top_level_commas(src)
        .into_iter()
        .filter(|item| !invalid_list_item(item, false))
        .filter_map(|item| parse_complex(item.trim()))
        .collect()
}

/// Parse `:nth-child(...)` / `:nth-last-child(...)`. Returns `Pseudo::Unknown` for an
/// invalid `An+B`, an invalid `of S` list, or an unrecognized `name`.
fn parse_nth_child_pseudo(name: &str, arg: &str) -> Pseudo {
    let last = name == "nth-last-child";
    if let Some((anb, of)) = split_nth_of(arg) {
        if !valid_anb(anb) || has_empty_item(of, false) {
            return Pseudo::unknown(name, Some(arg));
        }
        let (a, b) = parse_nth(anb);
        let mut of = parse_selector_list_str(of);
        if of.iter().any(|selector| {
            std::iter::once(&selector.first)
                .chain(selector.rest.iter().map(|(_, compound)| compound))
                .any(|compound| {
                    compound
                        .pseudos
                        .iter()
                        .any(cascade::is_pseudo_element_marker)
                })
        }) {
            // NWSAPI accepts pseudo-elements in the `of S` clause but they never match
            // an element, so this filtered sibling set is empty.
            of.clear();
        }
        if last {
            Pseudo::NthLastChildOf(a, b, of)
        } else {
            Pseudo::NthChildOf(a, b, of)
        }
    } else {
        if !valid_anb(arg) {
            return Pseudo::unknown(name, Some(arg));
        }
        let (a, b) = parse_nth(arg);
        if last {
            Pseudo::NthLastChild(a, b)
        } else {
            Pseudo::NthChild(a, b)
        }
    }
}

/// Parse `:nth-of-type(...)` / `:nth-last-of-type(...)`. Returns `Pseudo::Unknown` for an
/// invalid `An+B`.
fn parse_nth_of_type_pseudo(name: &str, arg: &str) -> Pseudo {
    if !valid_anb(arg) {
        return Pseudo::unknown(name, Some(arg));
    }
    let (a, b) = parse_nth(arg);
    if name == "nth-of-type" {
        Pseudo::NthOfType(a, b)
    } else {
        Pseudo::NthLastOfType(a, b)
    }
}

/// Map a pseudo `name` + optional `arg` to a `Pseudo`. Unrecognized → `Unknown`
/// (never matches). Mirrors selectors.mjs `matchPseudo` switch.
fn parse_pseudo(name: &str, arg: Option<&str>) -> Pseudo {
    // pseudo-class names are ASCII case-insensitive (`P:FIRST-CHILD`, `:Not(.x)`)
    if name.bytes().any(|b| b.is_ascii_uppercase()) {
        return match parse_pseudo(&name.to_ascii_lowercase(), arg) {
            // keep the author's spelling for the stylesheet layer's checks and errors
            Pseudo::Unknown(_) => Pseudo::unknown(name, arg),
            parsed => parsed,
        };
    }
    if name.eq_ignore_ascii_case("state") {
        return arg
            .and_then(|value| units::state_argument(&value.encode_utf16().collect::<Vec<_>>()))
            .map_or_else(|| Pseudo::unknown(name, arg), Pseudo::State);
    }
    if name == "heading" {
        return arg.map_or(Pseudo::Heading(0b11_1111), |levels| {
            heading_levels(levels).map_or_else(|| Pseudo::unknown(name, arg), Pseudo::Heading)
        });
    }
    if name == "has-slotted" {
        return arg.map_or(Pseudo::HasSlotted(None, None), |source| {
            if split_top_level_commas(source).len() == 1 && validate_selector_list(source).is_ok() {
                if let Some(compound) =
                    parse_complex(source).filter(|selector| selector.rest.is_empty())
                {
                    return Pseudo::HasSlotted(
                        Some(Box::new(compound)),
                        Some(source.trim().to_string()),
                    );
                }
            }
            Pseudo::unknown(name, arg)
        });
    }
    if name == "current" {
        if arg.is_none() {
            return Pseudo::HostState(SelectorState::Current);
        }
        return arg
            .and_then(|source| {
                let items = split_top_level_commas(source);
                let selectors = parse_selector_list_str(source);
                (!items.is_empty()
                    && items.len() == selectors.len()
                    && items.iter().all(|item| !item.trim().is_empty())
                    && selectors.iter().all(|s| s.rest.is_empty()))
                .then_some(Pseudo::Unknown(UnknownPseudo {
                    name: name.to_string(),
                    arg: Some(source.to_string()),
                }))
            })
            .unwrap_or_else(|| Pseudo::unknown(name, arg));
    }
    if name == "active-view-transition-type" {
        let valid = arg.is_some_and(|list| {
            let items = split_top_level_commas(list);
            !items.is_empty()
                && items.iter().all(|item| {
                    units::lang_range(&item.trim().encode_utf16().collect::<Vec<_>>()).is_some()
                })
        });
        return if valid {
            Pseudo::Unknown(UnknownPseudo {
                name: name.to_string(),
                arg: arg.map(str::to_string),
            })
        } else {
            Pseudo::unknown(name, arg)
        };
    }
    // arity: a functional pseudo needs its argument, a plain one must not have one (both
    // are SyntaxErrors in Chrome; the lenient path never matches them)
    let functional = matches!(
        name,
        "nth-child"
            | "nth-last-child"
            | "nth-of-type"
            | "nth-last-of-type"
            | "is"
            | "matches"
            | "host-context"
            | "where"
            | "not"
            | "has"
            | "lang"
            | "dir"
            | "-webkit-any"
            | "current"
            | "active-view-transition-type"
    );
    let functional = functional || (name == "host" && arg.is_some());
    if functional != arg.is_some() {
        return Pseudo::unknown(name, arg);
    }
    if name == "host-context" {
        let selectors = parse_selector_list_str(arg.unwrap_or(""));
        if selectors.is_empty() || selectors.iter().any(|selector| !selector.rest.is_empty()) {
            return Pseudo::unknown(name, arg);
        }
    }
    if arg.is_none() {
        if name == "-webkit-autofill" {
            return Pseudo::HostState(SelectorState::Autofill);
        }
        match name {
            "-webkit-full-screen" => return Pseudo::Fullscreen,
            "-webkit-full-screen-ancestor" => {
                return Pseudo::HostState(SelectorState::FullscreenAncestor);
            }
            _ => {}
        }
        if let Some(state) = SelectorState::from_pseudo(name) {
            if !matches!(
                state,
                SelectorState::Open | SelectorState::Closed | SelectorState::Fullscreen
            ) {
                return Pseudo::HostState(state);
            }
        }
    }
    match name {
        "popover" => Pseudo::HostState(SelectorState::PopoverOpen),
        "first-child" => Pseudo::FirstChild,
        "last-child" => Pseudo::LastChild,
        "only-child" => Pseudo::OnlyChild,
        "first-of-type" => Pseudo::FirstOfType,
        "last-of-type" => Pseudo::LastOfType,
        "only-of-type" => Pseudo::OnlyOfType,
        "empty" => Pseudo::Empty,
        "root" => Pseudo::Root,
        "scope" => Pseudo::Scope,
        "checked" => Pseudo::Checked,
        "disabled" => Pseudo::Disabled,
        "enabled" => Pseudo::Enabled,
        "required" => Pseudo::Required,
        "optional" => Pseudo::Optional,
        "read-only" => Pseudo::ReadOnly,
        "read-write" => Pseudo::ReadWrite,
        "selected" => Pseudo::Selected,
        "link" | "any-link" => Pseudo::Link,
        "host" | "host-context" => {
            let contextual = name == "host-context";
            if contextual && arg.is_none() {
                Pseudo::unknown(name, arg)
            } else if let Some(argument) = arg {
                let selectors = parse_selector_list_str(argument);
                if selectors.is_empty()
                    || selectors.iter().any(|selector| !selector.rest.is_empty())
                {
                    Pseudo::unknown(name, arg)
                } else {
                    Pseudo::Host {
                        selectors: Some(selectors),
                        contextual,
                    }
                }
            } else {
                Pseudo::Host {
                    selectors: None,
                    contextual,
                }
            }
        }
        "defined" => Pseudo::Defined,
        "open" | "closed" => Pseudo::Open(name == "open"),
        "fullscreen" => Pseudo::Fullscreen,
        "nth-child" | "nth-last-child" => parse_nth_child_pseudo(name, arg.unwrap_or("")),
        "nth-of-type" | "nth-last-of-type" => parse_nth_of_type_pseudo(name, arg.unwrap_or("")),
        "is" => Pseudo::Is(parse_forgiving_list(arg.unwrap_or(""))),
        "matches" => Pseudo::Matches(parse_forgiving_list(arg.unwrap_or(""))),
        "where" => Pseudo::Where(parse_forgiving_list(arg.unwrap_or(""))),
        // the unforgiving lists reject an empty item (`:not(p, )`; Chrome: SyntaxError)
        "not" if has_empty_item(arg.unwrap_or(""), false) => Pseudo::unknown(name, arg),
        "has" if has_empty_item(arg.unwrap_or(""), true) => Pseudo::unknown(name, arg),
        "not" => Pseudo::Not(parse_selector_list_str(arg.unwrap_or(""))),
        "has" => Pseudo::Has(parse_relative_selector_list(arg.unwrap_or(""))),
        "-webkit-any" => cascade::webkit_any(arg.unwrap_or(""))
            .map_or_else(|| Pseudo::unknown(name, arg), Pseudo::WebkitAny),
        "lang" => arg
            .and_then(language::parse)
            .map_or_else(|| Pseudo::unknown(name, arg), Pseudo::Lang),
        // one identifier, like `:lang()` (`:dir("ltr")`, `:dir(ltr, rtl)` are invalid)
        "dir" => arg
            .and_then(|arg| units::lang_range(&arg.encode_utf16().collect::<Vec<_>>()))
            .map_or_else(
                || Pseudo::unknown(name, arg),
                |value| {
                    Pseudo::Dir(match value.as_str() {
                        "ltr" => Some(false),
                        "rtl" => Some(true),
                        _ => None,
                    })
                },
            ),
        _ => Pseudo::unknown(name, arg),
    }
}

fn heading_levels(levels: &str) -> Option<u8> {
    let mut mask = 0;
    for level in levels.split(',') {
        let level = level.trim_matches([' ', '\t', '\n', '\r', '\x0c']);
        let digits = level.strip_prefix(['+', '-']).unwrap_or(level);
        if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        if level.starts_with('-') {
            continue;
        }
        if let [digit @ b'1'..=b'6'] = digits.trim_start_matches('0').as_bytes() {
            mask |= 1 << (*digit - b'1');
        }
    }
    Some(mask)
}

/// Position of the `of` keyword in an `:nth-child()` / `:nth-last-child()` argument
/// (`2n+1 of .x`): lowercase `of` (Chrome rejects `OF`), whitespace before it, a non-empty
/// `An+B` part, and no name code point right after it (`of.x` is fine, `ofx` is not). Works on any code-unit slice so the
/// UTF-16 parser shares it; `An+B` is ASCII, so the first such `of` is the keyword.
fn nth_of_position<T: Copy + Into<u32>>(units: &[T]) -> Option<usize> {
    let unit = |i: usize| units.get(i).map(|&u| u.into());
    let space = |u: u32| matches!(u, 9 | 10 | 12 | 13 | 32);
    (1..units.len().saturating_sub(1)).find(|&i| {
        let after = unit(i + 2);
        unit(i) == Some(u32::from(b'o'))
            && unit(i + 1) == Some(u32::from(b'f'))
            && unit(i - 1).is_some_and(space)
            && units[..i].iter().any(|&u| !space(u.into()))
            && after.is_none_or(|u| {
                u < 128
                    && !(char::from_u32(u).is_some_and(|c| c.is_ascii_alphanumeric())
                        || u == u32::from(b'_')
                        || u == u32::from(b'-')
                        || u == u32::from(b'\\'))
            })
    })
}

/// Split `An+B of S` into `("An+B", "S")`; `None` when there is no `of` clause.
fn split_nth_of(arg: &str) -> Option<(&str, &str)> {
    let bytes = arg.as_bytes();
    nth_of_position(bytes).map(|at| (&arg[..at], &arg[at + 2..]))
}

/// Is `arg` a valid `<an+b>` (CSS Syntax 3 §6): `odd`, `even`, an integer, or `An+B` with
/// the sign glued to its number or `n` (`2n + 1`, `2n- 1`, `-n+3`, `+5`), ASCII
/// case-insensitive, surrounded by optional whitespace. `foo`, `2n+`, `+ 2n`, `2 n` and
/// `2.5n` are not (Chrome: `SyntaxError`).
fn anb_glued_overflow(b: &[u8], s: &str, i: usize) -> bool {
    b.get(i) == Some(&b'-')
        && b.get(i + 1).is_some_and(u8::is_ascii_digit)
        && clamped_int(true, &s[i + 1..]) == i64::from(i32::MIN) - 1
}

fn valid_anb(arg: &str) -> bool {
    let space = |b: u8| matches!(b, b' ' | b'\t' | b'\n' | b'\r' | 0x0c);
    let s = arg
        .trim_matches(|c: char| c.is_ascii() && space(c as u8))
        .to_ascii_lowercase();
    if matches!(s.as_str(), "odd" | "even") {
        return true;
    }
    let b = s.as_bytes();
    let mut i = usize::from(matches!(b.first(), Some(b'+' | b'-')));
    let digits = |i: &mut usize| {
        let start = *i;
        while b.get(*i).is_some_and(u8::is_ascii_digit) {
            *i += 1;
        }
        *i > start
    };
    let coefficient = digits(&mut i);
    if b.get(i) != Some(&b'n') {
        return coefficient && i == b.len();
    }
    i += 1;
    if anb_glued_overflow(b, &s, i) {
        return false;
    }
    let skip = |i: &mut usize| {
        while b.get(*i).copied().is_some_and(space) {
            *i += 1;
        }
    };
    skip(&mut i);
    if i == b.len() {
        return true;
    }
    if !matches!(b[i], b'+' | b'-') {
        return false;
    }
    i += 1;
    skip(&mut i);
    if !digits(&mut i) {
        return false;
    }
    skip(&mut i);
    i == b.len()
}

/// Parse an `An+B` / `odd` / `even` / integer argument into `(a, b)` coefficients
/// (so the predicate is `nth_match(a, b, index)`). Mirrors selectors.mjs `nthMatch`
/// keyword handling. A pure integer `k` → `(0, k)`; `odd` → `(2, 1)`; `even` → `(2, 0)`.
/// Unparseable → `(0, 0)` which matches index 0 (never, since indices are 1-based).
fn parse_nth(arg: &str) -> (i64, i64) {
    let a0: String = arg
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if a0 == "odd" {
        return (2, 1);
    }
    if a0 == "even" {
        return (2, 0);
    }
    // An+B form
    if let Some(npos) = a0.find('n') {
        let acoef = &a0[..npos];
        let a = match acoef {
            "" | "+" => 1,
            "-" => -1,
            s => signed_int(s),
        };
        let brest = &a0[npos + 1..];
        let b = if brest.is_empty() {
            0
        } else {
            signed_int(brest)
        };
        return (a, b);
    }
    // bare integer
    (0, signed_int(&a0))
}

/// A validated `[+-]digits` integer as Chrome stores it: clamped to 32 bits.
fn signed_int(s: &str) -> i64 {
    let negative = s.starts_with('-');
    let digits = s.trim_start_matches(['+', '-']);
    clamped_int(negative, digits).clamp(i64::from(i32::MIN), i64::from(i32::MAX))
}

/// The value of `digits` (ASCII digits, leading ones only) with that sign, saturating
/// one past the 32-bit range (so `i32::MIN - 1` / `i32::MAX + 1` mean "does not fit").
fn clamped_int(negative: bool, digits: &str) -> i64 {
    let limit = i64::from(i32::MAX) + 2;
    let magnitude = digits
        .bytes()
        .take_while(u8::is_ascii_digit)
        .fold(0i64, |v, d| (v * 10 + i64::from(d - b'0')).min(limit));
    if negative {
        (-magnitude).max(i64::from(i32::MIN) - 1)
    } else {
        magnitude.min(i64::from(i32::MAX) + 1)
    }
}

/// Does 1-based `index` satisfy `an+b`? Mirrors selectors.mjs `nthMatch`:
/// for a==0, exact match; otherwise `(index-b) % a == 0 && (index-b)/a >= 0`.
/// Chrome 156 matches nothing when A or B is outside 31 bits (`1073741824n+1`).
fn nth_match(a: i64, b: i64, index: i64) -> bool {
    const LIMIT: i64 = 1 << 30;
    if !(-LIMIT..LIMIT).contains(&a) || !(-LIMIT..LIMIT).contains(&b) {
        return false;
    }
    if a == 0 {
        return index == b;
    }
    let d = index - b;
    d % a == 0 && d / a >= 0
}

fn parse_attr(inner: &str) -> Attr {
    if let Some(attribute) = units::specialized_attribute(inner) {
        return attribute;
    }
    match inner.find('=') {
        Some(eq) => {
            // operator char (if any) sits immediately before '='
            let raw_name = &inner[..eq];
            let mut val = inner[eq + 1..].trim();
            // Strip matching surrounding quotes. The `len >= 2` guard is load-bearing: a
            // lone quote char (unterminated value, e.g. `[a="`) satisfies both
            // starts_with AND ends_with on the same byte, and `val[1..0]` would panic.
            // Mirrors the JS `value.length >= 2` guard in selectors.mjs parseAttr.
            if val.len() >= 2
                && ((val.starts_with('"') && val.ends_with('"'))
                    || (val.starts_with('\'') && val.ends_with('\'')))
            {
                val = &val[1..val.len() - 1];
            }
            let val = val.to_string();
            let (m, name) = match raw_name.as_bytes().last() {
                Some(b'~') => (AttrMatch::Includes(val), &raw_name[..raw_name.len() - 1]),
                Some(b'|') => unreachable!("`|=` takes the unit path"),
                Some(b'^') => (AttrMatch::Prefix(val), &raw_name[..raw_name.len() - 1]),
                Some(b'$') => (AttrMatch::Suffix(val), &raw_name[..raw_name.len() - 1]),
                Some(b'*') => (AttrMatch::Substr(val), &raw_name[..raw_name.len() - 1]),
                _ => (AttrMatch::Equals(val), raw_name),
            };
            Attr::new(name.trim().to_string(), m)
        }
        None => Attr::new(inner.trim().to_string(), AttrMatch::Present),
    }
}

/// Parse one complex selector (already comma-split + trimmed) into an
/// `Option<Complex>` — `None` when the segment yields no compound at all (empty
/// or combinator-only), so empty segments are dropped at PARSE time and a built
/// `Complex` is always non-empty. A `Gt` between two compounds is a child
/// combinator; otherwise (whitespace or nothing) it is descendant — matching the
/// old "default descendant, `>` ⇒ child" rule exactly. Leading/trailing/extra
/// `Ws` are inert separators, and a leading/trailing combinator simply never
/// lands in `rest` (so `a >` parses to `Complex { first: a, rest: [] }` and
/// matches exactly what `a` matches).
fn parse_complex(src: &str) -> Option<Complex> {
    parse_complex_tokens(&tokenize(src))
}

/// Token-level `parse_complex`: run the compound/combinator loop over an
/// already-tokenized slice. Mirrors the JS `parseComplexTokens` so a caller that
/// has tokenized once (e.g. the `:has()` relative parse) can hand off a sub-slice.
fn parse_complex_tokens(toks: &[Token]) -> Option<Complex> {
    let mut first: Option<Compound> = None;
    let mut rest: Vec<(Combinator, Compound)> = Vec::new();
    let mut combinator = Combinator::Descendant;
    let mut i = 0;
    while i < toks.len() {
        match toks[i] {
            Token::Ws => i += 1,
            Token::Gt => {
                combinator = Combinator::Child;
                i += 1;
            }
            Token::Plus => {
                combinator = Combinator::Adjacent;
                i += 1;
            }
            Token::Tilde => {
                combinator = Combinator::GeneralSibling;
                i += 1;
            }
            Token::Column => {
                combinator = Combinator::Column;
                i += 1;
            }
            Token::Custom(symbol) => {
                combinator = Combinator::Custom(symbol, None);
                i += 1;
            }
            _ => {
                let c = parse_compound_tokens(toks, &mut i);
                if first.is_none() {
                    // the head carries no combinator (a leading `>` is inert)
                    first = Some(c);
                } else {
                    rest.push((combinator, c));
                }
                combinator = Combinator::Descendant;
            }
        }
    }
    first.map(|first| Complex { first, rest })
}

/// whole-word class scan, alloc-free — mirrors JS `hasClass`.
fn has_class(class_attr: &str, cls: &str) -> bool {
    if cls.is_empty() {
        return false;
    }
    let bytes = class_attr.as_bytes();
    let mut search = 0;
    while let Some(rel) = class_attr[search..].find(cls) {
        let pos = search + rel;
        let before_ok = pos == 0 || bytes[pos - 1].is_ascii_whitespace();
        let end = pos + cls.len();
        let after_ok = end == bytes.len() || bytes[end].is_ascii_whitespace();
        if before_ok && after_ok {
            return true;
        }
        search = end;
    }
    false
}

/// The structure selector matching reads around an element: its scoped parent and element
/// siblings, its structural position, its type name, `:root` and `:empty`, and the
/// descendants `:has()` searches. Matching is generic over it so one engine serves every
/// context:
///
/// - [`LiveNavigator`]: the live [`Tree`] with raw-node semantics (`matches`,
///   `querySelector*`): a parent may be a fragment or the document, `template > p` is false
///   while `template p` crosses into the content, a parentless element is its own only
///   sibling.
/// - a layout view (turbo-dom-layout's `TreeView` scope): kept nodes only, scope cut-offs,
///   the document scope, markers — used through [`match_for_cascade`].
///
/// Element-side state (names, namespaces, attributes, form state, custom states) is always
/// read from [`Navigator::tree`].
pub trait Navigator {
    /// The tree the elements live in.
    fn tree(&self) -> &Tree;
    /// The node combinators and ancestor walks step to from `h` (any node type: matching
    /// rejects non-elements), or `None` past the scope root.
    fn parent(&self, h: Handle) -> Option<Handle>;
    /// The element sibling right before `h` in the scope.
    fn previous_element_sibling(&self, h: Handle) -> Option<Handle>;
    /// The element sibling right after `h` in the scope.
    fn next_element_sibling(&self, h: Handle) -> Option<Handle>;
    /// `h`'s element siblings in order, `h` included.
    fn element_siblings(&self, h: Handle) -> Vec<Handle>;
    /// Whether `a` and `b` have the same element type (`*-of-type`).
    fn same_type(&self, a: Handle, b: Handle) -> bool;
    /// `(index, count)`: `h`'s 1-based index among its element siblings and their number.
    fn child_position(&self, h: Handle) -> (usize, usize) {
        let siblings = self.element_siblings(h);
        let index = siblings.iter().position(|&s| s == h).map_or(0, |i| i + 1);
        (index, siblings.len())
    }
    /// 1-based index of `h` among its element siblings.
    fn child_index(&self, h: Handle) -> usize {
        let mut index = 1;
        let mut cur = h;
        while let Some(prev) = self.previous_element_sibling(cur) {
            index += 1;
            cur = prev;
        }
        index
    }
    /// 1-based index of `h` from the end among its element siblings.
    fn child_last_index(&self, h: Handle) -> usize {
        let mut index = 1;
        let mut cur = h;
        while let Some(next) = self.next_element_sibling(cur) {
            index += 1;
            cur = next;
        }
        index
    }
    /// `(index, count)` among the element siblings of `h`'s type.
    fn type_position(&self, h: Handle) -> (usize, usize) {
        let same: Vec<Handle> = self
            .element_siblings(h)
            .into_iter()
            .filter(|&s| self.same_type(s, h))
            .collect();
        let index = same.iter().position(|&s| s == h).map_or(0, |i| i + 1);
        (index, same.len())
    }
    /// 1-based index of `h` among element siblings of the same type.
    fn type_index(&self, h: Handle) -> usize {
        let mut index = 1;
        let mut cur = h;
        while let Some(prev) = self.previous_element_sibling(cur) {
            if self.same_type(prev, h) {
                index += 1;
            }
            cur = prev;
        }
        index
    }
    /// 1-based index of `h` from the end among element siblings of the same type.
    fn type_last_index(&self, h: Handle) -> usize {
        let mut index = 1;
        let mut cur = h;
        while let Some(next) = self.next_element_sibling(cur) {
            if self.same_type(next, h) {
                index += 1;
            }
            cur = next;
        }
        index
    }
    /// Whether no preceding element sibling has the same type as `h`.
    fn is_first_of_type(&self, h: Handle) -> bool {
        let mut cur = h;
        while let Some(prev) = self.previous_element_sibling(cur) {
            if self.same_type(prev, h) {
                return false;
            }
            cur = prev;
        }
        true
    }
    /// Whether no following element sibling has the same type as `h`.
    fn is_last_of_type(&self, h: Handle) -> bool {
        let mut cur = h;
        while let Some(next) = self.next_element_sibling(cur) {
            if self.same_type(next, h) {
                return false;
            }
            cur = next;
        }
        true
    }
    /// The name type selectors compare against (ASCII case-insensitively); `None` means no
    /// type selector matches `h`.
    fn type_name(&self, h: Handle) -> Option<&str>;
    /// `:root`.
    fn is_root(&self, h: Handle) -> bool;
    /// `:scope`: without a scoping element (document queries, stylesheets) it is `:root`.
    fn is_scope(&self, h: Handle) -> bool {
        self.is_root(h)
    }
    /// Shadow root whose tree is currently being matched, if the embedder supplies one.
    fn shadow_scope(&self) -> Option<Handle> {
        None
    }
    /// `:empty`.
    fn is_empty(&self, h: Handle) -> bool;
    /// Whether some descendant element of `root` (in the scope, `root` excluded) satisfies
    /// `pred` — the `:has()` search.
    fn some_descendant(&self, root: Handle, pred: &mut dyn FnMut(Handle) -> bool) -> bool;

    /// Whether a direct element child in this scope satisfies the predicate.
    fn some_element_child(&self, root: Handle, pred: &mut dyn FnMut(Handle) -> bool) -> bool {
        self.some_descendant(root, &mut |child| {
            self.parent(child) == Some(root) && pred(child)
        })
    }

    /// `root` itself (when an element) or one of its scope descendants satisfies `pred`.
    fn some_self_or_descendant(&self, root: Handle, pred: &mut dyn FnMut(Handle) -> bool) -> bool {
        (self.tree().node_type(root) == NodeType::Element && pred(root))
            || self.some_descendant(root, pred)
    }
    /// The slot `h` is assigned to, for `::slotted()` (`None`: not in a composed context).
    fn assigned_slot(&self, _h: Handle) -> Option<Handle> {
        None
    }
}

/// [`LiveNavigator`] with a scoping element: `:scope` is `scope` (the DOM APIs).
pub(crate) struct ScopedNavigator<'t> {
    live: LiveNavigator<'t>,
    scope: Handle,
    shadow_scope: Option<Handle>,
}

impl<'t> ScopedNavigator<'t> {
    pub(crate) fn new(
        live: LiveNavigator<'t>,
        scope: Handle,
        shadow_scope: Option<Handle>,
    ) -> Self {
        Self {
            live,
            scope,
            shadow_scope,
        }
    }
}

impl Navigator for ScopedNavigator<'_> {
    fn tree(&self) -> &Tree {
        self.live.tree()
    }
    fn parent(&self, h: Handle) -> Option<Handle> {
        self.live.parent(h)
    }
    fn previous_element_sibling(&self, h: Handle) -> Option<Handle> {
        self.live.previous_element_sibling(h)
    }
    fn next_element_sibling(&self, h: Handle) -> Option<Handle> {
        self.live.next_element_sibling(h)
    }
    fn element_siblings(&self, h: Handle) -> Vec<Handle> {
        self.live.element_siblings(h)
    }
    fn same_type(&self, a: Handle, b: Handle) -> bool {
        self.live.same_type(a, b)
    }
    fn type_name(&self, h: Handle) -> Option<&str> {
        self.live.type_name(h)
    }
    fn is_root(&self, h: Handle) -> bool {
        self.live.is_root(h)
    }
    fn is_scope(&self, h: Handle) -> bool {
        h == self.scope
    }
    fn shadow_scope(&self) -> Option<Handle> {
        self.shadow_scope
    }
    fn assigned_slot(&self, node: Handle) -> Option<Handle> {
        let scope = self.shadow_scope?;
        let host = self.tree().shadow_host(scope)?;
        (self.tree().parent(node) == Some(host))
            .then(|| self.tree().assigned_slot_in_shadow(node, scope))
            .flatten()
    }
    fn is_empty(&self, h: Handle) -> bool {
        self.live.is_empty(h)
    }
    fn some_descendant(&self, root: Handle, pred: &mut dyn FnMut(Handle) -> bool) -> bool {
        self.live.some_descendant(root, pred)
    }
    fn some_element_child(&self, root: Handle, pred: &mut dyn FnMut(Handle) -> bool) -> bool {
        self.live.some_element_child(root, pred)
    }
    fn some_self_or_descendant(&self, root: Handle, pred: &mut dyn FnMut(Handle) -> bool) -> bool {
        self.live.some_self_or_descendant(root, pred)
    }
}

/// The live-[`Tree`] [`Navigator`]: raw-node semantics, exactly what `matches` /
/// `querySelector*` have always used.
#[derive(Clone, Copy)]
pub struct LiveNavigator<'t>(pub &'t Tree);

impl Navigator for LiveNavigator<'_> {
    fn tree(&self) -> &Tree {
        self.0
    }
    // a template content fragment has no parent in the DOM (its nodes never match
    // `template p`)
    fn parent(&self, h: Handle) -> Option<Handle> {
        if self.0.node_type(h) == NodeType::Fragment {
            return None;
        }
        self.0.parent(h)
    }
    fn previous_element_sibling(&self, h: Handle) -> Option<Handle> {
        self.0.previous_element_sibling(h)
    }
    fn next_element_sibling(&self, h: Handle) -> Option<Handle> {
        self.0.next_element_sibling(h)
    }
    fn element_siblings(&self, h: Handle) -> Vec<Handle> {
        self.0.element_siblings(h)
    }
    fn child_position(&self, h: Handle) -> (usize, usize) {
        let Some(p) = self.0.parent(h) else {
            return (1, 1);
        };
        let mut index = 0;
        let mut count = 0;
        self.0.for_each_child(p, |c| {
            if self.0.node_type(c) == NodeType::Element {
                count += 1;
                if c == h {
                    index = count;
                }
            }
        });
        (index, count)
    }
    fn child_index(&self, h: Handle) -> usize {
        self.child_position(h).0
    }
    fn child_last_index(&self, h: Handle) -> usize {
        let (index, count) = self.child_position(h);
        count.saturating_sub(index) + 1
    }
    fn type_position(&self, h: Handle) -> (usize, usize) {
        let Some(p) = self.0.parent(h) else {
            return (1, 1);
        };
        let mut index = 0;
        let mut count = 0;
        self.0.for_each_child(p, |c| {
            if self.0.node_type(c) == NodeType::Element && self.0.same_element_type(c, h) {
                count += 1;
                if c == h {
                    index = count;
                }
            }
        });
        (index, count)
    }
    fn type_index(&self, h: Handle) -> usize {
        self.type_position(h).0
    }
    fn type_last_index(&self, h: Handle) -> usize {
        let (index, count) = self.type_position(h);
        count.saturating_sub(index) + 1
    }
    fn is_first_of_type(&self, h: Handle) -> bool {
        self.type_position(h).0 == 1
    }
    fn is_last_of_type(&self, h: Handle) -> bool {
        let (index, count) = self.type_position(h);
        index == count
    }
    fn same_type(&self, a: Handle, b: Handle) -> bool {
        self.0.same_element_type(a, b)
    }
    fn type_name(&self, h: Handle) -> Option<&str> {
        self.0.local_name_scalar(h)
    }
    // `:root` is the document element only: never the top of a fragment, a shadow tree,
    // template content or a detached subtree (Chrome; P5b, miaskiewicz/turbo-dom#18)
    fn is_root(&self, h: Handle) -> bool {
        self.0
            .parent(h)
            .is_some_and(|p| self.0.node_type(p) == NodeType::Document)
    }
    // :empty — no element child and no non-empty text child (Chrome). Comments,
    // processing instructions, empty text nodes and a <template>'s content
    // fragment don't count; whitespace-only text does.
    fn is_empty(&self, h: Handle) -> bool {
        let tree = self.0;
        let mut empty = true;
        tree.for_each_child(h, |c| {
            empty &= match tree.node_type(c) {
                NodeType::Element => false,
                NodeType::Text | NodeType::CDataSection => {
                    tree.node_value(c).is_none_or(|t| t.is_empty())
                }
                _ => true,
            };
        });
        empty
    }
    fn some_descendant(&self, root: Handle, pred: &mut dyn FnMut(Handle) -> bool) -> bool {
        self.0.some_descendant(root, pred)
    }
    fn some_element_child(&self, root: Handle, pred: &mut dyn FnMut(Handle) -> bool) -> bool {
        self.0.some_element_child(root, pred)
    }
    fn some_self_or_descendant(&self, root: Handle, pred: &mut dyn FnMut(Handle) -> bool) -> bool {
        self.0.some_self_or_descendant(root, pred)
    }
}

impl Tree {
    /// Visit `h`'s children as selectors see them: a `<template>`'s content fragment (a
    /// fragment child in this tree) is a separate document fragment in the DOM — never a
    /// child, so `querySelectorAll`, `getElementById`, `getElementsByTagName` and `:has()`
    /// do not descend into it (Chrome; P5b, miaskiewicz/turbo-dom#18).
    pub(crate) fn for_each_light_child(&self, h: Handle, mut f: impl FnMut(Handle)) {
        self.for_each_child(h, |c| {
            if self.node_type(c) != NodeType::Fragment {
                f(c);
            }
        });
    }

    /// The immediately-preceding ELEMENT sibling of `h` (walking `previous_sibling`
    /// and skipping text/comment nodes). Mirrors selectors.mjs `previousElement`.
    /// The single source of the element-skipping sibling walk (`node_ref.rs` wraps it).
    pub(crate) fn previous_element_sibling(&self, h: Handle) -> Option<Handle> {
        let mut n = self.previous_sibling(h);
        while let Some(s) = n {
            if self.node_type(s) == NodeType::Element {
                return Some(s);
            }
            n = self.previous_sibling(s);
        }
        None
    }

    /// The immediately-FOLLOWING element sibling of `h` (walking `next_sibling`,
    /// skipping text/comment nodes). Mirrors selectors.mjs `nextElement`.
    /// The single source of the element-skipping sibling walk (`node_ref.rs` wraps it).
    pub(crate) fn next_element_sibling(&self, h: Handle) -> Option<Handle> {
        let mut n = self.next_sibling(h);
        while let Some(s) = n {
            if self.node_type(s) == NodeType::Element {
                return Some(s);
            }
            n = self.next_sibling(s);
        }
        None
    }

    /// Element-only siblings of `h` (children of its parent that are elements).
    /// Returns `[h]` if `h` has no parent — as selectors.mjs `position` (a parentless element
    /// is its own only sibling).
    fn element_siblings(&self, h: Handle) -> Vec<Handle> {
        match self.parent(h) {
            Some(p) => {
                let mut out = Vec::new();
                self.for_each_child(p, |c| {
                    if self.node_type(c) == NodeType::Element {
                        out.push(c);
                    }
                });
                out
            }
            None => vec![h],
        }
    }

    /// A boolean form-state property: the live IDL override if a consumer set one, else
    /// the presence of the HTML attribute. Mirrors the JS `__x !== undefined ? __x :
    /// hasAttribute(x)` pattern shared by the form-state pseudo-classes.
    fn form_state(&self, h: Handle, prop: FormProp, attr: &str) -> bool {
        self.form_property(h, prop)
            .unwrap_or_else(|| self.has_attribute(h, attr))
    }

    pub(crate) fn is_html(&self, h: Handle) -> bool {
        self.namespace_uri(h) == Some(HTML_NS)
    }

    fn is_html_named(&self, h: Handle, names: &[&str]) -> bool {
        self.is_html(h) && self.local_name(h).is_some_and(|name| names.contains(&name))
    }

    /// `:link` / `:any-link`: an HTML `a`/`area` or an SVG `a` with an `href` (SVG also
    /// honours `xlink:href`), as in Chrome. Every link is unvisited.
    fn is_link(&self, h: Handle) -> bool {
        if self.is_html_named(h, &["a", "area"]) {
            return self.has_attribute(h, "href");
        }
        self.namespace_uri(h) == Some("http://www.w3.org/2000/svg")
            && self.local_name(h) == Some("a")
            && (self.get_attribute_ns_borrowed(h, None, "href").is_some()
                || self
                    .get_attribute_ns_borrowed(h, Some("http://www.w3.org/1999/xlink"), "href")
                    .is_some())
    }

    /// Whether an element is the HTML form default for `:default`.
    ///
    /// Checked checkboxes/radios and selected options derive this from their
    /// default-content attributes. For submit controls, the first submit/image
    /// input or submit button associated with a form is its default submitter.
    fn is_default(&self, h: Handle) -> bool {
        if !self.is_html(h) {
            return false;
        }
        match self.local_name(h) {
            Some("option") => return self.has_attribute(h, "selected"),
            Some("input") => {
                let kind = self.get_attribute(h, "type").unwrap_or("text");
                if matches!(kind.to_ascii_lowercase().as_str(), "checkbox" | "radio") {
                    return self.has_attribute(h, "checked");
                }
                if !matches!(kind.to_ascii_lowercase().as_str(), "submit" | "image") {
                    return false;
                }
            }
            Some("button") => {
                let kind = self.get_attribute(h, "type").unwrap_or("submit");
                if kind.eq_ignore_ascii_case("button") || kind.eq_ignore_ascii_case("reset") {
                    return false;
                }
            }
            _ => return false,
        }

        let Some(form) = self.form_owner(h) else {
            return false;
        };
        let mut default = None;
        self.some_descendant(self.root(), |candidate| {
            if self.form_owner(candidate) != Some(form) {
                return false;
            }
            let name = self.local_name(candidate);
            let kind = self.get_attribute(candidate, "type").unwrap_or_default();
            let submitter = match name {
                Some("input") => {
                    kind.eq_ignore_ascii_case("submit") || kind.eq_ignore_ascii_case("image")
                }
                Some("button") => {
                    !kind.eq_ignore_ascii_case("button") && !kind.eq_ignore_ascii_case("reset")
                }
                _ => false,
            };
            if submitter {
                default = Some(candidate);
                true
            } else {
                false
            }
        });
        default == Some(h)
    }

    fn form_owner(&self, control: Handle) -> Option<Handle> {
        if let Some(id) = self.get_attribute(control, "form") {
            return self
                .get_element_by_id(id)
                .filter(|&form| self.is_html_named(form, &["form"]));
        }
        let mut ancestor = self.parent(control);
        while let Some(node) = ancestor {
            if self.is_html_named(node, &["form"]) {
                return Some(node);
            }
            ancestor = self.parent(node);
        }
        None
    }

    /// HTML "actually disabled" for a form control: its own disabled state (live property
    /// or attribute), or a disabled `<fieldset>` ancestor unless the control sits inside
    /// that fieldset's first `<legend>` child.
    fn is_actually_disabled(&self, h: Handle) -> bool {
        if self.form_state(h, FormProp::Disabled, "disabled") {
            return true;
        }
        let mut child = h;
        let mut ancestor = self.parent(h);
        while let Some(a) = ancestor {
            if self.is_html_named(a, &["fieldset"])
                && self.form_state(a, FormProp::Disabled, "disabled")
            {
                let mut first_legend = None;
                self.for_each_child(a, |c| {
                    if first_legend.is_none() && self.is_html_named(c, &["legend"]) {
                        first_legend = Some(c);
                    }
                });
                if first_legend != Some(child) {
                    return true;
                }
            }
            child = a;
            ancestor = self.parent(a);
        }
        false
    }

    /// `:disabled` / `:enabled` (HTML "actually disabled", as Chrome 156 evaluates it):
    /// `None` for an element the pair does not apply to (anything but an HTML `button`,
    /// `input`, `select`, `textarea`, `fieldset`, `optgroup` or `option`), else whether it
    /// is disabled. A form control or fieldset is disabled by its own state or a disabled
    /// `<fieldset>` ancestor outside that fieldset's first `<legend>`; an `optgroup` by its
    /// own attribute; an `option` by its own state, a disabled parent `optgroup`, or a
    /// disabled owner `select`.
    fn disabled_state(&self, h: Handle) -> Option<bool> {
        if !self.is_html(h) {
            return None;
        }
        match self.local_name(h)? {
            "button" | "input" | "select" | "textarea" | "fieldset" => {
                Some(self.is_actually_disabled(h))
            }
            "optgroup" => Some(self.form_state(h, FormProp::Disabled, "disabled")),
            "option" => {
                if self.form_state(h, FormProp::Disabled, "disabled") {
                    return Some(true);
                }
                let mut parent = self.parent(h);
                if let Some(group) = parent.filter(|&p| self.is_html_named(p, &["optgroup"])) {
                    if self.form_state(group, FormProp::Disabled, "disabled") {
                        return Some(true);
                    }
                    parent = self.parent(group);
                }
                Some(
                    parent
                        .filter(|&p| self.is_html_named(p, &["select"]))
                        .is_some_and(|select| self.is_actually_disabled(select)),
                )
            }
            _ => None,
        }
    }

    /// Whether the HTML `required` attribute applies to this form control.
    fn is_required(&self, h: Handle) -> bool {
        if !self.is_html(h) {
            return false;
        }
        match self.local_name(h) {
            Some("select" | "textarea") => self.form_state(h, FormProp::Required, "required"),
            Some("input") => {
                let kind = self.get_attribute(h, "type").unwrap_or("text");
                ![
                    "hidden", "range", "color", "button", "submit", "reset", "image",
                ]
                .iter()
                .any(|excluded| kind.eq_ignore_ascii_case(excluded))
                    && self.form_state(h, FormProp::Required, "required")
            }
            _ => false,
        }
    }

    /// Is `h` an editing host or editable content? The nearest HTML ancestor-or-self with
    /// a valid `contenteditable` state decides (`""`/`true`/`plaintext-only` = editable,
    /// `false` = not); invalid values inherit.
    fn is_editable(&self, h: Handle) -> bool {
        let mut node = Some(h);
        while let Some(n) = node {
            if self.node_type(n) == NodeType::Element && self.is_html(n) {
                if let Some(value) = self.get_attribute(n, "contenteditable") {
                    if value.is_empty()
                        || value.eq_ignore_ascii_case("true")
                        || value.eq_ignore_ascii_case("plaintext-only")
                    {
                        return true;
                    }
                    if value.eq_ignore_ascii_case("false") {
                        return false;
                    }
                }
            }
            node = self.parent(n);
        }
        false
    }

    /// The HTML `:read-write` rule (for an HTML element): a mutable `input` whose type
    /// accepts `readonly`, a mutable `textarea`, or any other element that is editable.
    /// Mutable = not readonly (live property or attribute) and not actually disabled.
    fn read_write(&self, h: Handle) -> bool {
        match (self.is_html(h), self.local_name(h)) {
            (true, Some("input")) => {
                let readonly_applies = self.get_attribute(h, "type").is_none_or(|kind| {
                    READONLY_INPUT_TYPES
                        .iter()
                        .any(|t| kind.eq_ignore_ascii_case(t))
                        || !KNOWN_INPUT_TYPES
                            .iter()
                            .any(|t| kind.eq_ignore_ascii_case(t))
                });
                readonly_applies
                    && !self.form_state(h, FormProp::ReadOnly, "readonly")
                    && !self.is_actually_disabled(h)
            }
            (true, Some("textarea")) => {
                !self.form_state(h, FormProp::ReadOnly, "readonly") && !self.is_actually_disabled(h)
            }
            _ => self.is_editable(h),
        }
    }
}

fn compound_classes_match(tree: &Tree, h: Handle, c: &Compound) -> bool {
    if c.classes.is_empty() {
        return true;
    }
    let Some(cv) = tree.get_attribute_ns_borrowed(h, None, "class") else {
        return false;
    };
    c.classes
        .iter()
        .all(|cls| class_matches_value(tree, h, cv, cls))
}

fn compound_class_attr_match(tree: &Tree, h: Handle, compound: &Compound) -> bool {
    compound_classes_match(tree, h, compound)
        && compound
            .attrs
            .iter()
            .all(|attr| compound_attr_matches(tree, h, attr))
}

fn class_matches_value(tree: &Tree, h: Handle, value: &str, class: &str) -> bool {
    let quirks =
        tree.compat_mode() == "BackCompat" && tree.host_document != Some(HostDocumentKind::Xml);
    if quirks {
        if tree.attribute_is_scalar(h, "class") {
            return value
                .split([' ', '\t', '\n', '\r', '\x0c'])
                .any(|token| token.eq_ignore_ascii_case(class));
        }
        let wanted: Vec<u16> = class.encode_utf16().collect();
        return tree
            .get_attribute_ns_utf16(h, None, "class")
            .is_some_and(|value| has_class_units_quirks(&value, &wanted));
    }
    has_class(value, class)
        && (tree.attribute_is_scalar(h, "class")
            || tree
                .get_attribute_ns_utf16(h, None, "class")
                .is_some_and(|units| {
                    units::has_class_units(&units, &class.encode_utf16().collect::<Vec<_>>())
                }))
}

fn has_class_units_quirks(value: &[u16], wanted: &[u16]) -> bool {
    if wanted.is_empty() {
        return false;
    }
    let whitespace = |unit: u16| matches!(unit, 9 | 10 | 12 | 13 | 32);
    value.split(|unit| whitespace(*unit)).any(|token| {
        token.len() == wanted.len()
            && token.iter().zip(wanted).all(|(left, right)| {
                let fold = |unit: u16| {
                    if (u16::from(b'A')..=u16::from(b'Z')).contains(&unit) {
                        unit + u16::from(b'a' - b'A')
                    } else {
                        unit
                    }
                };
                fold(*left) == fold(*right)
            })
    })
}

fn compound_attr_matches(tree: &Tree, h: Handle, a: &Attr) -> bool {
    let html = tree.host_document != Some(HostDocumentKind::Xml)
        && tree.namespace_uri(h) == Some("http://www.w3.org/1999/xhtml");
    let name = if html {
        a.html_name.as_deref().unwrap_or(&a.name)
    } else {
        &a.name
    };
    if let (Some(document), AttrMatch::Units(m)) = (tree.host_document, &a.m) {
        let xml = document == HostDocumentKind::Xml;
        let host_html = document == HostDocumentKind::Html && html;
        match a.namespace {
            AttributeNamespace::Any => {
                let wanted = if xml {
                    a.name.clone()
                } else {
                    a.name.to_lowercase()
                };
                return tree.attributes_units(h).iter().any(|attribute| {
                    let local = String::from_utf16_lossy(&attribute.local_name);
                    let matches_name = if xml {
                        local == wanted
                    } else {
                        local.to_lowercase() == wanted
                    };
                    matches_name
                        && m.matches_case(
                            &attribute.value,
                            !xml && html && units::v3_default_insensitive(&wanted),
                        )
                });
            }
            AttributeNamespace::Default if !xml => {
                return tree.get_attribute_utf16(h, name).map_or_else(
                    || {
                        host_html
                            && m.matches_missing_html(html && units::v3_default_insensitive(name))
                    },
                    |value| m.matches_case(&value, html && units::v3_default_insensitive(name)),
                );
            }
            _ => {}
        }
    }
    if a.namespace == AttributeNamespace::Any {
        let AttrMatch::Units(m) = &a.m else {
            unreachable!("namespaced attribute selectors are unit records")
        };
        if m.has_bound_operator() {
            let name: Vec<_> = name.encode_utf16().collect();
            return tree
                .attributes_units(h)
                .into_iter()
                .any(|attr| attr.local_name == name && m.matches(&attr.value));
        }
        return tree.local_attributes(h).any(|(local, value)| {
            local == name && m.matches(&value.encode_utf16().collect::<Vec<_>>())
        });
    }
    match &a.m {
        AttrMatch::Units(m) => tree
            .get_attribute_ns_utf16(h, None, name)
            .is_some_and(|got| {
                m.matches_case(
                    &got,
                    tree.host_document.is_some() && html && units::v3_default_insensitive(name),
                )
            }),
        _ => match tree.get_attribute_ns_borrowed(h, None, name) {
            Some(got) => {
                a.m.matches(got)
                    && (tree.attribute_is_scalar(h, name)
                        || tree
                            .get_attribute_ns_utf16(h, None, name)
                            .is_some_and(|got| UnitAttrMatch::scalar(&a.m).matches(&got)))
            }
            _ => false,
        },
    }
}

fn matches_compound<N: Navigator + ?Sized>(nav: &N, h: Handle, c: &Compound) -> bool {
    matches_compound_fields::<true, false, N>(nav, h, c)
}

fn matches_compound_fields<
    const CHECK_SUBJECT: bool,
    const IS_HOST: bool,
    N: Navigator + ?Sized,
>(
    nav: &N,
    h: Handle,
    c: &Compound,
) -> bool {
    let tree = nav.tree();
    if CHECK_SUBJECT && tree.node_type(h) != NodeType::Element {
        return false;
    }
    match c.namespace {
        TypeNamespace::Default | TypeNamespace::Any => {}
        TypeNamespace::Null if tree.namespace_uri(h).is_none() => {}
        TypeNamespace::Null | TypeNamespace::Invalid => return false,
    }
    if let Some(tag) = &c.tag {
        if !nav.type_name(h).is_some_and(|name| {
            if tree.host_document == Some(HostDocumentKind::Xml) {
                name == tag
            } else {
                name.eq_ignore_ascii_case(tag)
            }
        }) {
            return false;
        }
    }
    if c.id.as_ref().is_some_and(|id| {
        tree.get_attribute_ns_borrowed(h, None, "id") != Some(id.as_str())
            || !tree.attribute_is_scalar(h, "id")
    }) {
        return false;
    }
    if CHECK_SUBJECT && !compound_classes_match(tree, h, c) {
        return false;
    }
    if c.attrs.iter().any(|a| !compound_attr_matches(tree, h, a)) {
        return false;
    }
    c.pseudos.iter().all(|pseudo| {
        if IS_HOST {
            matches_host_pseudo(nav, h, pseudo)
        } else {
            matches_pseudo(nav, h, pseudo)
        }
    })
}

fn matches_host_pseudo<N: Navigator + ?Sized>(nav: &N, host: Handle, pseudo: &Pseudo) -> bool {
    let Pseudo::Host {
        selectors,
        contextual,
    } = pseudo
    else {
        return matches_pseudo(nav, host, pseudo);
    };
    if nav.tree().shadow_root(host).is_none()
        || nav
            .shadow_scope()
            .is_some_and(|scope| nav.tree().shadow_host(scope) != Some(host))
    {
        return false;
    }
    let Some(selectors) = selectors else {
        return true;
    };
    let mut candidate = Some(host);
    while let Some(element) = candidate {
        if selectors
            .iter()
            .any(|selector| matches_complex(nav, element, selector))
        {
            return true;
        }
        if !contextual {
            break;
        }
        candidate = if element == host {
            nav.tree().parent(host)
        } else {
            nav.tree()
                .parent(element)
                .or_else(|| nav.tree().shadow_host(element))
        };
        while candidate.is_some_and(|ancestor| nav.tree().node_type(ancestor) != NodeType::Element)
        {
            candidate = candidate.and_then(|ancestor| {
                nav.tree()
                    .parent(ancestor)
                    .or_else(|| nav.tree().shadow_host(ancestor))
            });
        }
    }
    false
}

fn matches_pseudo<N: Navigator + ?Sized>(nav: &N, h: Handle, p: &Pseudo) -> bool {
    let tree = nav.tree();
    match p {
        Pseudo::Unknown(unknown)
            if matches!(
                unknown.name.to_ascii_lowercase().as_str(),
                "current" | "active-view-transition-type"
            ) =>
        {
            let selector = format!(
                ":{}({})",
                unknown.name.to_ascii_lowercase(),
                unknown.arg.as_deref().unwrap_or("")
            );
            tree.host_functional_state(h, &selector)
        }
        Pseudo::State(value) => tree.has_custom_state_utf16(h, value),
        Pseudo::Heading(levels) => {
            matches!(
                tree.local_name_scalar(h).map(str::as_bytes),
                Some([b'h', digit @ b'1'..=b'6']) if levels & (1 << (*digit - b'1')) != 0
            ) && tree.is_html(h)
        }
        Pseudo::FirstChild => nav.previous_element_sibling(h).is_none(),
        Pseudo::LastChild => nav.next_element_sibling(h).is_none(),
        Pseudo::OnlyChild => {
            nav.previous_element_sibling(h).is_none() && nav.next_element_sibling(h).is_none()
        }
        Pseudo::FirstOfType => nav.is_first_of_type(h),
        Pseudo::LastOfType => nav.is_last_of_type(h),
        Pseudo::OnlyOfType => nav.is_first_of_type(h) && nav.is_last_of_type(h),
        Pseudo::NthChild(a, b) => nth_match(*a, *b, nav.child_index(h) as i64),
        Pseudo::NthLastChild(a, b) => nth_match(*a, *b, nav.child_last_index(h) as i64),
        Pseudo::NthChildOf(a, b, of) | Pseudo::NthLastChildOf(a, b, of) => {
            let matches_of = |c: Handle| of.iter().any(|cx| matches_complex(nav, c, cx));
            if !matches_of(h) {
                return false;
            }
            let sibs: Vec<Handle> = nav
                .element_siblings(h)
                .into_iter()
                .filter(|&c| c == h || matches_of(c))
                .collect();
            let last = matches!(p, Pseudo::NthLastChildOf(..));
            sibs.iter().position(|&c| c == h).is_some_and(|idx| {
                let index = if last {
                    sibs.len() as i64 - idx as i64
                } else {
                    idx as i64 + 1
                };
                nth_match(*a, *b, index)
            })
        }
        Pseudo::NthOfType(a, b) => nth_match(*a, *b, nav.type_index(h) as i64),
        Pseudo::NthLastOfType(a, b) => nth_match(*a, *b, nav.type_last_index(h) as i64),
        Pseudo::Empty => nav.is_empty(h),
        Pseudo::Root => nav.is_root(h),
        Pseudo::Scope => nav.is_scope(h),
        // Form-state. Mirrors selectors.mjs: read the live IDL property first (what a
        // consumer / React sets via set_form_property, the analogue of `el.checked`),
        // falling back to the HTML attribute when no live override is set.
        Pseudo::Checked => {
            if tree.local_name(h) == Some("option") {
                tree.form_state(h, FormProp::Selected, "selected")
            } else {
                tree.local_name(h) == Some("input")
                    && tree.get_attribute(h, "type").is_some_and(|kind| {
                        kind.eq_ignore_ascii_case("checkbox") || kind.eq_ignore_ascii_case("radio")
                    })
                    && tree.form_state(h, FormProp::Checked, "checked")
            }
        }
        Pseudo::Disabled => tree.disabled_state(h) == Some(true),
        Pseudo::Enabled => tree.disabled_state(h) == Some(false),
        Pseudo::Required => tree.is_required(h),
        Pseudo::Optional => {
            tree.is_html(h)
                && matches!(
                    tree.local_name(h),
                    Some("button" | "input" | "select" | "textarea")
                )
                && !tree.is_required(h)
        }
        // Read-only is the complement of the editable state for every element,
        // including foreign-namespace elements such as SVG. Read-write itself
        // is limited to editable HTML controls and contenteditable subtrees.
        Pseudo::ReadOnly => !tree.read_write(h),
        Pseudo::ReadWrite => tree.read_write(h),
        Pseudo::Selected => tree.form_state(h, FormProp::Selected, "selected"),
        Pseudo::Link => tree.is_link(h),
        Pseudo::Host { .. } => nav
            .shadow_scope()
            .and_then(|scope| tree.shadow_host(scope))
            .is_some_and(|host| matches_host_pseudo(nav, host, p)),
        Pseudo::Unknown(_) | Pseudo::JqueryPosition(_) => false,
        // selector-list pseudos: each Complex is anchored at `h` (matches_complex
        // tests the rightmost compound against `h` and walks left).
        Pseudo::Is(list)
        | Pseudo::Matches(list)
        | Pseudo::Where(list)
        | Pseudo::WebkitAny(list) => list.iter().any(|cx| matches_complex(nav, h, cx)),
        Pseudo::Not(list) => !list.iter().any(|cx| matches_complex(nav, h, cx)),
        // relational: SOME relative selector finds a matching element reachable
        // from `h` per its leading combinator, scoped to `h`'s subtree.
        Pseudo::Has(list) => list.iter().any(|rel| has_match(nav, h, rel)),
        Pseudo::Defined => cascade::is_defined(tree, h),
        Pseudo::Open(open) => {
            matches!(tree.local_name_scalar(h), Some("details" | "dialog"))
                && tree.is_html(h)
                && tree.has_attribute(h, "open") == *open
                || if *open {
                    tree.selector_state(h, SelectorState::Open)
                } else {
                    tree.selector_state(h, SelectorState::Closed)
                }
        }
        Pseudo::HostState(SelectorState::Modal) => {
            tree.selector_state(h, SelectorState::Modal) || tree.is_fullscreen(h)
        }
        Pseudo::HostState(SelectorState::PopoverOpen) => {
            tree.has_attribute(h, "popover") && tree.selector_state(h, SelectorState::PopoverOpen)
        }
        Pseudo::HostState(SelectorState::Visited) => {
            tree.is_link(h) && tree.selector_state(h, SelectorState::Visited)
        }
        Pseudo::HostState(SelectorState::Default) => {
            tree.is_default(h) || tree.selector_state(h, SelectorState::Default)
        }
        Pseudo::HostState(state) => tree.selector_state(h, *state),
        Pseudo::HasSlotted(selector, source) => {
            let host_match = if let Some(source) = source {
                tree.host_slotted_selector(h, source)
            } else {
                tree.selector_state(h, SelectorState::HostHasSlotted)
            };
            host_match || slot::matches(tree, h, selector.as_deref())
        }
        Pseudo::Fullscreen => {
            tree.is_fullscreen(h) || tree.selector_state(h, SelectorState::Fullscreen)
        }
        Pseudo::Lang(ranges) => language::matches(tree, h, ranges),
        Pseudo::Dir(rtl) => rtl.is_some_and(|rtl| {
            let host_rtl = tree.selector_state(h, SelectorState::HostDirectionRtl);
            let host_ltr = tree.selector_state(h, SelectorState::HostDirectionLtr);
            if host_rtl || host_ltr {
                host_rtl == rtl
            } else {
                cascade::is_rtl(tree, h) == rtl
            }
        }),
        Pseudo::Jquery(test) => test.matches(tree, h),
        Pseudo::Extension(predicate, arg) => predicate.matches(tree, h, arg.as_deref()),
    }
}

/// The compound at position `k` in the chain: `k==0` is the head (`first`),
/// `k>0` is `rest[k-1].1`. (`rest` entry `i` pairs the combinator on its left
/// with the compound at chain position `i+1`.)
fn compound_at(cx: &Complex, k: usize) -> &Compound {
    if k == 0 {
        &cx.first
    } else {
        &cx.rest[k - 1].1
    }
}

/// Does `h` match the full complex selector, anchored at its rightmost compound?
/// Recursive with backtracking: a descendant combinator tries EVERY matching
/// ancestor, not just the nearest, so a mixed chain such as `.a > .b .c` — where
/// the `.b` that is a direct child of `.a` is *farther* from `.c` than another
/// `.b` — is matched correctly. A greedy nearest-ancestor walk would miss it.
fn matches_complex<N: Navigator + ?Sized>(nav: &N, h: Handle, cx: &Complex) -> bool {
    matches_chain(nav, h, cx, cx.rest.len(), None)
}

/// Match the chain prefix ending at position `k` against element `h`. The
/// combinator in `rest[k-1]` connects position `k` to position `k-1`
/// (see `parse_complex`); position 0 (the head) has no combinator.
///
/// `scope` supports `:has()`: when `Some((comb, el))`, the LEFTMOST compound must,
/// in addition to matching, relate to the scope element `el` by `comb` — so a
/// relative selector's head is anchored to the `:has()` subject. `None` (plain
/// matching) means the leftmost compound stands alone.
fn matches_ancestor_chain<N: Navigator + ?Sized>(
    nav: &N,
    h: Handle,
    cx: &Complex,
    k: usize,
    scope: Option<&(Combinator, Handle)>,
) -> bool {
    let mut anc = nav.parent(h);
    while let Some(a) = anc {
        if matches_chain(nav, a, cx, k, scope) {
            return true;
        }
        if nav.tree().node_type(a) == NodeType::Fragment
            && nav
                .tree()
                .shadow_host(a)
                .is_some_and(|host| matches_shadow_host_chain(nav, host, cx, k, scope))
        {
            return true;
        }
        anc = nav.parent(a);
    }
    false
}

fn matches_sibling_chain<N: Navigator + ?Sized>(
    nav: &N,
    h: Handle,
    cx: &Complex,
    k: usize,
    scope: Option<&(Combinator, Handle)>,
) -> bool {
    let mut prev = nav.previous_element_sibling(h);
    while let Some(p) = prev {
        if matches_chain(nav, p, cx, k, scope) {
            return true;
        }
        prev = nav.previous_element_sibling(p);
    }
    false
}

fn matches_chain<N: Navigator + ?Sized>(
    nav: &N,
    h: Handle,
    cx: &Complex,
    k: usize,
    scope: Option<&(Combinator, Handle)>,
) -> bool {
    if !matches_compound(nav, h, compound_at(cx, k)) {
        return false;
    }
    continue_chain(nav, h, cx, k, scope)
}

fn nearest_table<N: Navigator + ?Sized>(nav: &N, mut node: Handle) -> Option<Handle> {
    loop {
        if nav
            .tree()
            .local_name(node)
            .is_some_and(|name| name.eq_ignore_ascii_case("table"))
        {
            return Some(node);
        }
        node = nav.parent(node)?;
    }
}

fn span_value(tree: &Tree, node: Handle, attribute: &str) -> usize {
    tree.get_attribute(node, attribute)
        .and_then(|value| value.trim().parse::<usize>().ok())
        .filter(|&span| span > 0)
        .unwrap_or(1)
        .min(1000)
}

fn table_rows(tree: &Tree, table: Handle) -> Vec<Handle> {
    fn visit(tree: &Tree, node: Handle, rows: &mut Vec<Handle>) {
        for child in tree.children(node) {
            let Some(name) = tree.local_name(child) else {
                continue;
            };
            if name.eq_ignore_ascii_case("table") {
                continue;
            }
            if name.eq_ignore_ascii_case("tr") {
                rows.push(child);
            } else {
                visit(tree, child, rows);
            }
        }
    }
    let mut rows = Vec::new();
    visit(tree, table, &mut rows);
    rows
}

fn cell_column_range(tree: &Tree, table: Handle, target: Handle) -> Option<(usize, usize)> {
    let mut occupied_until = Vec::<usize>::new();
    for (row_index, row) in table_rows(tree, table).into_iter().enumerate() {
        let mut cursor = 0usize;
        for cell in tree.children(row).into_iter().filter(|&child| {
            tree.local_name(child).is_some_and(|name| {
                name.eq_ignore_ascii_case("td") || name.eq_ignore_ascii_case("th")
            })
        }) {
            let span = span_value(tree, cell, "colspan");
            loop {
                if occupied_until.len() < cursor + span {
                    occupied_until.resize(cursor + span, 0);
                }
                if (cursor..cursor + span).all(|column| occupied_until[column] <= row_index) {
                    break;
                }
                cursor += 1;
            }
            let range = (cursor, cursor + span);
            let row_span = span_value(tree, cell, "rowspan");
            for occupied in &mut occupied_until[range.0..range.1] {
                *occupied = row_index.saturating_add(row_span);
            }
            if cell == target {
                return Some(range);
            }
            cursor = range.1;
        }
    }
    None
}

fn column_element_range(tree: &Tree, table: Handle, target: Handle) -> Option<(usize, usize)> {
    let mut offset = 0usize;
    for group in tree.children(table).into_iter().filter(|&child| {
        tree.local_name(child)
            .is_some_and(|name| name.eq_ignore_ascii_case("colgroup"))
    }) {
        let columns: Vec<_> = tree
            .children(group)
            .into_iter()
            .filter(|&child| {
                tree.local_name(child)
                    .is_some_and(|name| name.eq_ignore_ascii_case("col"))
            })
            .collect();
        let group_start = offset;
        if columns.is_empty() {
            offset = offset.saturating_add(span_value(tree, group, "span"));
        } else {
            for column in columns {
                let end = offset.saturating_add(span_value(tree, column, "span"));
                if column == target {
                    return Some((offset, end));
                }
                offset = end;
            }
        }
        if group == target {
            return Some((group_start, offset));
        }
    }
    None
}

fn same_table_column(tree: &Tree, left: Handle, right: Handle) -> bool {
    fn table_for(tree: &Tree, mut node: Handle) -> Option<Handle> {
        loop {
            if tree
                .local_name(node)
                .is_some_and(|name| name.eq_ignore_ascii_case("table"))
            {
                return Some(node);
            }
            node = tree.parent(node)?;
        }
    }
    let Some(table) = table_for(tree, left) else {
        return false;
    };
    if table_for(tree, right) != Some(table) {
        return false;
    }
    let range = |node| match tree
        .local_name(node)
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("td" | "th") => cell_column_range(tree, table, node),
        Some("col" | "colgroup") => column_element_range(tree, table, node),
        _ => None,
    };
    let (Some((left_start, left_end)), Some((right_start, right_end))) =
        (range(left), range(right))
    else {
        return false;
    };
    left_start < right_end && right_start < left_end
}

#[inline]
fn continue_chain<N: Navigator + ?Sized>(
    nav: &N,
    h: Handle,
    cx: &Complex,
    k: usize,
    scope: Option<&(Combinator, Handle)>,
) -> bool {
    if k == 0 {
        return match scope {
            None => true,
            Some((comb, el)) => relates_to_scope(nav, h, comb.clone(), *el),
        };
    }
    match cx.rest[k - 1].0.clone() {
        Combinator::Child => nav.parent(h).is_some_and(|parent| {
            matches_chain(nav, parent, cx, k - 1, scope)
                || (nav.tree().node_type(parent) == NodeType::Fragment
                    && nav
                        .tree()
                        .shadow_host(parent)
                        .is_some_and(|host| matches_shadow_host_chain(nav, host, cx, k - 1, scope)))
        }),
        Combinator::Descendant => matches_ancestor_chain(nav, h, cx, k - 1, scope),
        Combinator::Adjacent => nav
            .previous_element_sibling(h)
            .is_some_and(|prev| matches_chain(nav, prev, cx, k - 1, scope)),
        Combinator::GeneralSibling => matches_sibling_chain(nav, h, cx, k - 1, scope),
        Combinator::Column => {
            // v3 accepts this relationship in a host query but never matches it.
            if nav.tree().host_document.is_some() {
                return false;
            }
            let Some(table) = nearest_table(nav, h) else {
                return false;
            };
            let result = nav.some_self_or_descendant(table, &mut |candidate| {
                candidate != h
                    && same_table_column(nav.tree(), candidate, h)
                    && matches_chain(nav, candidate, cx, k - 1, scope)
            });
            result
        }
        Combinator::Custom(_, resolver) => resolver.as_ref().is_some_and(|resolve| {
            let tree = nav.tree();
            resolve.visit(tree, h, &mut |left| {
                tree.is_live(left) && matches_chain(nav, left, cx, k - 1, scope)
            })
        }),
    }
}

fn matches_shadow_host_chain<N: Navigator + ?Sized>(
    nav: &N,
    host: Handle,
    selector: &Complex,
    k: usize,
    scope: Option<&(Combinator, Handle)>,
) -> bool {
    let compound = compound_at(selector, k);
    let result = compound
        .pseudos
        .iter()
        .any(|pseudo| matches!(pseudo, Pseudo::Host { .. }))
        && matches_compound_fields::<true, true, _>(nav, host, compound)
        && continue_chain(nav, host, selector, k, scope);
    result
}

/// Does `node` stand in relation `comb` to the `:has()` scope element `el`? This
/// anchors the HEAD (leftmost) compound of a relative selector to the subject:
/// `> .a` ⇒ the `.a` head is a direct child, `.a .b` ⇒ the `.a` head is a
/// descendant, etc. The leading combinator constrains the head — NOT the whole
/// complex (anchoring the entire complex at a child/sibling candidate was the bug).
fn relates_to_scope<N: Navigator + ?Sized>(
    nav: &N,
    node: Handle,
    comb: Combinator,
    el: Handle,
) -> bool {
    match comb {
        Combinator::Child => nav.parent(node) == Some(el),
        Combinator::Custom(_, resolver) => resolver
            .as_ref()
            .is_some_and(|resolve| resolve.visit(nav.tree(), node, &mut |left| left == el)),
        Combinator::Adjacent => nav.previous_element_sibling(node) == Some(el),
        Combinator::GeneralSibling => {
            let mut prev = nav.previous_element_sibling(node);
            while let Some(s) = prev {
                if s == el {
                    return true;
                }
                prev = nav.previous_element_sibling(s);
            }
            false
        }
        Combinator::Column => {
            nav.tree().host_document.is_none() && same_table_column(nav.tree(), node, el)
        }
        // Descendant: `el` is a proper ancestor of `node`.
        Combinator::Descendant => {
            let mut anc = nav.parent(node);
            while let Some(a) = anc {
                if a == el {
                    return true;
                }
                anc = nav.parent(a);
            }
            false
        }
    }
}

/// `:has()` existence search. The relative complex must match some target element
/// (its rightmost compound) reachable from the subject `h`, with its HEAD compound
/// related to `h` by the leading combinator (enforced at `k == 0` via
/// `relates_to_scope`). Candidate targets: descendants of `h` for `>`/descendant
/// heads (the head, and thus the whole match, lives in `h`'s subtree); a
/// following-sibling subtree for `+`/`~` heads. Mirrors the JS `hasMatch`.
fn has_match<N: Navigator + ?Sized>(nav: &N, h: Handle, rel: &RelativeSelector) -> bool {
    let scope = (rel.combinator.clone(), h);
    let k = rel.complex.rest.len();
    if k == 0 && matches!(rel.combinator, Combinator::Child) {
        return nav.some_element_child(h, &mut |child| {
            matches_compound(nav, child, &rel.complex.first)
        });
    }
    let mut target = |x: Handle| matches_chain(nav, x, &rel.complex, k, Some(&scope));
    if matches!(rel.combinator, Combinator::Custom(..) | Combinator::Column)
        || rel
            .complex
            .rest
            .iter()
            .any(|(comb, _)| matches!(comb, Combinator::Custom(..) | Combinator::Column))
    {
        // An extension may cross the normal descendant or sibling search boundary.
        let tree = nav.tree();
        let mut root = h;
        while let Some(parent) = tree.parent(root) {
            root = parent;
        }
        return nav.some_self_or_descendant(root, &mut target);
    }
    match rel.combinator.clone() {
        Combinator::Custom(..) | Combinator::Column => {
            unreachable!("non-local relationships search the whole tree")
        }
        Combinator::Adjacent => match nav.next_element_sibling(h) {
            Some(sib) => nav.some_self_or_descendant(sib, &mut target),
            None => false,
        },
        Combinator::GeneralSibling => {
            let mut sib = nav.next_element_sibling(h);
            while let Some(s) = sib {
                if nav.some_self_or_descendant(s, &mut target) {
                    return true;
                }
                sib = nav.next_element_sibling(s);
            }
            false
        }
        // Child / Descendant leading combinator: the head (hence every match) is
        // within `h`'s subtree, so any descendant can be the target endpoint.
        Combinator::Child | Combinator::Descendant => nav.some_descendant(h, &mut target),
    }
}

// Only a single class anchor and a single class witness are eligible.
fn class_has_parts(
    selectors: &[Complex],
) -> Option<(&Compound, &Compound, nwsapi_has::Relationship, u8, bool)> {
    use nwsapi_has::Relationship;

    let [selector] = selectors else {
        return None;
    };
    let [Pseudo::Has(relative)] = selector.first.pseudos.as_slice() else {
        return None;
    };
    let [relative] = relative.as_slice() else {
        return None;
    };
    let anchor = &selector.first;
    let witness = &relative.complex.first;
    if !selector.rest.is_empty()
        || !relative.complex.rest.is_empty()
        || !witness.pseudos.is_empty()
        || [anchor, witness].into_iter().any(|compound| {
            compound.namespace != TypeNamespace::Default
                || compound.tag.is_some()
                || compound.id.is_some()
                || compound.classes.len() != 1
                || compound.attrs.len() > 1
                || compound.attrs.iter().any(|attr| {
                    attr.name != "data-ok"
                        || attr.namespace != AttributeNamespace::Default
                        || !match &attr.m {
                            AttrMatch::Equals(value) => value == "1",
                            AttrMatch::Units(value) => value.is_plain_equals_one(),
                            _ => false,
                        }
                })
        })
    {
        return None;
    }
    let relationship = match relative.combinator {
        Combinator::Child => Relationship::Child,
        Combinator::Descendant => Relationship::Descendant,
        _ => return None,
    };
    let attributes = u8::from(!anchor.attrs.is_empty()) << 1 | u8::from(!witness.attrs.is_empty());
    Some((anchor, witness, relationship, attributes, attributes == 0))
}

#[derive(Default)]
pub(crate) struct CandidateCache {
    version: u64,
    entries: rustc_hash::FxHashMap<String, CachedCandidates>,
}

struct CachedCandidates {
    candidates: std::rc::Rc<Candidates>,
    class_dependencies: rustc_hash::FxHashSet<String>,
}

impl CandidateCache {
    pub(crate) fn preserve(&mut self, before: u64, after: u64) {
        if self.version == before {
            self.version = after;
        }
    }

    pub(crate) fn preserve_class_change(&mut self, before: u64, after: u64, old: &str, new: &str) {
        if self.version != before {
            return;
        }
        self.entries.retain(|_, entry| {
            !entry
                .class_dependencies
                .iter()
                .any(|token| has_class(old, token) != has_class(new, token))
        });
        self.version = after;
    }
}

// Learned on native route costs. Missing rules keep the original inverse route.
const NATIVE_HAS_POLICY: nwsapi_has::has_policy::Policy = nwsapi_has::has_policy::Policy {
    child: None,
    descendant: None,
};

fn forward_class_has(tree: &Tree, selector: &Complex, anchors: &[Handle]) -> Vec<Handle> {
    let [Pseudo::Has(relatives)] = selector.first.pseudos.as_slice() else {
        unreachable!("bulk admission supplies one :has()");
    };
    let relative = &relatives[0];
    let witness = &relative.complex.first;
    anchors
        .iter()
        .copied()
        .filter(|&node| {
            if matches!(relative.combinator, Combinator::Descendant) {
                return tree.some_descendant(node, |h| compound_class_attr_match(tree, h, witness));
            }
            tree.some_element_child(node, |h| compound_class_attr_match(tree, h, witness))
        })
        .collect()
}

/// Override the route for selectors eligible for bulk `:has()` evaluation.
pub type BulkHasPlanner = fn(nwsapi_has::has_policy::Features) -> nwsapi_has::has_policy::Route;

#[derive(Clone)]
pub(crate) struct BulkHasPlannerCallback(
    std::rc::Rc<dyn Fn(nwsapi_has::has_policy::Features) -> nwsapi_has::has_policy::Route>,
);

impl BulkHasPlannerCallback {
    pub(crate) fn new(
        planner: impl Fn(nwsapi_has::has_policy::Features) -> nwsapi_has::has_policy::Route + 'static,
    ) -> Self {
        Self(std::rc::Rc::new(planner))
    }

    fn choose(&self, features: nwsapi_has::has_policy::Features) -> nwsapi_has::has_policy::Route {
        (self.0)(features)
    }
}

enum Candidates {
    Subjects(Vec<Handle>),
    BulkHas {
        anchors: Vec<Handle>,
        witnesses: Vec<Handle>,
        relationship: nwsapi_has::Relationship,
        attributes: u8,
        dense_inverse: bool,
        host_policy_eligible: bool,
        siblings: std::cell::Cell<Option<bool>>,
    },
}

impl Candidates {
    fn len(&self) -> usize {
        match self {
            Self::Subjects(nodes) => nodes.len(),
            Self::BulkHas {
                anchors, witnesses, ..
            } => anchors.len() + witnesses.len(),
        }
    }

    fn select(&self, tree: &Tree, selectors: &PreparedList) -> Vec<Handle> {
        match self {
            Self::Subjects(nodes) => selectors.filter_document(tree, nodes.iter().copied()),
            Self::BulkHas {
                anchors,
                witnesses,
                relationship,
                attributes,
                dense_inverse,
                host_policy_eligible,
                siblings,
            } => {
                use nwsapi_has::has_policy::{Features, Route};
                if witnesses.is_empty() || anchors.is_empty() {
                    return Vec::new();
                }
                let mut features = Features {
                    relationship: *relationship,
                    anchors: u32::try_from(anchors.len()).unwrap_or(u32::MAX),
                    witnesses: u32::try_from(witnesses.len()).unwrap_or(u32::MAX),
                    sibling_anchors: true,
                    attributes: *attributes,
                    dense_inverse: *dense_inverse,
                };
                let planner = tree.bulk_has_planner.as_ref();
                // An explicitly registered planner owns route selection, even when a host
                // model is also configured. This mirrors the JS API where custom planners
                // replace the generated host policy.
                let host_policy = (planner.is_none()
                    && *host_policy_eligible
                    && tree.host_document == Some(HostDocumentKind::Html)
                    && tree.compat_mode() != "BackCompat")
                    .then_some(tree.bulk_has_host_policy)
                    .flatten()
                    .map(|host| {
                        nwsapi_has::has_policy::choose_host(
                            host,
                            nwsapi_has::has_policy::HostFeatures {
                                anchors: features.anchors,
                                witnesses: features.witnesses,
                                attributes: features.attributes,
                                dense_inverse: features.dense_inverse,
                            },
                        )
                    });
                let default_route =
                    host_policy.unwrap_or_else(|| NATIVE_HAS_POLICY.choose(features));
                if tree.selector_config.route_planner
                    && (planner.is_some() || default_route == Route::Forward)
                {
                    features.sibling_anchors = siblings.get().unwrap_or_else(|| {
                        let parent = tree.parent(anchors[0]);
                        let shares = anchors.iter().all(|&anchor| tree.parent(anchor) == parent);
                        siblings.set(Some(shares));
                        shares
                    });
                    let route = planner.map_or_else(
                        || host_policy.unwrap_or_else(|| NATIVE_HAS_POLICY.choose(features)),
                        |choose| choose.choose(features),
                    );
                    if route == Route::Forward {
                        return forward_class_has(tree, &selectors.selectors[0], anchors);
                    }
                }
                let nav = LiveNavigator(tree);
                nwsapi_has::filter_anchors(
                    anchors.iter().copied(),
                    witnesses.iter().copied(),
                    *relationship,
                    |h| nav.parent(h),
                )
            }
        }
    }
}

impl Tree {
    fn visit_document_elements(&self, mut visit: impl FnMut(Handle)) {
        let mut stack = vec![self.root()];
        while let Some(node) = stack.pop() {
            if self.node_type(node) == NodeType::Element {
                visit(node);
            }
            let base = stack.len();
            self.for_each_light_child(node, |child| stack.push(child));
            stack[base..].reverse();
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn collect_bulk_has(
        &self,
        root: Handle,
        anchor: &Compound,
        witness: &Compound,
        relationship: nwsapi_has::Relationship,
        attributes: u8,
        dense_inverse: bool,
        host_policy_eligible: bool,
    ) -> Candidates {
        let mut anchors = Vec::new();
        let mut witnesses = Vec::new();
        self.some_descendant(root, |h| {
            if compound_class_attr_match(self, h, anchor) {
                anchors.push(h);
            }
            if compound_class_attr_match(self, h, witness) {
                witnesses.push(h);
            }
            false
        });
        Candidates::BulkHas {
            anchors,
            witnesses,
            relationship,
            attributes,
            dense_inverse,
            host_policy_eligible,
            siblings: std::cell::Cell::new(None),
        }
    }

    fn query_scoped_bulk_has(&self, root: Handle, selectors: &PreparedList) -> Option<Vec<Handle>> {
        let (anchor, witness, relationship, attributes, dense_inverse) =
            class_has_parts(&selectors.selectors)?;
        Some(
            self.collect_bulk_has(
                root,
                anchor,
                witness,
                relationship,
                attributes,
                dense_inverse,
                self.node_type(root) == NodeType::Document,
            )
            .select(self, selectors),
        )
    }

    #[cfg(test)]
    fn query_candidates(&self, source: &str, selectors: &[Complex]) -> std::rc::Rc<Candidates> {
        self.collect_query_candidates(source, selectors, false).0
    }

    fn collect_query_candidates(
        &self,
        source: &str,
        selectors: &[Complex],
        match_cold: bool,
    ) -> (std::rc::Rc<Candidates>, Option<Vec<Handle>>) {
        let mut cache = self.query_candidates.borrow_mut();
        if cache.version != self.version {
            cache.version = self.version;
            cache.entries.clear();
        }
        if let Some(cached) = cache.entries.get(source) {
            return (cached.candidates.clone(), None);
        }

        // A rightmost class is a necessary condition for its selector-list arm.
        // Visiting each element once preserves document order and removes duplicates.
        let mut class_dependencies = rustc_hash::FxHashSet::default();
        let mut results = None;
        let candidates = if let Some((anchor, witness, relationship, attributes, dense_inverse)) =
            class_has_parts(selectors)
        {
            class_dependencies.extend(anchor.classes.iter().cloned());
            class_dependencies.extend(witness.classes.iter().cloned());
            self.collect_bulk_has(
                self.root(),
                anchor,
                witness,
                relationship,
                attributes,
                dense_inverse,
                true,
            )
        } else {
            let tails: Vec<_> = selectors
                .iter()
                .map(|selector| compound_at(selector, selector.rest.len()))
                .collect();
            if tails.iter().any(|tail| tail.classes.is_empty()) {
                // This arm admits every element, so class changes cannot alter the union.
                class_dependencies.clear();
            } else {
                for tail in &tails {
                    class_dependencies.extend(tail.classes.iter().cloned());
                }
            }
            let mut nodes = Vec::new();
            if match_cold {
                let nav = LiveNavigator(self);
                let mut matched = Vec::new();
                self.visit_document_elements(|h| {
                    let mut admitted = false;
                    for (selector, tail) in selectors.iter().zip(&tails) {
                        if !compound_classes_match(self, h, tail) {
                            continue;
                        }
                        admitted = true;
                        // The walk supplied an element and the class admission
                        // already tested the rightmost classes.
                        if matches_compound_fields::<false, false, _>(&nav, h, tail)
                            && continue_chain(&nav, h, selector, selector.rest.len(), None)
                        {
                            matched.push(h);
                            break;
                        }
                    }
                    if admitted {
                        nodes.push(h);
                    }
                });
                results = Some(matched);
            } else {
                self.visit_document_elements(|h| {
                    if tails
                        .iter()
                        .any(|tail| compound_classes_match(self, h, tail))
                    {
                        nodes.push(h);
                    }
                });
            }
            Candidates::Subjects(nodes)
        };
        let candidates = std::rc::Rc::new(candidates);
        if candidates.len() <= 16_384 {
            if cache.entries.len() == 32 {
                cache.entries.clear();
            }
            cache.entries.insert(
                source.to_owned(),
                CachedCandidates {
                    candidates: candidates.clone(),
                    class_dependencies,
                },
            );
        }
        (candidates, results)
    }
}

impl Tree {
    /// Parse `selector` into its selector-list, memoized by string in `parse_cache`
    /// (shared `Rc`, so a repeated selector parses once). Empty/combinator-only
    /// segments are dropped at parse time, so every `Complex` returned is non-empty.
    /// Bounded like the query cache (clear-on-overflow) to stay leak-free.
    fn parse_selector_cached(&self, selector: &str) -> std::rc::Rc<PreparedList> {
        if let Some(hit) = self.parse_cache.borrow_mut().get(selector) {
            return hit;
        }
        // A selector with CSS escapes goes through the UTF-16 parser, which decodes them
        // (the scalar tokenizer would split `.md\:flex` at the `:`). The binding already
        // routes escaped JS selectors there, so both APIs read escapes the same way.
        let source = source::normalize_str(selector, source::Mode::Dom);
        let list = std::rc::Rc::new(PreparedList::new(
            if source.contains('\\') {
                units::list(&source.encode_utf16().collect::<Vec<_>>())
            } else {
                parse_selector_list_str(&source)
            },
            selector.len(),
        ));
        let mut cache = self.parse_cache.borrow_mut();
        cache.retain_plan(
            self.selector_config,
            selector.len(),
            || selector.to_owned(),
            &list,
        );
        list
    }

    /// `element.matches(selector)`: `:scope` is `h` itself.
    pub fn matches(&self, h: Handle, selector: &str) -> bool {
        self.matches_scoped(h, selector, h)
    }

    /// Does `h` match `selector` with `scope` as the `:scope` element (an element-rooted
    /// query or `closest()` tests each candidate against the element it was called on)?
    pub fn matches_scoped(&self, h: Handle, selector: &str, scope: Handle) -> bool {
        // every `cx` reaching the matcher is a non-empty `Complex` (parse_selector_cached
        // drops empty/combinator-only segments). Re-parsing is avoided across an
        // element-loop `matches()` via the parse cache.
        self.parse_selector_cached(selector)
            .matches(self, h, Some(scope))
    }

    /// `element.closest(selector)`: the nearest inclusive element ancestor of `h` matching
    /// `selector`, with `h` as the `:scope` element.
    #[must_use]
    pub fn closest(&self, h: Handle, selector: &str) -> Option<Handle> {
        self.parse_selector_cached(selector).closest_from(self, h)
    }

    /// querySelectorAll, document-order, version-cached by selector string. Returns a
    /// shared `Rc<[Handle]>` so a cache hit (the common RTL repeated-query case) is a
    /// pointer bump — no Vec copy. Deref to `&[Handle]` for `.len()`/`[i]`/`.iter()`.
    pub fn query_selector_all(&self, selector: &str) -> std::rc::Rc<[Handle]> {
        {
            let mut cache = self.qcache.borrow_mut();
            cache.sync(self.version);
            if let Some(hit) = cache.map.get(selector) {
                return hit.clone();
            }
        }
        let selectors = self.parse_selector_cached(selector);
        let out = if self.selector_config.ids_dupes {
            let (candidates, cold_results) = self.collect_query_candidates(
                selector,
                &selectors.selectors,
                selectors.begin_document_match(),
            );
            cold_results.unwrap_or_else(|| candidates.select(self, &selectors))
        } else {
            selectors.select_from(self, self.root())
        };
        let rc: std::rc::Rc<[Handle]> = out.into();
        {
            let mut cache = self.qcache.borrow_mut();
            // Bound the cache (parity with the JS __selectorCache cap): once it grows
            // past CACHE_CAP distinct keys, clear it wholesale rather than grow
            // unbounded. A pathological caller cycling unique selectors can't leak.
            bounded_insert(&mut cache.map, selector.to_string(), rc.clone());
        }
        rc
    }

    pub fn query_selector(&self, selector: &str) -> Option<Handle> {
        {
            let mut cache = self.qcache.borrow_mut();
            cache.sync(self.version);
            if let Some(hit) = cache.map.get(selector) {
                return hit.first().copied();
            }
            if let Some(&hit) = cache.first.get(selector) {
                return hit;
            }
        }
        let first = self.query_selector_from(self.root(), selector, None);
        bounded_insert(
            &mut self.qcache.borrow_mut().first,
            selector.to_owned(),
            first,
        );
        first
    }

    pub(crate) fn query_selector_from(
        &self,
        root: Handle,
        selector: &str,
        scope: Option<Handle>,
    ) -> Option<Handle> {
        self.parse_selector_cached(selector)
            .first_from(self, root, scope)
    }

    /// Strict (`_checked`) variants: validate the selector first and return
    /// `Err(SelectorError)` for exactly the input Chrome 156's `querySelector` rejects with a
    /// `SyntaxError` (the stylesheet grammar of [`parse_for_cascade`]; P5b,
    /// miaskiewicz/turbo-dom#18), instead of the lenient "do my best / return nothing" of the
    /// infallible methods above. This is the opt-in parity path for consumers that want a typo'd or
    /// user-supplied selector to fail loudly rather than silently match nothing. On a
    /// valid selector they delegate to the (cached) lenient method — no extra matching
    /// cost beyond the one validation pass.
    ///
    /// # Errors
    /// Returns [`SelectorError`] when `selector` is malformed (unterminated `[...]`, an
    /// unexpected character, a dangling combinator or empty item, or a selector Chrome
    /// rejects: [`SelectorError::Invalid`]).
    pub fn query_selector_all_checked(
        &self,
        selector: &str,
    ) -> Result<std::rc::Rc<[Handle]>, SelectorError> {
        self.validate_selector(selector)?;
        Ok(self.query_selector_all(selector))
    }

    /// Strict `query_selector` — see [`Tree::query_selector_all_checked`].
    ///
    /// # Errors
    /// Returns [`SelectorError`] when `selector` is malformed.
    pub fn query_selector_checked(&self, selector: &str) -> Result<Option<Handle>, SelectorError> {
        self.validate_selector(selector)?;
        Ok(self.query_selector(selector))
    }

    /// Strict `matches` — see [`Tree::query_selector_all_checked`].
    ///
    /// # Errors
    /// Returns [`SelectorError`] when `selector` is malformed.
    pub fn matches_checked(&self, h: Handle, selector: &str) -> Result<bool, SelectorError> {
        self.validate_selector(selector)?;
        Ok(self.matches(h, selector))
    }

    /// getElementById, version-cached. Shares `qcache` with querySelectorAll under a
    /// `\u{1}`-prefixed key (never a valid selector char, so no collision). Result is
    /// stored as a 0- or 1-element Vec. Mirrors the JS `__idCache`.
    pub fn get_element_by_id(&self, id: &str) -> Option<Handle> {
        let key = {
            let mut k = String::with_capacity(id.len() + 1);
            k.push('\u{1}');
            k.push_str(id);
            k
        };
        {
            let mut cache = self.qcache.borrow_mut();
            cache.sync(self.version);
            if let Some(hit) = cache.map.get(&key) {
                return hit.first().copied();
            }
        }
        let mut found = None;
        let mut stack = vec![self.root()];
        while let Some(h) = stack.pop() {
            if self.node_type(h) == NodeType::Element
                && self.get_attribute_ns_borrowed(h, None, "id") == Some(id)
                && self.attribute_is_scalar(h, "id")
            {
                found = Some(h);
                break;
            }
            let base = stack.len();
            self.for_each_light_child(h, |c| stack.push(c));
            stack[base..].reverse();
        }
        {
            let mut cache = self.qcache.borrow_mut();
            bounded_insert(&mut cache.map, key, found.into_iter().collect());
        }
        found
    }

    pub fn get_elements_by_tag_name(&self, tag: &str) -> Vec<Handle> {
        self.by_tag(None, tag)
    }
}

#[cfg(test)]
mod tests {
    use super::super::tree::Tree;
    use super::{class_has_parts, parse_selector_list_str};

    #[test]
    fn qsa_compound_and_descendant() {
        let tree = Tree::parse(
            "<main class=grid><div class='card x'><span class=t>a</span></div><div class=card><b>b</b></div></main>",
        );
        assert_eq!(tree.query_selector_all("div.card").len(), 2);
        assert_eq!(tree.query_selector_all(".grid .t").len(), 1);
        assert_eq!(tree.query_selector_all("main > div").len(), 2);
        assert_eq!(tree.query_selector_all("main > span").len(), 0);
    }

    #[test]
    fn qsa_id_and_attr() {
        let tree = Tree::parse("<a id=home href='/x' data-k=v>hi</a><a href='/y'>z</a>");
        assert!(tree.query_selector("#home").is_some());
        assert_eq!(tree.query_selector_all("a[href]").len(), 2);
        assert_eq!(tree.query_selector_all("a[data-k=v]").len(), 1);
        assert_eq!(tree.query_selector_all("[data-k='v']").len(), 1);
    }

    #[test]
    fn attr_operators() {
        let tree = Tree::parse(
            "<a href='/docs/intro' lang='en-US' class='btn primary' data-x='foobar'>1</a>\
             <a href='/help' lang='en' class='btn' data-x='bazfoo'>2</a>",
        );
        assert_eq!(tree.query_selector_all("a[href^='/docs']").len(), 1);
        assert_eq!(tree.query_selector_all("a[href$='intro']").len(), 1);
        assert_eq!(tree.query_selector_all("a[data-x*='oba']").len(), 1); // foobar
        assert_eq!(tree.query_selector_all("a[class~='primary']").len(), 1);
        assert_eq!(tree.query_selector_all("a[class~='btn']").len(), 2);
        assert_eq!(tree.query_selector_all("a[lang|='en']").len(), 2); // en + en-US
        assert_eq!(tree.query_selector_all("a[href^='/x']").len(), 0);
    }

    #[test]
    fn get_element_by_id_caches_and_invalidates() {
        let mut tree = Tree::parse("<div id=a></div><div id=b></div>");
        let a = tree.get_element_by_id("a").unwrap(); // miss → walk → cache
        assert_eq!(tree.get_element_by_id("a"), Some(a)); // hit path
        assert_eq!(tree.get_element_by_id("missing"), None); // negative cached
        assert_eq!(tree.get_element_by_id("missing"), None); // hit of negative
                                                             // mutation bumps version → cache cleared, new id visible
        let root = tree.root();
        let c = tree.create_element("div");
        tree.set_attribute(c, "id", "c");
        tree.append_child(root, c);
        assert_eq!(tree.get_element_by_id("c"), Some(c));
    }

    #[test]
    fn cache_invalidates_on_mutation() {
        let mut tree = Tree::parse("<ul><li class=x>1</li></ul>");
        assert_eq!(tree.query_selector_all(".x").len(), 1);
        let ul = tree.get_elements_by_tag_name("ul")[0];
        let li = tree.create_element("li");
        tree.set_attribute(li, "class", "x");
        tree.append_child(ul, li);
        assert_eq!(tree.query_selector_all(".x").len(), 2); // cache cleared by version bump
    }

    #[test]
    fn document_candidates_survive_data_writes_and_follow_class_and_tree_changes() {
        let mut tree = Tree::parse(
            "<main><div class=a id=first><i class=b></i></div><div class=a id=second></div></main>",
        );
        let first = tree.get_element_by_id("first").unwrap();
        let second = tree.get_element_by_id("second").unwrap();
        let witness = tree.query_selector(".b").unwrap();
        let source = ".a[data-on]";
        let selectors = tree.parse_selector_cached(source);
        let candidates = tree.query_candidates(source, &selectors.selectors);
        assert!(tree.query_selector_all(source).is_empty());

        tree.set_attribute(second, "data-on", "");
        assert!(std::rc::Rc::ptr_eq(
            &candidates,
            &tree.query_candidates(source, &selectors.selectors)
        ));
        assert_eq!(&*tree.query_selector_all(source), &[second]);

        let bulk = ".a:has(> .b)";
        assert_eq!(&*tree.query_selector_all(bulk), &[first]);
        tree.append_child(second, witness);
        assert_eq!(&*tree.query_selector_all(bulk), &[second]);
        tree.set_attribute(second, "class", "other");
        let after_class = tree.query_candidates(source, &selectors.selectors);
        assert!(!std::rc::Rc::ptr_eq(&candidates, &after_class));
        tree.set_attribute(first, "data-pass", "");
        assert!(tree.query_selector_all(source).is_empty());
        assert!(tree.query_selector_all(bulk).is_empty());
    }

    #[test]
    fn candidate_cache_keeps_entries_when_unrelated_class_membership_is_unchanged() {
        let mut tree = Tree::parse(
            "<main class=root><div class='flag title' id=subject></div><i class=witness></i></main>",
        );
        let root = tree.query_selector("main").unwrap();
        let subject = tree.get_element_by_id("subject").unwrap();
        let selector = ".title";
        let parsed = tree.parse_selector_cached(selector);
        let before = tree.query_candidates(selector, &parsed.selectors);

        tree.set_attribute(root, "class", "root changed");
        let after = tree.query_candidates(selector, &parsed.selectors);
        assert!(std::rc::Rc::ptr_eq(&before, &after));
        assert_eq!(&*tree.query_selector_all(selector), &[subject]);

        let witness_query = ".flag:has(.witness)";
        let parsed_witness = tree.parse_selector_cached(witness_query);
        let before_witness = tree.query_candidates(witness_query, &parsed_witness.selectors);
        tree.set_attribute(subject, "class", "title");
        let after_witness = tree.query_candidates(witness_query, &parsed_witness.selectors);
        assert!(!std::rc::Rc::ptr_eq(&before_witness, &after_witness));
        assert!(tree.query_selector_all(witness_query).is_empty());
    }

    #[test]
    fn first_results_do_not_truncate_all_and_units_respect_scope() {
        let mut tree = Tree::parse("<section id=a><i class=item></i><i class=item></i></section><section id=b><i class=item></i></section>");
        let a = tree.get_element_by_id("a").unwrap();
        let b = tree.get_element_by_id("b").unwrap();
        let first = tree.query_selector(".item").unwrap();
        let all = tree.query_selector_all(".item");
        assert_eq!(all.len(), 3);
        assert_eq!(all[0], first);
        let units: Vec<_> = ":scope > .item".encode_utf16().collect();
        let a_results = tree.query_selector_all_from_units(a, &units);
        let b_results = tree.query_selector_all_from_units(b, &units);
        assert_eq!(&*a_results, &all[..2]);
        assert_eq!(&*b_results, &all[2..]);
        assert!(std::rc::Rc::ptr_eq(
            &a_results,
            &tree.query_selector_all_from_units(a, &units)
        ));
        tree.set_attribute(first, "class", "other");
        assert_eq!(&*tree.query_selector_all_from_units(a, &units), &all[1..2]);
        assert_eq!(tree.query_selector(".item"), Some(all[1]));
        assert_eq!(
            tree.query_selector_units(&".item".encode_utf16().collect::<Vec<_>>()),
            Some(all[1])
        );
    }

    #[test]
    fn matches_parse_cache_repeated_selector() {
        // Repeated matches() with the SAME selector over an element loop must hit the
        // parse cache and still return the correct per-element verdict.
        let tree = Tree::parse("<ul><li class=x>1</li><li>2</li><li class=x>3</li></ul>");
        let lis = tree.get_elements_by_tag_name("li");
        // first pass populates the parse cache; second pass hits it — both agree.
        for _ in 0..2 {
            let hits: Vec<_> = lis
                .iter()
                .copied()
                .filter(|&h| tree.matches(h, "li.x"))
                .collect();
            assert_eq!(hits.len(), 2);
            assert_eq!(tree.text_content(hits[0]), "1");
            assert_eq!(tree.text_content(hits[1]), "3");
        }
        // a different selector parses fresh and is also correct
        assert!(tree.matches(lis[1], "li:not(.x)"));
        assert!(!tree.matches(lis[0], "li:not(.x)"));
    }

    #[test]
    fn matches_and_get_by_id() {
        let tree = Tree::parse("<div id=root><p class=lead>hi</p></div>");
        let p = tree.query_selector("p.lead").unwrap();
        assert!(tree.matches(p, "div#root p.lead"));
        assert!(tree.matches(p, ".lead"));
        assert!(!tree.matches(p, "span"));
        assert!(tree.get_element_by_id("root").is_some());
    }

    #[test]
    fn pseudo_structural_first_last() {
        let tree = Tree::parse("<ul><li>1</li><li>2</li><li>3</li></ul>");
        assert_eq!(tree.query_selector_all("li:first-child").len(), 1);
        assert_eq!(tree.query_selector_all("li:last-child").len(), 1);
        // the first li matches :first-child and contains text "1"
        let first = tree.query_selector("li:first-child").unwrap();
        assert_eq!(tree.text_content(first), "1");
        let last = tree.query_selector("li:last-child").unwrap();
        assert_eq!(tree.text_content(last), "3");
    }

    #[test]
    fn pseudo_nth_child() {
        let tree = Tree::parse("<ul><li>1</li><li>2</li><li>3</li><li>4</li></ul>");
        // nth-child(2) → exactly the 2nd
        let two = tree.query_selector_all("li:nth-child(2)");
        assert_eq!(two.len(), 1);
        assert_eq!(tree.text_content(two[0]), "2");
        // odd → 1st and 3rd
        let odd = tree.query_selector_all("li:nth-child(odd)");
        assert_eq!(odd.len(), 2);
        assert_eq!(tree.text_content(odd[0]), "1");
        assert_eq!(tree.text_content(odd[1]), "3");
        // even → 2nd and 4th
        assert_eq!(tree.query_selector_all("li:nth-child(even)").len(), 2);
        // 2n+1 == odd
        assert_eq!(tree.query_selector_all("li:nth-child(2n+1)").len(), 2);

        let filtered = Tree::parse(
            "<ul><li id=a class=item></li><li id=b></li><li id=c class=item></li></ul>",
        );
        assert_eq!(
            filtered
                .query_selector_all("li:nth-child(odd/**/of .item)")
                .iter()
                .filter_map(|&node| filtered.get_attribute(node, "id"))
                .collect::<Vec<_>>(),
            ["a"]
        );
    }

    #[test]
    fn pseudo_of_type() {
        let tree = Tree::parse("<div><span>a</span><b>x</b><span>b</span></div>");
        assert_eq!(tree.query_selector_all("span:first-of-type").len(), 1);
        assert_eq!(tree.query_selector_all("span:last-of-type").len(), 1);
        assert_eq!(tree.query_selector_all("b:only-of-type").len(), 1);
        assert_eq!(tree.query_selector_all("span:only-of-type").len(), 0);
    }

    #[test]
    fn attr_value_with_spaces() {
        // quoted attribute value containing spaces must not be split by the complex tokenizer
        let tree = Tree::parse("<svg viewBox=\"0 0 10 10\"></svg>");
        assert_eq!(
            tree.query_selector_all("svg[viewBox=\"0 0 10 10\"]").len(),
            1
        );
        assert_eq!(tree.query_selector_all("[viewBox=\"0 0 10 10\"]").len(), 1);
        assert_eq!(tree.query_selector_all("svg[viewBox=\"9 9 9 9\"]").len(), 0);
    }

    #[test]
    fn pseudo_checked() {
        let tree = Tree::parse("<form><input type=checkbox checked><input type=checkbox></form>");
        let checked = tree.query_selector_all("input:checked");
        assert_eq!(checked.len(), 1);
        // option[selected] also counts as :checked
        let t2 = Tree::parse("<select><option>a</option><option selected>b</option></select>");
        assert_eq!(t2.query_selector_all("option:checked").len(), 1);
    }

    #[test]
    fn pseudo_disabled_required() {
        let tree = Tree::parse("<form><input disabled><input required><button></button></form>");
        assert_eq!(tree.query_selector_all(":disabled").len(), 1);
        assert_eq!(tree.query_selector_all("input:required").len(), 1);
        // enabled: input/button that isn't disabled (the required input + the button)
        assert_eq!(tree.query_selector_all(":enabled").len(), 2);
    }

    #[test]
    fn pseudo_default_uses_default_form_values_and_submitter_order() {
        let tree = Tree::parse(
            "<form id=f><input id=check type=checkbox checked><input id=first type=submit>\
             <button id=second>Submit</button><select><option id=choice selected></option></select></form>\
             <input id=external type=submit form=f>",
        );
        let matches = |id: &str| {
            let element = tree.get_element_by_id(id).unwrap();
            tree.matches(element, ":default")
        };
        assert!(matches("check"));
        assert!(matches("choice"));
        assert!(matches("first"));
        assert!(!matches("second"));
        assert!(!matches("external"));
    }

    #[test]
    fn pseudo_default_orders_image_inputs_with_all_submit_buttons() {
        let tree = Tree::parse(
            "<form id=f><button id=button>Go</button><input id=image type=image>\
             <input id=submit type=submit></form><form id=g><input id=first-image type=image>\
             <button id=later-button>Go</button></form>",
        );
        let matches = |id: &str| {
            let element = tree.get_element_by_id(id).unwrap();
            tree.matches(element, ":default")
        };
        assert!(matches("button"));
        assert!(!matches("image"));
        assert!(!matches("submit"));
        assert!(matches("first-image"));
        assert!(!matches("later-button"));
    }

    /// turbo-dom#18 (P5b): `:disabled` follows HTML "actually disabled" like Chrome 156 —
    /// a disabled fieldset ancestor (outside its first legend), live properties included,
    /// and an option of a disabled select; elements outside the form set match neither.
    #[test]
    fn pseudo_disabled_follows_fieldsets_and_owner_selects() {
        use super::super::tree::FormProp;
        let mut tree = Tree::parse(
            "<fieldset id=f><legend><input id=a></legend><input id=b></fieldset>\
             <select id=s><optgroup id=g><option id=o>x</option></optgroup></select><div id=d disabled></div>",
        );
        let el = |tree: &Tree, id: &str| tree.get_element_by_id(id).unwrap();
        assert!(!tree.matches(el(&tree, "b"), ":disabled"));
        let f = el(&tree, "f");
        tree.set_form_property(f, FormProp::Disabled, true);
        assert!(tree.matches(el(&tree, "b"), ":disabled"));
        assert!(
            tree.matches(el(&tree, "a"), ":enabled"),
            "inside the first legend"
        );
        assert!(tree.matches(f, ":disabled"));
        let (s, o) = (el(&tree, "s"), el(&tree, "o"));
        assert!(tree.matches(o, ":enabled"));
        tree.set_form_property(s, FormProp::Disabled, true);
        assert!(
            tree.matches(o, ":disabled"),
            "owner select through an optgroup"
        );
        assert!(
            !tree.matches(el(&tree, "g"), ":disabled"),
            "optgroup: own state only"
        );
        let d = el(&tree, "d");
        assert!(!tree.matches(d, ":disabled") && !tree.matches(d, ":enabled"));
    }

    #[test]
    fn pseudo_not() {
        let tree = Tree::parse("<ul><li class=x>1</li><li>2</li><li class=x>3</li></ul>");
        let not_x = tree.query_selector_all("li:not(.x)");
        assert_eq!(not_x.len(), 1);
        assert_eq!(tree.text_content(not_x[0]), "2");
        // :not with a tag
        assert_eq!(tree.query_selector_all("li:not(li)").len(), 0);
    }

    #[test]
    fn pseudo_empty() {
        let tree = Tree::parse("<ul><li></li><li>x</li><li></li></ul>");
        assert_eq!(tree.query_selector_all("li:empty").len(), 2);
    }

    #[test]
    fn pseudo_unknown_matches_nothing() {
        let tree = Tree::parse("<div><p>a</p><p>b</p></div>");
        // an unsupported pseudo never matches (honest)
        assert_eq!(tree.query_selector_all("p:hover").len(), 0);
        assert_eq!(tree.query_selector_all("p:focus-within").len(), 0);
        // but the rest of the compound is still parsed: p without the pseudo matches
        assert_eq!(tree.query_selector_all("p").len(), 2);
    }

    #[test]
    fn pseudo_combined_with_combinator() {
        let tree = Tree::parse("<ul><li class=a>1</li><li class=a>2</li></ul><ol><li>x</li></ol>");
        // descendant + pseudo
        assert_eq!(tree.query_selector_all("ul li:first-child").len(), 1);
        assert_eq!(tree.query_selector_all("ul > li:last-child.a").len(), 1);
    }

    #[test]
    fn pseudo_nth_of_type_and_last() {
        // 2 spans then a b then a span — nth-of-type counts only same-tag siblings
        let tree = Tree::parse("<div><span>1</span><span>2</span><b>x</b><span>3</span></div>");
        // nth-of-type(2) → the 2nd span
        let nt = tree.query_selector_all("span:nth-of-type(2)");
        assert_eq!(nt.len(), 1);
        assert_eq!(tree.text_content(nt[0]), "2");
        // nth-last-of-type(1) → the last span (the 3rd)
        let nlt = tree.query_selector_all("span:nth-last-of-type(1)");
        assert_eq!(nlt.len(), 1);
        assert_eq!(tree.text_content(nlt[0]), "3");
        // nth-last-child(1) → last child of each parent
        let nlc = tree.query_selector_all("span:nth-last-child(1)");
        assert_eq!(nlc.len(), 1);
        assert_eq!(tree.text_content(nlc[0]), "3");
        // nth-of-type with An+B coefficient form covering nth-of-type arm
        assert_eq!(tree.query_selector_all("span:nth-of-type(2n)").len(), 1); // the 2nd span
                                                                              // nth-last-of-type An+B form
        assert_eq!(
            tree.query_selector_all("span:nth-last-of-type(2n+1)").len(),
            2
        );
    }

    #[test]
    fn pseudo_only_child() {
        let tree = Tree::parse("<div><p>solo</p></div><div><p>a</p><p>b</p></div>");
        // only the first div's p is an only-child
        let only = tree.query_selector_all("p:only-child");
        assert_eq!(only.len(), 1);
        assert_eq!(tree.text_content(only[0]), "solo");
    }

    #[test]
    fn pseudo_root() {
        // <html> is the root element (parent is the document container, not an element)
        let tree = Tree::parse("<div>x</div>");
        let root = tree.query_selector_all(":root");
        assert_eq!(root.len(), 1);
        assert_eq!(tree.local_name(root[0]), Some("html"));
        // a nested element is NOT :root (its parent IS an element)
        assert_eq!(tree.query_selector_all("div:root").len(), 0);
    }

    #[test]
    fn pseudo_optional_readonly_readwrite_selected() {
        let tree = Tree::parse(
            "<form>\
               <input>\
               <input required>\
               <input readonly>\
               <select><option>a</option><option selected>b</option></select>\
               <input id=hidden-required type=hidden required>\
               <input id=range-required type=range required>\
               <input id=color-required type=color required>\
               <input id=submit-required type=submit required>\
               <button id=button-required required></button>\
               <svg><input id=svg-required required></input></svg>\
             </form>",
        );
        let optional_inputs = tree
            .query_selector_all("input:optional")
            .iter()
            .map(|&node| tree.get_attribute(node, "id"))
            .collect::<Vec<_>>();
        assert_eq!(
            optional_inputs,
            [
                None,
                None,
                Some("hidden-required"),
                Some("range-required"),
                Some("color-required"),
                Some("submit-required"),
            ]
        );
        assert_eq!(tree.query_selector_all(":required").len(), 1);
        assert_eq!(
            tree.query_selector_all(":optional")
                .iter()
                .filter(|&&node| tree.local_name(node) == Some("button"))
                .count(),
            1
        );
        assert_eq!(tree.query_selector_all("svg :optional").len(), 0);
        // changed@S3a (control: cascade_selectors_chrome156.json "read-only-read-write"):
        // :read-only — every element that is not read-write, including the two SVG
        // elements and the readonly input, select and options.
        assert_eq!(tree.query_selector_all(":read-only").len(), 15);
        assert_eq!(tree.query_selector_all("input:read-only").len(), 6);
        // :read-write — mutable text inputs (the bare and the required one)
        let rw = tree.query_selector_all("input:read-write");
        assert_eq!(rw.len(), 2);
        assert_eq!(tree.query_selector_all(":read-write").len(), 2);
        // :selected — the selected option
        let sel = tree.query_selector_all("option:selected");
        assert_eq!(sel.len(), 1);
        assert_eq!(tree.text_content(sel[0]), "b");
    }

    #[test]
    fn read_only_state_pseudos_follow_the_v3_supported_names() {
        let mut tree =
            Tree::parse("<input id=readonly readonly><input id=editable><input id=autofill>");
        let readonly = tree.get_element_by_id("readonly").unwrap();
        let editable = tree.get_element_by_id("editable").unwrap();
        let autofill = tree.get_element_by_id("autofill").unwrap();
        assert!(tree.compile_selector(":-moz-read-only").is_err());
        assert!(tree.compile_selector(":-moz-read-write").is_err());
        assert!(tree.compile_selector(":-webkit-full-screen").is_ok());
        assert!(tree
            .compile_selector(":-webkit-full-screen-ancestor")
            .is_ok());
        assert!(tree.set_selector_state(editable, crate::SelectorState::Fullscreen, true));
        assert!(tree.matches(editable, ":-webkit-full-screen"));
        assert!(tree.set_selector_state(readonly, crate::SelectorState::FullscreenAncestor, true));
        assert!(tree.matches(readonly, ":-webkit-full-screen-ancestor"));
        assert!(tree.set_selector_state(autofill, crate::SelectorState::Autofill, true));
        for selector in [":autofill", ":-webkit-autofill"] {
            assert!(tree.matches(autofill, selector), "{selector}");
            assert!(!tree.matches(readonly, selector), "{selector}");
            assert!(!tree.matches(editable, selector), "{selector}");
        }
    }

    #[test]
    fn modern_host_reported_states_are_valid_and_match_only_when_enabled() {
        let mut tree = Tree::parse("<main id=state></main>");
        let element = tree.get_element_by_id("state").unwrap();
        let states = [
            (":interest-source", crate::SelectorState::InterestSource),
            (":interest-target", crate::SelectorState::InterestTarget),
            (":target-after", crate::SelectorState::TargetAfter),
            (":target-before", crate::SelectorState::TargetBefore),
            (":target-current", crate::SelectorState::TargetCurrent),
            (":xr-overlay", crate::SelectorState::XrOverlay),
        ];

        for (selector, state) in states {
            assert!(tree.compile_selector(selector).is_ok(), "{selector}");
            assert!(!tree.matches(element, selector), "{selector}");
            assert!(tree.set_selector_state(element, state, true));
            assert!(tree.matches(element, selector), "{selector}");
            assert!(tree.set_selector_state(element, state, false));
        }
    }

    #[test]
    fn nth_no_position_match_via_not() {
        // nth-* of an element with no parent isn't reachable through qSA (root always
        // has a container parent); but exercise the bare-integer-out-of-range nth.
        let tree = Tree::parse("<ul><li>1</li><li>2</li></ul>");
        // nth-child(0) never matches (1-based indices)
        assert_eq!(tree.query_selector_all("li:nth-child(0)").len(), 0);
        // nth-child() with empty arg → parse_nth("") bare-integer Err branch → (0,0) → matches index 0 → never
        assert_eq!(tree.query_selector_all("li:nth-child()").len(), 0);
        // nth-child(n) → a=1,b=0 (brest empty branch): matches every index
        assert_eq!(tree.query_selector_all("li:nth-child(n)").len(), 2);
    }

    #[test]
    fn nested_not_balanced_parens() {
        // a nested paren inside :not(...) exercises the depth-increment parse branch
        // (the inner `(2)` raises paren depth before the outer `)` closes it).
        // :not(:nth-child(2)) → all <p> EXCEPT the 2nd → here only the 1st.
        let tree = Tree::parse("<div><p>a</p><p>b</p></div>");
        let r = tree.query_selector_all("p:not(:nth-child(2))");
        assert_eq!(r.len(), 1);
        assert_eq!(tree.text_content(r[0]), "a");
    }

    #[test]
    fn compound_trailing_non_part_byte() {
        // After consuming a `[...]` attr the next byte is a plain char (not .#[:),
        // exercising the catch-all `_ => i += 1` arm in parse_compound (it skips
        // the stray byte). `div[id=x]y` → the trailing `y` is ignored.
        let tree = Tree::parse("<div id=x>hit</div>");
        assert_eq!(tree.query_selector_all("div[id=x]y").len(), 1);
    }

    #[test]
    fn tokenize_child_combinator_no_spaces() {
        // `a>b` with no surrounding whitespace: tokenize must flush the non-empty
        // `cur` ("section") when it hits `>`.
        let tree = Tree::parse("<section><div>x</div></section>");
        assert_eq!(tree.query_selector_all("section>div").len(), 1);
    }

    #[test]
    fn has_class_multi_word_scan() {
        // class value where the target word appears only after a non-matching prefix
        // substring — exercises the search-advance loop in has_class.
        let tree = Tree::parse("<div class='cardx card'>a</div><div class='cardx'>b</div>");
        // ".card" must whole-word match only the first (cardx is not "card")
        assert_eq!(tree.query_selector_all("div.card").len(), 1);
        // empty class selector never matches (has_class empty-cls guard) — via attr form
        // a selector like ".." parses an empty class then a second empty class
        assert_eq!(tree.query_selector_all(".").len(), 0);
    }

    #[test]
    fn child_combinator_fails_at_ancestor() {
        // `a > b` where b exists but its parent isn't `a` → Child combinator returns
        // false at the parent check.
        let tree = Tree::parse("<section><div><span>x</span></div></section>");
        // span's parent is div, not section → no match
        assert_eq!(tree.query_selector_all("section > span").len(), 0);
        // chain where the leftmost child combinator's parent is the root container
        // (parent() is Some but not matching) is covered above; force the parent()=None
        // path: `x > html` — html's parent is the document container, matches_compound
        // on a non-element parent returns false (handled), here parent IS Some.
        assert_eq!(tree.query_selector_all("span > nothing").len(), 0);
    }

    #[test]
    fn descendant_combinator_fails() {
        // `nomatch span` — no ancestor matches `nomatch` → descendant walk exhausts.
        let tree = Tree::parse("<div><span>x</span></div>");
        assert_eq!(tree.query_selector_all("nomatch span").len(), 0);
    }

    #[test]
    fn get_element_by_id_hit_and_miss() {
        let tree = Tree::parse("<div id=present><p>x</p></div>");
        assert!(tree.get_element_by_id("present").is_some());
        assert!(tree.get_element_by_id("absent").is_none());
    }

    #[test]
    fn detached_element_pseudos_and_child_parent_none() {
        // A freshly created element has no parent. `matches` drives the no-parent
        // branches directly:
        let mut tree = Tree::parse("<div>x</div>");
        let orphan = tree.create_element("p");
        // element_siblings → vec![h] fallback (no parent), so :first-child is true
        assert!(tree.matches(orphan, "p:first-child"));
        assert!(tree.matches(orphan, "p:last-child"));
        assert!(tree.matches(orphan, "p:only-child"));
        // :root is the document element only (P5b, Chrome): never a detached element
        assert!(!tree.matches(orphan, ":root"));
        // child combinator whose left side needs a parent that doesn't exist → false
        assert!(!tree.matches(orphan, "div > p"));
    }

    #[test]
    fn get_elements_by_tag_name_wildcard() {
        let tree = Tree::parse("<div><p>a</p><span>b</span></div>");
        // "*" returns every element (html, head, body, div, p, span)
        let all = tree.get_elements_by_tag_name("*");
        assert!(all.len() >= 4);
        // a specific tag, case-insensitive
        assert_eq!(tree.get_elements_by_tag_name("P").len(), 1);
        assert_eq!(tree.get_elements_by_tag_name("nope").len(), 0);
    }

    #[test]
    fn nth_child_with_whitespace_in_arg() {
        // CSS `An+B` notation permits whitespace: `2n + 1` is valid and means "odd".
        // The complex tokenizer must not split on the spaces inside the pseudo's
        // parentheses (it already protects `[...]` and quotes; parens are the same).
        let tree = Tree::parse("<ul><li>1</li><li>2</li><li>3</li><li>4</li></ul>");
        let odd = tree.query_selector_all("li:nth-child(2n + 1)");
        assert_eq!(odd.len(), 2);
        assert_eq!(tree.text_content(odd[0]), "1");
        assert_eq!(tree.text_content(odd[1]), "3");
    }

    #[test]
    fn parser_parity_corpus() {
        // The tricky-case corpus that the tokenizer + recursive-descent parser must
        // handle identically to the old ad-hoc scanner (mirrors the parallel JS effort).
        // Each selector is exercised against a fixture chosen to make it match exactly once.
        let cases: &[(&str, &str)] = &[
            ("div.card", "<div class='card'>x</div>"),
            (
                ".grid .t",
                "<div class='grid'><span class='t'>x</span></div>",
            ),
            ("main > div", "<main><div>x</div></main>"),
            ("a[href]", "<a href='/x'>x</a>"),
            ("a[data-k=v]", "<a data-k='v'>x</a>"),
            ("[data-k='v']", "<a data-k='v'>x</a>"),
            ("a[href^='/docs']", "<a href='/docs/intro'>x</a>"),
            ("a[data-x*='oba']", "<a data-x='foobar'>x</a>"),
            ("a[class~='primary']", "<a class='btn primary'>x</a>"),
            ("a[lang|='en']", "<a lang='en-US'>x</a>"),
            (
                "svg[viewBox=\"0 0 10 10\"]",
                "<svg viewBox=\"0 0 10 10\"></svg>",
            ),
            ("li:nth-child(2n + 1)", "<ul><li>1</li></ul>"),
            (
                ".a > .b .c",
                "<div class='a'><div class='b'><div class='c'>c</div></div></div>",
            ),
            ("div[id=x]y", "<div id='x'>hit</div>"), // lenient: trailing `y` ignored → matches
        ];
        for (sel, html) in cases {
            let tree = Tree::parse(html);
            assert_eq!(
                tree.query_selector_all(sel).len(),
                1,
                "selector {sel:?} should match exactly once in {html:?}"
            );
        }
        // :not with a NESTED pseudo whose argument itself contains balanced parens.
        let tree = Tree::parse("<div><p>a</p><p>b</p></div>");
        let r = tree.query_selector_all(":not(:nth-child(2))");
        // every element except the 2nd child of its parent: html, head, body, div, the 1st p
        assert!(r.iter().any(|&h| tree.local_name(h) == Some("p")));
        assert_eq!(
            tree.query_selector_all("p:not(:nth-child(2))").len(),
            1,
            "only the first <p> survives :not(:nth-child(2))"
        );
    }

    #[test]
    fn tokenizer_lenient_edges() {
        let tree = Tree::parse("<div><p>x</p></div>");
        // universal `*` selector: parsed compound has tag None → matches every element
        // (exercises the `s == \"*\"` any-tag branch of parse_compound_tokens).
        let all = tree.query_selector_all("*");
        assert!(all.len() >= 4); // html, head, body, div, p
        assert_eq!(tree.query_selector_all("*.nope").len(), 0); // `*` + a class that matches nothing
                                                                // a stray top-level closer is not part of any token — it is dropped, so the
                                                                // selector degrades to the rest (exercises the `']' | ')'` arm of tokenize;
                                                                // without that arm the ident scanner would stall on the special char).
        assert_eq!(tree.query_selector_all("div]").len(), 1);
        assert_eq!(tree.query_selector_all("p)").len(), 1);
    }

    #[test]
    fn descendant_then_child_backtracks() {
        // `.a > .b .c`: a `.c` inside a `.b` that is a DIRECT child of `.a`.
        // The matching `.b` (the outer one) is a child of `.a`; a *nearer* `.b`
        // (the inner one) is NOT a child of `.a`. A greedy nearest-ancestor matcher
        // picks the inner `.b`, fails the `> .a` child check, and wrongly reports no
        // match. The correct answer is 1 — the outer `.b` satisfies the chain.
        let tree = Tree::parse(
            "<div class=a>\
               <div class=b>\
                 <div class=x>\
                   <div class=b>\
                     <div class=c>c</div>\
                   </div>\
                 </div>\
               </div>\
             </div>",
        );
        assert_eq!(tree.query_selector_all(".a > .b .c").len(), 1);
    }

    #[test]
    fn dangling_trailing_combinator_matches_head_only() {
        // A trailing combinator with nothing after it (`a >`) is inert: it never
        // lands in `Complex.rest`, so the selector is exactly `a`. This preserves
        // the old behavior BY RESULT now that "leading/trailing combinator" is
        // unrepresentable in the AST (head+tail).
        let tree = Tree::parse("<section><div><a>1</a></div><a>2</a></section>");
        let plain = tree.query_selector_all("a");
        let dangling = tree.query_selector_all("a >");
        assert_eq!(dangling.len(), plain.len());
        assert_eq!(*dangling, *plain); // same handles, same document order
                                       // and `matches` agrees element-by-element
        for &h in plain.iter() {
            assert!(tree.matches(h, "a >"));
        }
        // a leading combinator is likewise inert: `> a` == `a`
        assert_eq!(*tree.query_selector_all("> a"), *plain);
    }

    #[test]
    fn adjacent_sibling_combinator() {
        // `a + b`: b must be the element IMMEDIATELY after an `a` sibling. A non-
        // element node (text) between them is skipped (previous_element_sibling).
        let tree =
            Tree::parse("<div><h2>t</h2> <p>after</p><span>x</span><p>not-after-h2</p></div>");
        // the first <p> is the immediate element sibling after <h2> → matches once
        let r = tree.query_selector_all("h2 + p");
        assert_eq!(r.len(), 1);
        assert_eq!(tree.text_content(r[0]), "after");
        // `span + p` → the 2nd <p> immediately follows the <span>
        let r2 = tree.query_selector_all("span + p");
        assert_eq!(r2.len(), 1);
        assert_eq!(tree.text_content(r2[0]), "not-after-h2");
        // no previous element sibling → no match (the <h2> is first)
        assert_eq!(tree.query_selector_all("p + h2").len(), 0);
    }

    #[test]
    fn general_sibling_combinator() {
        // `a ~ b`: b is ANY element preceded (at any distance) by a matching `a`.
        let tree = Tree::parse("<div><span class=mark>m</span><p>1</p><b>x</b><p>2</p></div>");
        // both <p> follow the .mark span → 2 matches
        assert_eq!(tree.query_selector_all(".mark ~ p").len(), 2);
        // a sibling with no preceding .mark → exhausts to false
        let t2 = Tree::parse("<div><p>1</p><span class=mark>m</span></div>");
        assert_eq!(t2.query_selector_all(".mark ~ p").len(), 0);
    }

    #[test]
    fn column_combinator_matches_table_cells_with_spans_and_in_has() {
        let tree = Tree::parse(
            "<table><colgroup><col id=col1><col id=col2 span=2></colgroup>\
             <tbody><tr><td id=a colspan=2>A</td><td id=b>B</td></tr>\
             <tr><td id=c rowspan=2>C</td><td id=d>D</td><td id=e>E</td></tr>\
             <tr><td id=f>F</td><td id=g>G</td></tr></tbody></table>",
        );
        let ids = |selector: &str| {
            let plan = tree.compile_selector(selector).expect("selector compiles");
            let result = plan.select(&tree, None);
            result
                .iter()
                .filter_map(|&node| tree.get_attribute(node, "id"))
                .collect::<Vec<_>>()
        };

        assert_eq!(ids("#col1 || td"), ["a", "c"]);
        assert_eq!(ids("#col2 || td"), ["a", "b", "d", "e", "f", "g"]);
        assert_eq!(ids("td#a || td"), ["c", "d", "f"]);
        assert_eq!(ids("td#a:has(|| td#d)"), ["a"]);
        assert_eq!(ids("td#a:has(|| td#b)"), Vec::<&str>::new());
    }

    #[test]
    fn general_sibling_backtracks() {
        // Mirrors the descendant backtracking case but over PREVIOUS element
        // siblings: `.a ~ .b ~ .c` must try every preceding sibling, not just the
        // nearest. Here .c is preceded by .b which is preceded by .a, but a SECOND
        // .b sits between .a and the first .b with no .a before it directly — the
        // matcher must backtrack across siblings to satisfy the full chain.
        let tree = Tree::parse(
            "<ul>               <li class=a>a</li>               <li class=q>q</li>               <li class=b>b1</li>               <li class=c>c</li>             </ul>",
        );
        // .a ~ .b ~ .c : .c's preceding .b is li.b, whose preceding .a is li.a → 1
        assert_eq!(tree.query_selector_all(".a ~ .b ~ .c").len(), 1);
        // adjacent vs general: `.a + .c` (immediate) does NOT match (q is between)
        assert_eq!(tree.query_selector_all(".a + .c").len(), 0);
        // but `.a ~ .c` does (general sibling, any distance)
        assert_eq!(tree.query_selector_all(".a ~ .c").len(), 1);
    }

    #[test]
    fn pseudo_is_selector_list() {
        let tree = Tree::parse("<div class=a>1</div><div class=b>2</div><div class=c>3</div>");
        // :is(.a, .b) → the .a and .b divs (2), not .c
        assert_eq!(tree.query_selector_all(":is(.a, .b)").len(), 2);
        assert_eq!(tree.query_selector_all(":matches(.a, .b)").len(), 2);
        // single-item list is the degenerate case
        assert_eq!(tree.query_selector_all(":is(.c)").len(), 1);
        // :is matching nothing
        assert_eq!(tree.query_selector_all(":is(.nope)").len(), 0);
    }

    #[test]
    fn pseudo_is_with_combinator_and_descendant_arg() {
        // div:is(.x) anchors the :is list at the element; combine with a descendant.
        let tree = Tree::parse(
            "<div class=x><span class=y>hit</span></div>             <div class=z><span class=y>miss</span></div>",
        );
        // div:is(.x) .y → only the .y inside the div.x
        let r = tree.query_selector_all("div:is(.x) .y");
        assert_eq!(r.len(), 1);
        assert_eq!(tree.text_content(r[0]), "hit");
        // :is() argument may itself be a complex selector (descendant)
        let t2 = Tree::parse("<section><p class=t>a</p></section><p class=t>b</p>");
        // :is(section .t, .nope) → only the .t inside the section
        let r2 = t2.query_selector_all(":is(section .t, .nope)");
        assert_eq!(r2.len(), 1);
        assert_eq!(t2.text_content(r2[0]), "a");
    }

    #[test]
    fn pseudo_where_matches_like_is() {
        let tree = Tree::parse("<i class=a>1</i><i class=b>2</i><i>3</i>");
        // :where(.a,.b) matches identically to :is (specificity aside)
        assert_eq!(tree.query_selector_all(":where(.a,.b)").len(), 2);
        assert_eq!(tree.query_selector_all("i:where(.a)").len(), 1);
    }

    #[test]
    fn pseudo_not_selector_list() {
        let tree = Tree::parse("<ul><li class=a>1</li><li class=b>2</li><li class=c>3</li></ul>");
        // :not(.a, .b) → only the .c li survives
        let r = tree.query_selector_all("li:not(.a, .b)");
        assert_eq!(r.len(), 1);
        assert_eq!(tree.text_content(r[0]), "3");
        // :not(div, span) on a tag list — none of these <li> are div or span → all 3
        assert_eq!(tree.query_selector_all("li:not(div, span)").len(), 3);
        // :not(li, .c) → li that is neither (none) → 0
        assert_eq!(tree.query_selector_all("li:not(li, .c)").len(), 0);
    }

    #[test]
    fn pseudo_has_descendant() {
        let tree = Tree::parse(
            "<div id=hit><span class=x>y</span></div><div id=miss><span>z</span></div>",
        );
        // div:has(.x) → only the div containing a .x descendant
        let r = tree.query_selector_all("div:has(.x)");
        assert_eq!(r.len(), 1);
        assert_eq!(tree.get_attribute(r[0], "id"), Some("hit"));
        // negative: nothing has a .absent descendant
        assert_eq!(tree.query_selector_all("div:has(.absent)").len(), 0);
    }

    #[test]
    fn custom_bulk_has_planner_receives_candidate_counts() {
        fn forward(features: crate::HasFeatures) -> crate::HasRoute {
            assert_eq!(features.relationship, crate::HasRelationship::Child);
            assert_eq!(features.anchors, 2);
            assert_eq!(features.witnesses, 1);
            assert!(!features.sibling_anchors);
            crate::HasRoute::Forward
        }
        let mut tree = Tree::parse(
            "<main><div class=anchor><span class=witness></span></div>\
             <section><div class=anchor></div></section></main>",
        );
        let plan = tree.compile_selector(".anchor:has(> .witness)").unwrap();
        let expected = plan.select(&tree, None);
        assert_eq!(expected.len(), 1);
        tree.set_bulk_has_planner(Some(forward));
        assert_eq!(plan.select(&tree, None), expected);
        tree.set_bulk_has_planner(None);
        assert_eq!(plan.select(&tree, None), expected);
    }

    #[test]
    fn host_route_model_admission_tracks_supported_class_attribute_features() {
        for (selector, expected_mask) in [
            (".anchor[data-ok='1']:has(.witness)", 2),
            (".anchor:has(.witness[data-ok='1'])", 1),
            (".anchor[data-ok='1']:has(.witness[data-ok='1'])", 3),
            (".anchor:has(.witness)", 0),
        ] {
            let plan = parse_selector_list_str(selector);
            assert_eq!(plan.len(), 1, "{selector}: {plan:?}");
            let (_, _, _, attributes, dense_inverse) =
                class_has_parts(&plan).unwrap_or_else(|| panic!("{selector}: {plan:#?}"));
            assert_eq!(attributes, expected_mask, "{selector}");
            assert_eq!(dense_inverse, expected_mask == 0, "{selector}");
        }
        for selector in [
            ".anchor[data-ok=2]:has(.witness)",
            ".anchor[data-other=1]:has(.witness)",
            ".anchor[data-ok='1' i]:has(.witness)",
        ] {
            assert!(
                class_has_parts(&parse_selector_list_str(selector)).is_none(),
                "{selector}"
            );
        }
    }

    #[test]
    fn pseudo_has_child_combinator() {
        let tree = Tree::parse(
            "<ul id=a><li class=active>1</li></ul>             <ul id=b><li>2</li></ul>             <ul id=c><div><li class=active>deep</li></div></ul>",
        );
        // ul:has(> li.active) → only the ul with a DIRECT li.active child (a).
        // c has an li.active but it is a grandchild → must NOT match.
        let r = tree.query_selector_all("ul:has(> li.active)");
        assert_eq!(r.len(), 1);
        assert_eq!(tree.get_attribute(r[0], "id"), Some("a"));
        // descendant form (no `>`) DOES reach the grandchild → a and c match
        assert_eq!(tree.query_selector_all("ul:has(li.active)").len(), 2);
    }

    #[test]
    fn pseudo_has_adjacent_sibling() {
        let tree = Tree::parse(
            "<section><h2 id=p>t</h2><p>para</p></section>             <section><h2 id=q>t2</h2><div>not-p</div></section>",
        );
        // h2:has(+ p) → only the h2 immediately followed by a <p> (the first one)
        let r = tree.query_selector_all("h2:has(+ p)");
        assert_eq!(r.len(), 1);
        assert_eq!(tree.get_attribute(r[0], "id"), Some("p"));
    }

    #[test]
    fn pseudo_has_multi_compound_scoped() {
        // :has(.a .b) — a multi-compound relative complex. The match must be
        // CONFINED to the scope element's subtree: `.a` and `.b` both inside it.
        let tree = Tree::parse(
            "<section id=in><div class=a><span class=b>hit</span></div></section>             <section id=out><span class=b>noA</span></section>             <div class=a><section id=split><span class=b>aOutside</span></section></div>",
        );
        let r = tree.query_selector_all("section:has(.a .b)");
        // `in` matches (.a and .b both inside). `out` has no .a. `split` has a .b
        // but its only .a ancestor is OUTSIDE the section → scope cap rejects it.
        assert_eq!(r.len(), 1);
        assert_eq!(tree.get_attribute(r[0], "id"), Some("in"));
    }

    #[test]
    fn pseudo_has_general_sibling_and_list() {
        let tree = Tree::parse(
            "<div><h3 id=a>x</h3><span>s</span><p>after</p></div>             <div><h3 id=b>y</h3><span>only</span></div>",
        );
        // h3:has(~ p) → an h3 with SOME following sibling <p> (a, not b)
        let r = tree.query_selector_all("h3:has(~ p)");
        assert_eq!(r.len(), 1);
        assert_eq!(tree.get_attribute(r[0], "id"), Some("a"));
        // a comma list of relative selectors: matches if ANY relative matches
        assert_eq!(tree.query_selector_all("h3:has(~ p, ~ .none)").len(), 1);
        // empty :has() never matches
        assert_eq!(tree.query_selector_all("div:has()").len(), 0);
    }

    #[test]
    fn pseudo_has_relative_complex_combinators() {
        // The relative complex inside :has() may itself contain combinators —
        // exercises the scoped matcher's Child/Adjacent/GeneralSibling arms.
        let tree = Tree::parse(
            "<section id=s1><div class=a><span class=b>x</span></div></section>             <section id=s2><div class=a></div><span class=b>y</span></section>             <section id=s3><div class=a></div><i>z</i><span class=b>w</span></section>",
        );
        // child combinator in the relative complex → s1 only
        let gt = tree.query_selector_all("section:has(.a > .b)");
        assert_eq!(gt.len(), 1);
        assert_eq!(tree.get_attribute(gt[0], "id"), Some("s1"));
        // adjacent → s2 only
        let plus = tree.query_selector_all("section:has(.a + .b)");
        assert_eq!(plus.len(), 1);
        assert_eq!(tree.get_attribute(plus[0], "id"), Some("s2"));
        // general sibling → s2 and s3
        assert_eq!(tree.query_selector_all("section:has(.a ~ .b)").len(), 2);
    }

    #[test]
    fn pseudo_has_ancestor_walk_iterates_within_scope() {
        // `.b` nested two levels under `.a` with a non-`.a` wrapper between → the
        // scoped descendant ancestor walk must skip the wrapper and keep ascending
        // (but never reach/pass the scope element).
        let tree = Tree::parse(
            "<section id=hit><div class=a><div class=wrap><span class=b>x</span></div></div></section>             <section id=miss><div class=wrap><span class=b>y</span></div></section>",
        );
        let r = tree.query_selector_all("section:has(.a .b)");
        assert_eq!(r.len(), 1);
        assert_eq!(tree.get_attribute(r[0], "id"), Some("hit"));
    }

    #[test]
    fn pseudo_has_leading_combinator_binds_head_not_whole_complex() {
        // Regression: a leading combinator constrains the HEAD compound of the relative
        // complex, not the whole thing. Anchoring the entire complex at a child/sibling
        // candidate made `> .a .b` / `> .a > .b` return 0.
        let tree = Tree::parse(
            "<div id=u><span class=a><span class=b>hit</span></span></div>             <div id=v><div><span class=a><span class=b>deep</span></span></div></div>",
        );
        // u: `.a` is a DIRECT child, `.b` a descendant of it → match
        assert_eq!(tree.query_selector_all("#u:has(> .a .b)").len(), 1);
        assert_eq!(tree.query_selector_all("#u:has(> .a > .b)").len(), 1);
        // v: `.a` is a grandchild, so `> .a …` must NOT match, but descendant form does
        assert_eq!(tree.query_selector_all("#v:has(> .a .b)").len(), 0);
        assert_eq!(tree.query_selector_all("#v:has(.a .b)").len(), 1);
    }

    #[test]
    fn pseudo_has_sibling_combinator_binds_head_multi_compound() {
        let tree = Tree::parse(
            "<h2 id=h>t</h2><div class=s><span class=x>hit</span></div>             <p id=p>t</p><em>z</em><div class=s2><span class=x>y</span></div>",
        );
        // head bound to the subject's next / following sibling, then a descendant tail
        assert_eq!(tree.query_selector_all("#h:has(+ div .x)").len(), 1);
        assert_eq!(tree.query_selector_all("#h:has(~ div .x)").len(), 1);
        // #p's IMMEDIATE next sibling is <em>, not the div → `+` fails, `~` succeeds
        assert_eq!(tree.query_selector_all("#p:has(+ div .x)").len(), 0);
        assert_eq!(tree.query_selector_all("#p:has(~ div .x)").len(), 1);
    }

    #[test]
    fn form_state_pseudos_read_live_property_over_attribute() {
        use super::super::tree::FormProp;
        let mut tree = Tree::parse(
            "<input id=a type=checkbox><input id=b type=checkbox checked><select id=s><option id=o>x</option></select>",
        );
        let a = tree.query_selector("#a").unwrap();
        let b = tree.query_selector("#b").unwrap();
        let o = tree.query_selector("#o").unwrap();
        // baseline: attribute-driven (parity with the pre-existing behavior)
        assert_eq!(tree.query_selector_all(":checked").len(), 1); // only #b (attr)
                                                                  // set the live property on #a WITHOUT the attribute → now matches (like React)
        tree.set_form_property(a, FormProp::Checked, true);
        assert!(tree.matches(a, ":checked"));
        assert_eq!(tree.query_selector_all("input:checked").len(), 2); // #a (prop) + #b (attr)
                                                                       // live property overrides an attribute the other way: #b unchecked despite attr
        tree.set_form_property(b, FormProp::Checked, false);
        assert!(!tree.matches(b, ":checked"));
        // clearing reverts to the attribute
        tree.clear_form_property(b, FormProp::Checked);
        assert!(tree.matches(b, ":checked"));
        // clearing an unset property is a no-op (doesn't bump / panic)
        let v = tree.version;
        tree.clear_form_property(b, FormProp::ReadOnly);
        assert_eq!(tree.version, v);
        // option :selected / :checked via the live selected property
        assert!(!tree.matches(o, ":checked"));
        tree.set_form_property(o, FormProp::Selected, true);
        assert!(tree.matches(o, ":checked")); // option → reads Selected
        assert!(tree.matches(o, ":selected"));
        // disabled / required / read-only likewise honor the live property
        assert!(!tree.matches(a, ":disabled"));
        tree.set_form_property(a, FormProp::Disabled, true);
        assert!(tree.matches(a, ":disabled"));
        assert!(!tree.matches(a, ":enabled"));
    }

    #[test]
    fn checked_query_rejects_malformed_selectors_like_the_js_runtime() {
        use super::super::query::SelectorError;
        let tree = Tree::parse("<div class=a><span id=s>x</span></div>");
        // valid selectors go through unchanged and return the same as the lenient path
        assert_eq!(tree.query_selector_all_checked(".a span").unwrap().len(), 1);
        assert_eq!(
            tree.query_selector_checked("#s").unwrap(),
            tree.query_selector("#s")
        );
        let s = tree.query_selector("#s").unwrap();
        assert!(tree.matches_checked(s, "span#s").unwrap());
        // malformed selectors are rejected with the same taxonomy the JS side throws on
        assert_eq!(
            tree.query_selector_all_checked(">"),
            Err(SelectorError::EmptyCompound) // leading combinator
        );
        assert_eq!(
            tree.query_selector_all_checked("a > > b"),
            Err(SelectorError::EmptyCompound) // doubled combinator
        );
        assert_eq!(
            tree.query_selector_all_checked("a + > b"),
            Err(SelectorError::EmptyCompound) // mixed combinator
        );
        assert_eq!(
            tree.query_selector_all_checked("div!p"),
            Err(SelectorError::UnexpectedChar('!'))
        );
        // the end of a DOM-API selector closes an open `[` (Chrome 156; turbo-dom#91) ...
        assert_eq!(
            tree.query_selector_all_checked("[href").map(|l| l.len()),
            Ok(0)
        );
        assert_eq!(tree.query_selector_checked("[href"), Ok(None));
        // ... while a stylesheet prelude never ends inside one
        assert_eq!(
            super::parse_for_cascade("[href").map(|_| ()),
            Err(SelectorError::UnterminatedAttribute)
        );
        assert!(tree.matches_checked(s, ">").is_err());
        // P5b (turbo-dom#18): Chrome 156 throws on empty lists and items and on a trailing
        // combinator (the lenient path still drops them)
        for bad in ["", " ", ",", "a,,span", "span >", "p,"] {
            assert!(tree.query_selector_all_checked(bad).is_err(), "{bad:?}");
        }
        assert_eq!(tree.query_selector_all("a,,span").len(), 1);
        assert_eq!(tree.query_selector_all("span >").len(), 1);
        // ... a type selector after another simple selector, a non-identifier name, a
        // simple selector after a pseudo-element, a bad An+B, a wrong pseudo arity
        assert_eq!(
            tree.query_selector_all_checked("[a]div"),
            Err(SelectorError::Invalid(
                "type selector after another simple selector"
            ))
        );
        assert_eq!(
            tree.query_selector_all_checked("::before.x"),
            Err(SelectorError::Invalid(
                "simple selector after a pseudo-element"
            ))
        );
        for (bad, c) in [
            ("#1a", '#'),
            (".1a", '.'),
            (".-1", '.'),
            ("p..x", '.'),
            ("p:", ':'),
            ("::", ':'),
        ] {
            assert_eq!(
                tree.query_selector_all_checked(bad),
                Err(SelectorError::UnexpectedChar(c)),
                "{bad}"
            );
        }
        for bad in [
            "p:nth-child(foo)",
            ":nth-child",
            ":nth-of-type(1 of p)",
            ":first-child(1)",
            ":is",
            ":bogus",
            "option:selected",
            "a\\:b:hover:x",
        ] {
            assert!(tree.query_selector_all_checked(bad).is_err(), "{bad}");
        }
        for ok in [
            ".--a",
            "#-a",
            "_p",
            "-p",
            "\\31 23",
            ":nth-child(2n - 1)",
            "::before",
            "P:FIRST-CHILD",
        ] {
            assert!(tree.query_selector_all_checked(ok).is_ok(), "{ok}");
        }
        // Display renders a human message
        assert_eq!(
            SelectorError::UnexpectedChar('!').to_string(),
            "unexpected '!' in selector"
        );
        assert_eq!(
            SelectorError::EmptyCompound.to_string(),
            "empty compound (stray combinator)"
        );
        assert_eq!(
            SelectorError::UnterminatedAttribute.to_string(),
            "unterminated attribute selector"
        );
    }

    #[test]
    fn pseudo_lang_in_the_dom_apis() {
        let mut tree = Tree::parse(
            "<div lang=zh-Hant-TW><p id=a></p><i lang='' id=e></i></div>\
             <svg lang=fr><g id=g></g></svg><p lang=zh-x-TW id=x></p>",
        );
        let a = tree.get_element_by_id("a").unwrap();
        let empty = tree.get_element_by_id("e").unwrap();
        let foreign = tree.get_element_by_id("g").unwrap();
        let private_use = tree.get_element_by_id("x").unwrap();
        assert!(tree.matches(a, ":lang(en, 'zh-TW')"));
        assert!(tree.matches(a, ":lang('zh-*-TW')"));
        assert!(tree.matches_units(a, &":lang(\\*-TW)".encode_utf16().collect::<Vec<_>>()));
        assert!(tree.matches(empty, ":lang('')"));
        assert!(!tree.matches(empty, ":lang('zh')"));
        assert!(!tree.matches(foreign, ":lang(fr)"));
        assert!(!tree.matches(private_use, ":lang(zh-TW)"));

        let host = tree.get_element_by_id("a").unwrap();
        let shadow = tree.attach_shadow(host);
        let child = tree.create_element("span");
        tree.append_child(shadow, child);
        assert!(tree.matches(child, ":lang(zh-TW)"));
        for invalid in [":lang()", ":lang", ":lang(1)", ":lang(en x)", ":lang(en,)"] {
            assert!(tree.matches_checked(a, invalid).is_err(), "{invalid}");
        }
    }

    /// turbo-dom#18 (P5b): `:defined` in the DOM APIs (Chrome 156, parsed document).
    #[test]
    fn pseudo_defined_in_the_dom_apis() {
        let tree = Tree::parse(
            "<x-foo id=c></x-foo><button is=x-b id=b></button><p is id=p></p><div id=d></div>\
             <svg><x-bar id=s></x-bar></svg>",
        );
        let el = |id: &str| tree.get_element_by_id(id).unwrap();
        for (id, defined) in [
            ("c", false),
            ("b", false),
            ("p", false),
            ("d", true),
            ("s", true),
        ] {
            assert_eq!(tree.matches(el(id), ":defined"), defined, "{id}");
            assert_eq!(tree.matches(el(id), ":not(:defined)"), !defined, "{id}");
        }
        assert!(tree.matches_checked(el("d"), ":defined()").is_err());
        assert!(!tree.matches(el("d"), ":defined(x)"));
    }

    /// turbo-dom#18 (P5b): attribute selectors follow Chrome's grammar — `[*|a]` is any
    /// namespace, `[|a]` none, undeclared prefixes / non-identifier names and unquoted
    /// values are invalid — and `:has()` does not nest.
    #[test]
    fn attribute_grammar_and_nested_has() {
        let tree = Tree::parse("<svg><a id=x xlink:href='#y'></a></svg><p id=p data-n=v>p</p>");
        let x = tree.get_element_by_id("x").unwrap();
        let p = tree.get_element_by_id("p").unwrap();
        assert!(tree.matches(x, "[*|href]"));
        assert!(tree.matches(x, "[*|href='#y']"));
        assert!(tree.matches(x, "[*|href^='#' i]"));
        assert!(!tree.matches(x, "[|href]") && !tree.matches(x, "[href]"));
        assert!(tree.matches(p, "[|data-n=v]") && tree.matches(p, "[*|data-n|=v]"));
        for bad in [
            "[ns|a]",
            "[1a]",
            "[a=1]",
            "[a=]",
            "[href=a.html]",
            "[|=v]",
            "[a=b c]",
            ":has(:has(p))",
            "p:has(> :not(:has(a)))",
        ] {
            assert!(tree.matches_checked(p, bad).is_err(), "{bad}");
            assert!(!tree.matches(p, bad), "{bad}");
        }
        assert!(tree.matches_checked(p, ":not(:has(a))").unwrap());
        // a forgiving :is() drops its items that contain :has() (Chrome)
        assert!(!tree.matches_checked(p, ":has(:is(:has(p)))").unwrap());
        assert!(tree
            .matches_checked(tree.query_selector("svg").unwrap(), ":has(:is(a, :has(p)))")
            .unwrap());
        assert!(tree.matches_checked(p, "[data-n=\\76]").unwrap());
    }

    /// `<an+b>` grammar edges (CSS Syntax 3 §6; Chrome 156 cases in the malformed control).
    #[test]
    fn an_plus_b_validity() {
        for ok in [
            "odd", " EVEN ", "5", "+5", "-5", "n", "+n", "-n", "2n", "2N+1", "2n + 1", "2n- 1",
            "2n -1", " -n+3 ", "-2n+ 0", "\t3n\n",
        ] {
            assert!(super::valid_anb(ok), "{ok:?}");
        }
        for bad in [
            "", " ", "foo", "+", "-", "n-", "2n+", "+ 2n", "- n+1", "2 n", "2.5n", "1 of", "2n+-1",
            "2n + +1", "n1", "2n 1", "--n", "1e1",
        ] {
            assert!(!super::valid_anb(bad), "{bad:?}");
        }
        // the lenient path never matches an invalid argument (it used to read `(0, 0)`)
        let tree = Tree::parse("<p>a</p><p>b</p>");
        assert_eq!(tree.query_selector_all("p:nth-child(foo)").len(), 0);
        assert_eq!(tree.query_selector_all("p:nth-of-type(1 of p)").len(), 0);
        assert_eq!(tree.query_selector_all("p:first-child(1)").len(), 0);
        assert_eq!(tree.query_selector_all("p:nth-last-child(n)").len(), 2);
        let units: Vec<u16> = ":nth-child(2n+ of p)".encode_utf16().collect();
        assert_eq!(tree.query_selector_all_units(&units).len(), 0);
    }

    #[test]
    fn s3a_selector_fixes_edge_cases() {
        // Edges of the S3a Chrome fixes not reached by the Chrome control
        // (tests/cascade_selectors_chrome.rs covers the main cases).
        use super::super::query::SelectorError;
        let mut tree = Tree::parse(
            "<div class='md:flex'><p>x</p></div>\
             <div contenteditable=bogus><span id=inherit>x</span></div>\
             <div contenteditable><div contenteditable=bogus><i id=deep>x</i></div></div>",
        );
        let root = tree.root();
        // strict lexer: escapes (CRLF after a hex escape, `\` at the very end), a `\` +
        // newline is not an escape, namespace prefixes
        assert!(tree.query_selector_all_checked(".md\\3a\r\nflex").is_ok());
        assert!(tree.query_selector_all_checked(".a\\").is_ok());
        assert_eq!(
            tree.query_selector_all_checked(".a\\\nb"),
            Err(SelectorError::UnexpectedChar('\\'))
        );
        for ok in ["*|*", "*|p", "|p", "a |p", "\\70", "\\@x"] {
            assert!(tree.query_selector_all_checked(ok).is_ok(), "{ok}");
        }
        for bad in ["*|", "*|.x", "a|p", ".x|p", "[a]|p", "|"] {
            assert_eq!(
                tree.query_selector_all_checked(bad),
                Err(SelectorError::UnexpectedChar('|')),
                "{bad}"
            );
        }
        // lenient namespace forms: `p|` and undeclared prefixes never match, `*|*` is `*`
        assert_eq!(tree.query_selector_all("p|").len(), 0);
        assert_eq!(tree.query_selector_all("x|p").len(), 0);
        assert_eq!(
            *tree.query_selector_all("*|*"),
            *tree.query_selector_all("*")
        );
        assert_eq!(
            tree.query_selector_all_units(&"p|".encode_utf16().collect::<Vec<_>>())
                .len(),
            0
        );
        assert_eq!(
            tree.query_selector_all_units(&"x|p".encode_utf16().collect::<Vec<_>>())
                .len(),
            0
        );
        // an escaped bar is part of the type name, not a namespace separator
        let escaped_bar: Vec<u16> = "p\\|x".encode_utf16().collect();
        assert_eq!(tree.query_selector_all_units(&escaped_bar).len(), 0);
        assert_eq!(tree.query_selector_all("p\\|x").len(), 0);
        // `|p`: only elements with no namespace
        let bare = tree.create_element_namespace(None, "p");
        tree.append_child(root, bare);
        assert!(tree.matches(bare, "|p") && tree.matches(bare, "*|p"));
        let html_p = tree.query_selector("div > p").unwrap();
        assert!(!tree.matches(html_p, "|p") && tree.matches(html_p, "*|p"));
        // Foreign namespace elements are read-only, but never read-write.
        assert!(tree.matches(bare, ":read-only") && !tree.matches(bare, ":read-write"));
        // :empty: an empty text node and a processing instruction don't count
        let host = tree.create_element("div");
        tree.append_child(root, host);
        let empty_text = tree.create_text_node("");
        tree.append_child(host, empty_text);
        let pi = tree.create_processing_instruction_utf16("x", &[]);
        tree.append_child(host, pi);
        assert!(tree.matches(host, ":empty"));
        let text = tree.create_text_node(" ");
        tree.append_child(host, text);
        assert!(!tree.matches(host, ":empty"));
        // contenteditable: an invalid value inherits (no editable ancestor / an editable one)
        let inherit = tree.get_element_by_id("inherit").unwrap();
        assert!(tree.matches(inherit, ":read-only"));
        let deep = tree.get_element_by_id("deep").unwrap();
        assert!(tree.matches(deep, ":read-write"));
        // `of` needs whitespace before it and no name code point after it
        let list = Tree::parse("<ul><li class=x>1</li><li class=x>2</li></ul>");
        assert_eq!(list.query_selector_all(":nth-child(2 of .x)").len(), 1);
        assert_eq!(list.query_selector_all(":nth-child(2of .x)").len(), 0);
        assert_eq!(list.query_selector_all(":nth-child(2 ofx)").len(), 0);
        assert_eq!(list.query_selector_all(":nth-child(2 of)").len(), 0);
        let units: Vec<u16> = ":nth-last-child(1 of .x)".encode_utf16().collect();
        assert_eq!(list.query_selector_all_units(&units).len(), 1);
    }

    #[test]
    fn attr_selector_unterminated_quote_does_not_panic() {
        // Regression: a lone quote char as the attribute value (unterminated `[a="`)
        // used to panic in parse_attr via `val[1..0]`. Must degrade gracefully.
        let tree = Tree::parse("<div a=\"\"></div><div a=x></div>");
        // no panic; the queries simply return without crashing the process
        let _ = tree.query_selector_all("div[a=\"");
        let _ = tree.query_selector_all("div[a='");
        let _ = tree.query_selector_all("div[a=\"\"]");
    }
}
