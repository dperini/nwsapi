use super::{Handle, Tree};
use cssparser::{Parser, ParserInput};

#[derive(Clone, Debug)]
pub(super) enum LanguageRange {
    Unknown,
    Subtags(Vec<String>),
}

pub(super) fn parse(source: &str) -> Option<Vec<LanguageRange>> {
    let mut input = ParserInput::new(source);
    Parser::new(&mut input)
        .parse_comma_separated::<_, _, ()>(|item| {
            let range = item.expect_ident_or_string()?.to_ascii_lowercase();
            if !item.is_exhausted() {
                return Ok(None);
            }
            if range.is_empty() {
                return Ok(Some(LanguageRange::Unknown));
            }
            let mut subtags = range.split('-').enumerate();
            let valid = subtags.all(|(i, part)| part == "*" || valid_subtag(part, i == 0));
            Ok(
                valid
                    .then(|| LanguageRange::Subtags(range.split('-').map(str::to_owned).collect())),
            )
        })
        .ok()
        .map(|ranges| ranges.into_iter().flatten().collect())
}

fn valid_subtag(subtag: &str, primary: bool) -> bool {
    (1..=8).contains(&subtag.len())
        && subtag
            .bytes()
            .all(|byte| byte.is_ascii_alphabetic() || (!primary && byte.is_ascii_digit()))
}

pub(super) fn matches(tree: &Tree, element: Handle, ranges: &[LanguageRange]) -> bool {
    let mut node = Some(element);
    while let Some(current) = node {
        let lang = tree
            .get_attribute_ns_borrowed(
                current,
                Some("http://www.w3.org/XML/1998/namespace"),
                "lang",
            )
            .or_else(|| {
                tree.is_html(current)
                    .then(|| tree.get_attribute_ns_borrowed(current, None, "lang"))
                    .flatten()
            });
        if let Some(lang) = lang {
            return matches_language(lang, ranges);
        }
        node = tree.parent(current).or_else(|| tree.shadow_host(current));
    }
    matches_language("", ranges)
}

fn matches_language(lang: &str, ranges: &[LanguageRange]) -> bool {
    if lang.is_empty() {
        return ranges
            .iter()
            .any(|range| matches!(range, LanguageRange::Unknown));
    }
    if !lang
        .split('-')
        .enumerate()
        .all(|(i, part)| valid_subtag(part, i == 0))
    {
        return false;
    }
    ranges.iter().any(|range| match range {
        LanguageRange::Unknown => false,
        LanguageRange::Subtags(wanted) => extended_match(lang, wanted),
    })
}

fn extended_match(lang: &str, wanted: &[String]) -> bool {
    let mut parts = lang.split('-');
    if !parts
        .next()
        .is_some_and(|first| wanted[0] == "*" || first.eq_ignore_ascii_case(&wanted[0]))
    {
        return false;
    }
    for subtag in wanted.iter().skip(1).filter(|part| part.as_str() != "*") {
        loop {
            match parts.next() {
                Some(part) if part.eq_ignore_ascii_case(subtag) => break,
                Some(part) if part.len() > 1 => {}
                _ => return false,
            }
        }
    }
    true
}
