//! CSS Syntax preprocessing of selector source text (miaskiewicz/turbo-dom#91), shared by
//! the string and UTF-16 selector parsers so neither needs its own comment handling:
//!
//! - **comments** (`/* … */`, outside strings and escapes) are removed: CSS tokenizes
//!   them away. A comment between two name characters still separates two tokens
//!   (`div/**/p` is `div` then `p`, a `SyntaxError`; `[title=a/**/i]` is
//!   `[title=a i]`), so there it becomes a space inside an attribute selector and the
//!   never-valid `!` anywhere else. Inside an `:nth-child()` argument, a comment that
//!   separates the `An+B` expression from `of` becomes whitespace. An unterminated
//!   comment runs to the end.
//! - **end of input** (DOM selector APIs only, [`Mode::Dom`]): an unterminated string
//!   and every open `[` / `(` are closed, as CSS closes them at EOF (`[title`,
//!   `:is(p`, `[title="a` are valid). A stylesheet prelude is never cut at EOF, so the
//!   cascade path ([`Mode::Sheet`]) only removes comments.
//!
//! Generic over code units: `char` for the string API, `u16` for the UTF-16 API.

/// Which grammar entry the source feeds.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Mode {
    /// `querySelector` / `matches`: comments, then EOF closing.
    Dom,
    /// A stylesheet prelude or `selector()` condition: comments only.
    Sheet,
}

/// One code unit of selector source.
pub(super) trait Unit: Copy {
    fn code(self) -> u32;
    fn ascii(byte: u8) -> Self;
    /// U+FFFD.
    fn replacement() -> Self;
}
impl Unit for char {
    fn code(self) -> u32 {
        self as u32
    }
    fn ascii(byte: u8) -> Self {
        char::from(byte)
    }
    fn replacement() -> Self {
        '\u{fffd}'
    }
}
impl Unit for u16 {
    fn code(self) -> u32 {
        u32::from(self)
    }
    fn ascii(byte: u8) -> Self {
        u16::from(byte)
    }
    fn replacement() -> Self {
        0xfffd
    }
}

/// A code point that continues a name (identifier, hash, number) on either side of a
/// comment: ASCII letters and digits, `-`, `_`, `\` (an escape) and every non-ASCII.
fn name_like(code: u32) -> bool {
    code >= 0x80
        || code == u32::from(b'-')
        || code == u32::from(b'_')
        || code == u32::from(b'\\')
        || char::from_u32(code).is_some_and(|c| c.is_ascii_alphanumeric())
}

/// The preprocessed source, or `None` when it is already in that form (the common case:
/// no comment, nothing open at the end).
pub(super) fn normalize<T: Unit>(source: &[T], mode: Mode) -> Option<Vec<T>> {
    let unit = |i: usize| source.get(i).map(|&u| u.code());
    let is = |i: usize, b: u8| unit(i) == Some(u32::from(b));
    let mut out = Vec::with_capacity(source.len());
    let mut open: Vec<u8> = Vec::new();
    let mut quote: Option<u32> = None;
    let mut changed = false;
    let mut i = 0;
    while i < source.len() {
        let code = source[i].code();
        if code == u32::from(b'\\') {
            if handle_normalize_escape(source, &mut i, &mut out, mode, quote, &mut changed) {
                break;
            }
            continue;
        }
        if normalize_consume(
            source,
            &mut i,
            &mut out,
            &mut open,
            &mut quote,
            &mut changed,
            is,
        ) {
            continue;
        }
        out.push(source[i]);
        i += 1;
    }
    if mode == Mode::Dom {
        if let Some(q) = quote {
            out.push(T::ascii(if q == u32::from(b'"') { b'"' } else { b'\'' }));
            changed = true;
        }
        while let Some(close) = open.pop() {
            out.push(T::ascii(close));
            changed = true;
        }
    }
    changed.then_some(out)
}

fn normalize_bracket(code: u32, open: &mut Vec<u8>) {
    if code == u32::from(b'[') {
        open.push(b']');
    } else if code == u32::from(b'(') {
        open.push(b')');
    } else if open.last().is_some_and(|&close| code == u32::from(close)) {
        open.pop();
    }
}

/// Classify the current character into a bracket/quote/comment update.
/// Returns true when the caller should `continue` (comment skip).
fn normalize_consume<T: Unit, F: Fn(usize, u8) -> bool>(
    source: &[T],
    i: &mut usize,
    out: &mut Vec<T>,
    open: &mut Vec<u8>,
    quote: &mut Option<u32>,
    changed: &mut bool,
    is: F,
) -> bool {
    let code = source[*i].code();
    if let Some(q) = *quote {
        if code == q {
            *quote = None;
        }
    } else if code == u32::from(b'"') || code == u32::from(b'\'') {
        *quote = Some(code);
    } else if code == u32::from(b'/') && is(*i + 1, b'*') {
        skip_comment(source, i, out, open, changed);
        return true;
    } else {
        normalize_bracket(code, open);
    }
    false
}

/// Returns true when the outer loop should break (end-of-input escape).
fn handle_normalize_escape<T: Unit>(
    source: &[T],
    i: &mut usize,
    out: &mut Vec<T>,
    mode: Mode,
    quote: Option<u32>,
    changed: &mut bool,
) -> bool {
    if *i + 1 == source.len() && mode == Mode::Dom {
        if quote.is_none() {
            out.push(T::replacement());
        }
        *changed = true;
        return true;
    }
    let end = (*i + 2).min(source.len());
    out.extend_from_slice(&source[*i..end]);
    *i = end;
    false
}

fn skip_comment<T: Unit>(
    source: &[T],
    i: &mut usize,
    out: &mut Vec<T>,
    open: &[u8],
    changed: &mut bool,
) {
    let is = |p: usize, b: u8| source.get(p).map(|u| u.code()) == Some(u32::from(b));
    *changed = true;
    let mut end = *i + 2;
    while end < source.len() && !(is(end, b'*') && is(end + 1, b'/')) {
        end += 1;
    }
    let after = (end + 2).min(source.len());
    let joins = out
        .last()
        .is_some_and(|prev: &T| name_like(prev.code()) || prev.code() == u32::from(b'#'))
        && source.get(after).map(|u| u.code()).is_some_and(name_like);
    if joins {
        out.push(T::ascii(
            if open.last() == Some(&b']') || in_nth_argument(out) {
                b' '
            } else {
                b'!'
            },
        ));
    }
    *i = after;
}

fn in_nth_argument<T: Unit>(out: &[T]) -> bool {
    let Some(open) = out.iter().rposition(|unit| unit.code() == u32::from(b'(')) else {
        return false;
    };
    let prefix = &out[..open];
    [":nth-child", ":nth-last-child"].into_iter().any(|name| {
        prefix.len() >= name.len()
            && prefix[prefix.len() - name.len()..]
                .iter()
                .zip(name.bytes())
                .all(|(unit, byte)| {
                    unit.code() == u32::from(byte.to_ascii_lowercase())
                        || unit.code() == u32::from(byte.to_ascii_uppercase())
                })
    })
}

/// [`normalize`] for the string API, borrowing when nothing changes.
pub(super) fn normalize_str(source: &str, mode: Mode) -> std::borrow::Cow<'_, str> {
    if !source.contains("/*")
        && (mode == Mode::Sheet || !source.contains(['[', '(', '"', '\'', '\\']))
    {
        return std::borrow::Cow::Borrowed(source);
    }
    let chars: Vec<char> = source.chars().collect();
    normalize(&chars, mode).map_or(std::borrow::Cow::Borrowed(source), |out| {
        std::borrow::Cow::Owned(out.into_iter().collect())
    })
}

#[cfg(test)]
mod tests {
    use super::{normalize, normalize_str, Mode};

    fn dom(s: &str) -> String {
        normalize_str(s, Mode::Dom).into_owned()
    }
    fn sheet(s: &str) -> String {
        normalize_str(s, Mode::Sheet).into_owned()
    }

    #[test]
    fn comments_are_removed_between_tokens() {
        assert_eq!(dom("p/**/.a"), "p.a");
        assert_eq!(dom("p /* c */ .a"), "p  .a");
        assert_eq!(dom("/* c */p"), "p");
        assert_eq!(dom(".d/*x*/>p"), ".d>p");
        assert_eq!(dom("p,/*c*/span"), "p,span");
        assert_eq!(dom("p:/**/first-child"), "p:first-child");
        assert_eq!(dom("./**/a"), ".a");
        assert_eq!(dom("[title/**/=a]"), "[title=a]");
        assert_eq!(dom("[title=/**/a]"), "[title=a]");
    }

    #[test]
    fn a_comment_between_names_still_separates_them() {
        assert_eq!(dom("div/**/p"), "div!p");
        assert_eq!(dom("#a/**/-b"), "#a!-b");
        assert_eq!(dom("p\u{e9}/**/\u{e9}"), "p\u{e9}!\u{e9}");
        assert_eq!(dom("a_/**/_b"), "a_!_b");
        assert_eq!(dom("#/**/x"), "#!x");
        assert_eq!(dom("#/**/.x"), "#.x");
        assert_eq!(dom("a\\31/**/\\32"), "a\\31!\\32");
        assert_eq!(dom("[ti/**/tle]"), "[ti tle]");
        assert_eq!(dom("[title=a/**/i]"), "[title=a i]");
        assert_eq!(dom(":is([a=b/**/c], d/**/e)"), ":is([a=b c], d!e)");
        // only name characters on both sides join
        assert_eq!(dom("a/**/,b"), "a,b");
        assert_eq!(dom("a,/**/b"), "a,b");
        assert_eq!(
            dom("p:nth-child(odd/**/of .item)"),
            "p:nth-child(odd of .item)"
        );
        assert_eq!(
            dom("p:nth-child(odd/**/of/**/.item)"),
            "p:nth-child(odd of.item)"
        );
        assert_eq!(dom("/**/"), "");
    }

    #[test]
    fn unterminated_comments_run_to_the_end() {
        assert_eq!(dom("p/*"), "p");
        assert_eq!(dom("p /* c"), "p ");
        assert_eq!(dom("p/* c *"), "p");
        assert_eq!(dom("[title/* c"), "[title]");
        assert_eq!(sheet("p /* c"), "p ");
    }

    #[test]
    fn strings_and_escapes_keep_comment_text() {
        assert_eq!(dom("[title=\"a/**/b\"]"), "[title=\"a/**/b\"]");
        assert_eq!(dom("[title='a/**/b']"), "[title='a/**/b']");
        assert_eq!(dom("[title=\"it's\"]"), "[title=\"it's\"]");
        assert_eq!(dom("p\\/**/"), "p\\/**/");
        assert_eq!(dom("[title=\"a\\\"/**/\"]"), "[title=\"a\\\"/**/\"]");
        assert_eq!(dom("p\\"), "p\u{fffd}");
        assert_eq!(dom("[id=x\\"), "[id=x\u{fffd}]");
        assert_eq!(dom("[id=\"x\\"), "[id=\"x\"]");
        assert_eq!(sheet("p\\"), "p\\");
    }

    #[test]
    fn dom_mode_closes_strings_and_blocks_at_the_end() {
        assert_eq!(dom("[title"), "[title]");
        assert_eq!(dom("[title=\"a"), "[title=\"a\"]");
        assert_eq!(dom("[title='a"), "[title='a']");
        assert_eq!(dom(":is(p, :where(span"), ":is(p, :where(span))");
        assert_eq!(dom(":is([a"), ":is([a])");
        assert_eq!(dom(":state(x"), ":state(x)");
        assert_eq!(dom("[a=\"(\""), "[a=\"(\"]");
        // a stray closer closes nothing; a mismatched one is ordinary text
        assert_eq!(dom("p)"), "p)");
        assert_eq!(dom("[a)"), "[a)]");
        assert_eq!(dom("(a]"), "(a])");
        assert_eq!(dom("[a](b)"), "[a](b)");
    }

    #[test]
    fn sheet_mode_never_closes() {
        assert_eq!(sheet("[title"), "[title");
        assert_eq!(sheet(":is(p"), ":is(p");
        assert_eq!(sheet("[title=\"a"), "[title=\"a");
        assert_eq!(sheet("div/**/p"), "div!p");
    }

    #[test]
    fn unchanged_sources_are_borrowed() {
        for s in ["p", "div > p", "[title=a]", ":is(p)", "\"x\"", "p, a", ""] {
            assert!(
                matches!(normalize_str(s, Mode::Dom), std::borrow::Cow::Borrowed(_)),
                "{s}"
            );
            assert!(
                matches!(normalize_str(s, Mode::Sheet), std::borrow::Cow::Borrowed(_)),
                "{s}"
            );
        }
        assert_eq!(normalize(&['p'], Mode::Dom), None);
        assert_eq!(normalize(&[u16::from(b'[')], Mode::Sheet), None);
    }

    #[test]
    fn comment_text_may_hold_stars_and_slashes() {
        assert_eq!(dom("p/* a*b/c **/.x"), "p.x");
        assert_eq!(dom("p/***/.x"), "p.x");
        assert_eq!(dom("p/*/ */.x"), "p.x");
    }

    #[test]
    fn units_close_an_escape_at_the_end_with_a_replacement() {
        let p = u16::from(b'p');
        let backslash = u16::from(b'\\');
        assert_eq!(normalize(&[p, backslash], Mode::Dom), Some(vec![p, 0xfffd]));
        assert_eq!(normalize(&[p, backslash], Mode::Sheet), None);
    }

    #[test]
    fn units_keep_lone_surrogates() {
        let units: Vec<u16> = vec![0x5b, 0xd800, 0x2f, 0x2a, 0x2a, 0x2f, 0xdc00];
        // a lone surrogate is a non-ASCII name code point on both sides
        assert_eq!(
            normalize(&units, Mode::Dom),
            Some(vec![0x5b, 0xd800, 0x20, 0xdc00, 0x5d])
        );
    }
}
