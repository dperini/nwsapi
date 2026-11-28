use super::{AttrMatch, Combinator, CompiledSelector, Complex, Pseudo, Tree, TypeNamespace};

impl Tree {
    /// Compile host selectors with optional NWSAPI jQuery syntax and the native
    /// form of NWSAPI's `!=` operator. Other JavaScript resolver shapes need
    /// the JS path.
    #[must_use]
    pub fn compile_host_selector_units_with_bridge_extensions(
        &self,
        selector: &[u16],
        jquery_enabled: bool,
        not_equal_operator: bool,
        forgiving: bool,
    ) -> Option<CompiledSelector> {
        self.compile_host_selector_units_with_bridge_operator(
            selector,
            jquery_enabled,
            not_equal_operator,
            None,
            forgiving,
        )
    }

    /// Compile a host query with declarative custom-operator aliases.
    /// `custom_operator` contains three-byte standard records (symbol, `=`,
    /// operation marker), identity combinator records (`symbolCI`), or literal-pattern records
    /// `symbol=G<positive><prefix-anchor><prefix-tokens>:<suffix-anchor><suffix-tokens>;`.
    #[must_use]
    pub fn compile_host_selector_units_with_bridge_operator(
        &self,
        selector: &[u16],
        jquery_enabled: bool,
        not_equal_operator: bool,
        custom_operator: Option<&str>,
        forgiving: bool,
    ) -> Option<CompiledSelector> {
        self.compile_host_selector_units_with_operator_grammar(
            selector,
            jquery_enabled,
            not_equal_operator,
            custom_operator,
            forgiving,
            None,
        )
    }

    /// Compile a host plan under the current v3 attribute operator grammar.
    /// Registered callbacks remain available only for tokens admitted by that grammar.
    #[must_use]
    pub fn compile_host_selector_units_with_operator_grammar(
        &self,
        selector: &[u16],
        jquery_enabled: bool,
        not_equal_operator: bool,
        custom_operator: Option<&str>,
        forgiving: bool,
        operator_grammar: Option<&str>,
    ) -> Option<CompiledSelector> {
        if !jquery_enabled
            && !not_equal_operator
            && custom_operator.is_none()
            && operator_grammar.is_none()
        {
            return self.compile_host_selector_units_with_options(selector, false, forgiving);
        }
        let mut extensions = super::SelectorExtensions::default();
        if jquery_enabled && !extensions.register_jquery() {
            return None;
        }
        if not_equal_operator && !extensions.register_operator("!=", not_equal) {
            return None;
        }
        if let Some(specs) = custom_operator {
            let bytes = specs.as_bytes();
            if bytes.is_empty() {
                return None;
            }
            let mut offset = 0;
            while offset < bytes.len() {
                let record = bytes.get(offset..offset + 3)?;
                if record.starts_with(b":L") {
                    let (payload, _) = specs[offset + 2..].split_once(';')?;
                    let (name, local_name) = payload.split_once(':')?;
                    let local_name = local_name.to_owned();
                    if !extensions.register_selector_with(
                        name,
                        super::SelectorArity::Flag,
                        move |tree, node, _| tree.local_name_is(node, &local_name),
                    ) {
                        return None;
                    }
                    offset += payload.len() + 3;
                    continue;
                }
                if record.starts_with(b":S") || record.starts_with(b":F") {
                    let matches = record[1] == b'S';
                    let tail = &specs[offset + 2..];
                    let (name, _) = tail.split_once(';')?;
                    if !extensions.register_selector_with(
                        name,
                        super::SelectorArity::Flag,
                        move |_, _, _| matches,
                    ) {
                        return None;
                    }
                    offset += name.len() + 3;
                    continue;
                }
                if record[1..] == *b"CI" {
                    if !extensions
                        .register_combinator(char::from(record[0]), |_, node, visit| visit(node))
                    {
                        return None;
                    }
                    offset += 3;
                    continue;
                }
                if record[1] != b'=' {
                    return None;
                }
                let operator = std::str::from_utf8(&bytes[offset..offset + 2]).ok()?;
                if bytes[offset + 2] == b'G' {
                    if bytes.len() - offset < 8
                        || !matches!(bytes[offset + 3], b'0' | b'1')
                        || !matches!(bytes[offset + 4], b'^' | b'-')
                    {
                        return None;
                    }
                    let payload = &bytes[offset + 5..];
                    let end = payload.iter().position(|byte| *byte == b';')?;
                    let colon = payload[..end].iter().position(|byte| *byte == b':')?;
                    if colon > 512
                        || end < colon + 2
                        || end - colon - 2 > 512
                        || !matches!(payload[colon + 1], b'$' | b'-')
                    {
                        return None;
                    }
                    let prefix = decode_regex_tokens(&payload[..colon])?;
                    let suffix = decode_regex_tokens(&payload[colon + 2..end])?;
                    if !register_literal_operator(
                        &mut extensions,
                        operator,
                        prefix,
                        suffix,
                        bytes[offset + 3] == b'1',
                        bytes[offset + 4] == b'^',
                        payload[colon + 1] == b'$',
                    ) {
                        return None;
                    }
                    offset += 5 + end + 1;
                    continue;
                }
                let marker = bytes[offset + 2];
                let predicate = match marker {
                    b'=' => equal,
                    b'!' => not_equal,
                    b'^' => prefix,
                    b'P' => not_prefix,
                    b'$' => suffix,
                    b'S' => not_suffix,
                    b'*' => substring,
                    b'C' => not_substring,
                    b'|' => dash_match,
                    b'D' => not_dash_match,
                    b'~' => word_match,
                    b'W' => not_word_match,
                    _ => return None,
                };
                if !extensions.register_operator(operator, predicate) {
                    return None;
                }
                offset += 3;
            }
        }
        if let Some(grammar) = operator_grammar {
            grammar.clone_into(&mut extensions.syntax_mut().operators);
        }
        let source = String::from_utf16(selector).ok()?;
        let plan = extensions.compile_with_forgiving(&source, forgiving).ok()?;
        supported_plan(&plan).then_some(plan)
    }

    /// Compile a host-snapshot selector using native Rust extensions.
    ///
    /// This is the host-bridge counterpart to `SelectorExtensions::compile`:
    /// selectors, operators, and combinators registered on the Rust side stay
    /// executable after the selector is compiled. JavaScript callback-based
    /// NWSAPI extensions must continue to use the JavaScript route.
    #[must_use]
    pub fn compile_host_selector_units_with_extensions(
        &self,
        selector: &[u16],
        extensions: &super::SelectorExtensions,
        forgiving: bool,
    ) -> Option<CompiledSelector> {
        let source = String::from_utf16(selector).ok()?;
        let plan = extensions.compile_with_forgiving(&source, forgiving).ok()?;
        if supported_plan(&plan) {
            return Some(plan);
        }
        if !plan_has_pseudo_element(&plan) {
            return None;
        }
        super::cascade::parse_for_cascade(&source).ok()?;
        supported_plan_with_pseudo_elements(&plan).then_some(plan)
    }

    /// Compile the selector subset supported by a host document snapshot,
    /// attributes and text-child presence.
    #[must_use]
    pub fn compile_host_selector_units(&self, selector: &[u16]) -> Option<CompiledSelector> {
        self.compile_host_selector_units_with_jquery(selector, false)
    }

    /// Compile selectors with the optional NWSAPI jQuery-style extension enabled.
    #[must_use]
    pub fn compile_host_selector_units_with_jquery(
        &self,
        selector: &[u16],
        jquery_enabled: bool,
    ) -> Option<CompiledSelector> {
        self.compile_host_selector_units_with_options(selector, jquery_enabled, true)
    }

    /// Compile host selectors with the engine's forgiving-list policy.
    #[must_use]
    pub fn compile_host_selector_units_with_options(
        &self,
        selector: &[u16],
        jquery_enabled: bool,
        forgiving: bool,
    ) -> Option<CompiledSelector> {
        let source = if jquery_enabled || !forgiving {
            Some(String::from_utf16(selector).ok()?)
        } else {
            None
        };
        let plan = if jquery_enabled {
            let mut extensions = super::SelectorExtensions::default();
            extensions.register_jquery().then_some(())?;
            extensions
                .compile_with_forgiving(source.as_deref()?, forgiving)
                .ok()?
        } else {
            if !forgiving {
                super::cascade::validate_dom(source.as_deref()?, false).ok()?;
            }
            self.compile_selector_units(selector).ok()?
        };
        if supported_plan(&plan) {
            return Some(plan);
        }
        if !plan_has_pseudo_element(&plan) {
            return None;
        }
        let source = String::from_utf16(selector).ok()?;
        super::cascade::parse_for_cascade(&source).ok()?;
        supported_plan_with_pseudo_elements(&plan).then_some(plan)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum RegexToken {
    Literal(u16),
    DigitsPlus,
    WordPlus,
    SpacePlus,
    DigitsZeroOrMore,
    WordZeroOrMore,
    SpaceZeroOrMore,
    DigitsZeroOrOne,
    WordZeroOrOne,
    SpaceZeroOrOne,
    DigitsOne,
    WordOne,
    SpaceOne,
    NonDigitsPlus,
    NonWordPlus,
    NonSpacePlus,
    NonDigitsZeroOrMore,
    NonWordZeroOrMore,
    NonSpaceZeroOrMore,
    NonDigitsZeroOrOne,
    NonWordZeroOrOne,
    NonSpaceZeroOrOne,
    NonDigitsOne,
    NonWordOne,
    NonSpaceOne,
    AnyPlus,
    AnyZeroOrMore,
    AnyZeroOrOne,
    AnyOne,
    WordBoundary,
    NotWordBoundary,
    AsciiClass {
        mask: u128,
        negated: bool,
        whitespace: bool,
        repetition: RegexRepetition,
    },
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum RegexRepetition {
    Plus,
    ZeroOrMore,
    ZeroOrOne,
    One,
}

fn decode_regex_tokens(encoded: &[u8]) -> Option<Vec<RegexToken>> {
    let mut tokens = Vec::new();
    let mut index = 0;
    while index < encoded.len() {
        if encoded[index] == b'!' {
            tokens.push(match *encoded.get(index + 1)? {
                b'D' => RegexToken::DigitsPlus,
                b'W' => RegexToken::WordPlus,
                b'S' => RegexToken::SpacePlus,
                b'd' => RegexToken::DigitsZeroOrMore,
                b'w' => RegexToken::WordZeroOrMore,
                b's' => RegexToken::SpaceZeroOrMore,
                b'N' => RegexToken::NonDigitsPlus,
                b'M' => RegexToken::NonWordPlus,
                b'T' => RegexToken::NonSpacePlus,
                b'A' => RegexToken::AnyPlus,
                b'a' => RegexToken::AnyZeroOrMore,
                b'n' => RegexToken::NonDigitsZeroOrMore,
                b'm' => RegexToken::NonWordZeroOrMore,
                b't' => RegexToken::NonSpaceZeroOrMore,
                b'?' => {
                    tokens.push(match *encoded.get(index + 2)? {
                        b'd' => RegexToken::DigitsZeroOrOne,
                        b'w' => RegexToken::WordZeroOrOne,
                        b's' => RegexToken::SpaceZeroOrOne,
                        b'n' => RegexToken::NonDigitsZeroOrOne,
                        b'm' => RegexToken::NonWordZeroOrOne,
                        b't' => RegexToken::NonSpaceZeroOrOne,
                        b'a' => RegexToken::AnyZeroOrOne,
                        _ => return None,
                    });
                    index += 3;
                    continue;
                }
                b'#' => {
                    tokens.push(match *encoded.get(index + 2)? {
                        b'd' => RegexToken::DigitsOne,
                        b'w' => RegexToken::WordOne,
                        b's' => RegexToken::SpaceOne,
                        b'n' => RegexToken::NonDigitsOne,
                        b'm' => RegexToken::NonWordOne,
                        b't' => RegexToken::NonSpaceOne,
                        b'a' => RegexToken::AnyOne,
                        _ => return None,
                    });
                    index += 3;
                    continue;
                }
                b'u' => {
                    let high = hex_word(encoded.get(index + 2..index + 6)?)?;
                    tokens.push(RegexToken::Literal(high));
                    index += 6;
                    continue;
                }
                b'b' => RegexToken::WordBoundary,
                b'B' => RegexToken::NotWordBoundary,
                b'c' => {
                    let repetition = match *encoded.get(index + 2)? {
                        b'C' => RegexRepetition::Plus,
                        b'c' => RegexRepetition::ZeroOrMore,
                        b'?' => RegexRepetition::ZeroOrOne,
                        b'#' => RegexRepetition::One,
                        _ => return None,
                    };
                    let flags = match *encoded.get(index + 3)? {
                        b'0'..=b'3' => encoded[index + 3] - b'0',
                        _ => return None,
                    };
                    let negated = flags & 1 != 0;
                    let whitespace = flags & 2 != 0;
                    let mask = u128::from_str_radix(
                        std::str::from_utf8(encoded.get(index + 4..index + 36)?).ok()?,
                        16,
                    )
                    .ok()?;
                    tokens.push(RegexToken::AsciiClass {
                        mask,
                        negated,
                        whitespace,
                        repetition,
                    });
                    index += 36;
                    continue;
                }
                _ => return None,
            });
            index += 2;
        } else {
            let high = hex_digit(*encoded.get(index)?)?;
            let low = hex_digit(*encoded.get(index + 1)?)?;
            tokens.push(RegexToken::Literal(u16::from(high * 16 + low)));
            index += 2;
        }
    }
    Some(tokens)
}

fn hex_word(encoded: &[u8]) -> Option<u16> {
    if encoded.len() != 4 {
        return None;
    }
    encoded.iter().try_fold(0u16, |value, byte| {
        Some(value * 16 + u16::from(hex_digit(*byte)?))
    })
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn register_literal_operator(
    extensions: &mut super::SelectorExtensions,
    operator: &str,
    prefix_tokens: Vec<RegexToken>,
    suffix_tokens: Vec<RegexToken>,
    positive: bool,
    anchored_start: bool,
    anchored_end: bool,
) -> bool {
    extensions.register_operator_with(operator, move |got, wanted, insensitive| {
        let mut tokens = prefix_tokens.clone();
        tokens.extend(wanted.iter().copied().map(RegexToken::Literal));
        tokens.extend_from_slice(&suffix_tokens);
        let found = regex_tokens_match(got, &tokens, anchored_start, anchored_end, insensitive);
        found == positive
    })
}

fn regex_tokens_match(
    got: &[u16],
    tokens: &[RegexToken],
    anchored_start: bool,
    anchored_end: bool,
    insensitive: bool,
) -> bool {
    // Run a small NFA over token positions. Unanchored patterns may start at
    // any input boundary; `*` and `?` tokens add an epsilon edge to the next token.
    let mut reachable = vec![false; tokens.len() + 1];
    reachable[0] = true;
    let mut previous = None;
    for unit in got {
        if !anchored_start {
            reachable[0] = true;
        }
        regex_epsilon_closure(&mut reachable, tokens, previous, Some(*unit));
        if !anchored_end && reachable[tokens.len()] {
            return true;
        }
        let mut next = vec![false; tokens.len() + 1];
        for (index, token) in tokens.iter().enumerate() {
            match token {
                RegexToken::Literal(expected) => {
                    next[index + 1] |= reachable[index]
                        && equal(
                            std::slice::from_ref(unit),
                            std::slice::from_ref(expected),
                            insensitive,
                        );
                }
                class if regex_class_matches(*unit, *class, insensitive) => match class {
                    RegexToken::DigitsZeroOrOne
                    | RegexToken::WordZeroOrOne
                    | RegexToken::SpaceZeroOrOne
                    | RegexToken::DigitsOne
                    | RegexToken::WordOne
                    | RegexToken::SpaceOne
                    | RegexToken::NonDigitsZeroOrOne
                    | RegexToken::NonWordZeroOrOne
                    | RegexToken::NonSpaceZeroOrOne
                    | RegexToken::NonDigitsOne
                    | RegexToken::NonWordOne
                    | RegexToken::NonSpaceOne
                    | RegexToken::AnyZeroOrOne
                    | RegexToken::AnyOne => {
                        next[index + 1] |= reachable[index];
                    }
                    RegexToken::AsciiClass {
                        repetition: RegexRepetition::ZeroOrOne | RegexRepetition::One,
                        ..
                    } => next[index + 1] |= reachable[index],
                    _ => {
                        // Plus consumes its first class character from `index`;
                        // repeating forms loop from the state after the token.
                        next[index + 1] |= reachable[index] || reachable[index + 1];
                    }
                },
                _ => {}
            }
        }
        reachable = next;
        previous = Some(*unit);
    }
    if !anchored_start {
        reachable[0] = true;
    }
    regex_epsilon_closure(&mut reachable, tokens, previous, None);
    reachable[tokens.len()]
}

fn regex_epsilon_closure(
    reachable: &mut [bool],
    tokens: &[RegexToken],
    previous: Option<u16>,
    next: Option<u16>,
) {
    for (index, token) in tokens.iter().enumerate() {
        let epsilon = matches!(
            token,
            RegexToken::DigitsZeroOrMore
                | RegexToken::WordZeroOrMore
                | RegexToken::SpaceZeroOrMore
                | RegexToken::NonDigitsZeroOrMore
                | RegexToken::NonWordZeroOrMore
                | RegexToken::NonSpaceZeroOrMore
                | RegexToken::DigitsZeroOrOne
                | RegexToken::WordZeroOrOne
                | RegexToken::SpaceZeroOrOne
                | RegexToken::NonDigitsZeroOrOne
                | RegexToken::NonWordZeroOrOne
                | RegexToken::NonSpaceZeroOrOne
                | RegexToken::AnyZeroOrMore
                | RegexToken::AnyZeroOrOne
                | RegexToken::AsciiClass {
                    repetition: RegexRepetition::ZeroOrMore | RegexRepetition::ZeroOrOne,
                    ..
                }
        ) || match token {
            RegexToken::WordBoundary => {
                is_javascript_regex_word(previous.unwrap_or_default())
                    != is_javascript_regex_word(next.unwrap_or_default())
            }
            RegexToken::NotWordBoundary => {
                is_javascript_regex_word(previous.unwrap_or_default())
                    == is_javascript_regex_word(next.unwrap_or_default())
            }
            _ => false,
        };
        if epsilon && reachable[index] {
            reachable[index + 1] = true;
        }
    }
}

fn regex_class_matches(unit: u16, token: RegexToken, insensitive: bool) -> bool {
    match token {
        RegexToken::DigitsPlus
        | RegexToken::DigitsZeroOrMore
        | RegexToken::DigitsZeroOrOne
        | RegexToken::DigitsOne => (u16::from(b'0')..=u16::from(b'9')).contains(&unit),
        RegexToken::WordPlus
        | RegexToken::WordZeroOrMore
        | RegexToken::WordZeroOrOne
        | RegexToken::WordOne => is_javascript_regex_word(unit),
        RegexToken::SpacePlus
        | RegexToken::SpaceZeroOrMore
        | RegexToken::SpaceZeroOrOne
        | RegexToken::SpaceOne => is_javascript_regex_space(unit),
        RegexToken::NonDigitsPlus
        | RegexToken::NonDigitsZeroOrMore
        | RegexToken::NonDigitsZeroOrOne
        | RegexToken::NonDigitsOne => !(u16::from(b'0')..=u16::from(b'9')).contains(&unit),
        RegexToken::NonWordPlus
        | RegexToken::NonWordZeroOrMore
        | RegexToken::NonWordZeroOrOne
        | RegexToken::NonWordOne => !is_javascript_regex_word(unit),
        RegexToken::NonSpacePlus
        | RegexToken::NonSpaceZeroOrMore
        | RegexToken::NonSpaceZeroOrOne
        | RegexToken::NonSpaceOne => !is_javascript_regex_space(unit),
        RegexToken::AnyPlus
        | RegexToken::AnyZeroOrMore
        | RegexToken::AnyZeroOrOne
        | RegexToken::AnyOne => !matches!(unit, 0x000a | 0x000d | 0x2028 | 0x2029),
        RegexToken::AsciiClass {
            mask,
            negated,
            whitespace,
            ..
        } => {
            let case_variant = if insensitive && (u16::from(b'a')..=u16::from(b'z')).contains(&unit)
            {
                unit - u16::from(b'a') + u16::from(b'A')
            } else if insensitive && (u16::from(b'A')..=u16::from(b'Z')).contains(&unit) {
                unit - u16::from(b'A') + u16::from(b'a')
            } else {
                unit
            };
            let contains = unit < 128 && mask & (1u128 << unit) != 0
                || case_variant < 128 && mask & (1u128 << case_variant) != 0
                || (whitespace && is_javascript_regex_space(unit));
            contains != negated
        }
        RegexToken::Literal(_) | RegexToken::WordBoundary | RegexToken::NotWordBoundary => false,
    }
}

fn is_javascript_regex_word(unit: u16) -> bool {
    (u16::from(b'a')..=u16::from(b'z')).contains(&unit)
        || (u16::from(b'A')..=u16::from(b'Z')).contains(&unit)
        || (u16::from(b'0')..=u16::from(b'9')).contains(&unit)
        || unit == u16::from(b'_')
}

fn is_javascript_regex_space(unit: u16) -> bool {
    matches!(
        unit,
        0x0009..=0x000d
            | 0x0020
            | 0x00a0
            | 0x1680
            | 0x2000..=0x200a
            | 0x2028..=0x2029
            | 0x202f
            | 0x205f
            | 0x3000
            | 0xfeff
    )
}

fn not_equal(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    !equal(got, wanted, insensitive)
}

fn equal(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    compare(got, wanted, insensitive) == Some(std::cmp::Ordering::Equal)
}

fn prefix(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    got.len() >= wanted.len() && equal(&got[..wanted.len()], wanted, insensitive)
}

fn not_prefix(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    !prefix(got, wanted, insensitive)
}

fn suffix(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    got.len() >= wanted.len() && equal(&got[got.len() - wanted.len()..], wanted, insensitive)
}

fn not_suffix(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    !suffix(got, wanted, insensitive)
}

fn substring(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    wanted.is_empty()
        || got
            .windows(wanted.len())
            .any(|candidate| equal(candidate, wanted, insensitive))
}

fn not_substring(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    !substring(got, wanted, insensitive)
}

fn dash_match(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    equal(got, wanted, insensitive)
        || (got.len() > wanted.len()
            && got.get(wanted.len()) == Some(&u16::from(b'-'))
            && prefix(got, wanted, insensitive))
}

fn not_dash_match(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    !dash_match(got, wanted, insensitive)
}

fn word_match(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    got.split(|unit| matches!(*unit, 9 | 10 | 12 | 13 | 32))
        .any(|token| equal(token, wanted, insensitive))
}

fn not_word_match(got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
    !word_match(got, wanted, insensitive)
}

fn compare(got: &[u16], wanted: &[u16], insensitive: bool) -> Option<std::cmp::Ordering> {
    let fold = |unit: u16| {
        if insensitive && (65..=90).contains(&unit) {
            unit + 32
        } else {
            unit
        }
    };
    (got.len() == wanted.len()).then(|| {
        got.iter()
            .zip(wanted)
            .map(|(&left, &right)| fold(left).cmp(&fold(right)))
            .find(|order| *order != std::cmp::Ordering::Equal)
            .unwrap_or(std::cmp::Ordering::Equal)
    })
}

#[cfg(test)]
mod bridge_operator_tests {
    use super::*;

    #[test]
    fn regex_literal_tokens_preserve_unicode_utf16_units() {
        let decoded = decode_regex_tokens(b"636166!u00e9!uD83D!uDCA1").unwrap();
        let expected: Vec<_> = "café💡".encode_utf16().map(RegexToken::Literal).collect();
        assert_eq!(decoded, expected);
        assert!(decode_regex_tokens(b"!u00e").is_none());
        assert!(decode_regex_tokens(b"!u00xz").is_none());
    }

    #[test]
    fn optional_regex_class_matches_zero_or_one_character() {
        let tokens = decode_regex_tokens(b"78!?d79").unwrap();
        for value in ["xy", "x7y"] {
            assert!(regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &tokens,
                true,
                true,
                false
            ));
        }
        assert!(!regex_tokens_match(
            &"x77y".encode_utf16().collect::<Vec<_>>(),
            &tokens,
            true,
            true,
            false
        ));
    }

    #[test]
    fn bounded_regex_class_tokens_match_the_configured_range() {
        let tokens = decode_regex_tokens(b"6261746368!#d!#d!?d78").unwrap();
        for value in ["batch12x", "batch123x"] {
            assert!(regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &tokens,
                true,
                true,
                false
            ));
        }
        for value in ["batch1x", "batch1234x"] {
            assert!(!regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &tokens,
                true,
                true,
                false
            ));
        }
    }

    #[test]
    fn regex_space_class_matches_javascript_unicode_whitespace() {
        let tokens = [
            RegexToken::Literal(u16::from(b'a')),
            RegexToken::SpacePlus,
            RegexToken::Literal(u16::from(b'z')),
        ];
        for value in ["a z", "a\u{00a0}z", "a\u{3000}z", "a\u{feff}z"] {
            assert!(regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &tokens,
                true,
                true,
                false
            ));
        }
        assert!(!regex_tokens_match(
            &"a\u{200b}z".encode_utf16().collect::<Vec<_>>(),
            &tokens,
            true,
            true,
            false
        ));
    }

    #[test]
    fn regex_negated_classes_match_javascript_complements() {
        for (tokens, matches, rejects) in [
            (b"!N".as_slice(), "-", "7"),
            (b"!M".as_slice(), "-", "a"),
            (b"!T".as_slice(), "\u{200b}", "\u{00a0}"),
        ] {
            assert!(regex_tokens_match(
                &matches.encode_utf16().collect::<Vec<_>>(),
                &decode_regex_tokens(tokens).unwrap(),
                true,
                true,
                false
            ));
            assert!(!regex_tokens_match(
                &rejects.encode_utf16().collect::<Vec<_>>(),
                &decode_regex_tokens(tokens).unwrap(),
                true,
                true,
                false
            ));
        }
    }

    #[test]
    fn regex_dot_matches_javascript_non_line_terminators_and_quantifiers() {
        let one = decode_regex_tokens(b"!#a").unwrap();
        let optional = decode_regex_tokens(b"!?a").unwrap();
        let repeated = decode_regex_tokens(b"!A").unwrap();
        assert!(regex_tokens_match(
            &"x".encode_utf16().collect::<Vec<_>>(),
            &one,
            true,
            true,
            false
        ));
        assert!(regex_tokens_match(&[0xD83D], &one, true, true, false));
        assert!(!regex_tokens_match(
            &"💡".encode_utf16().collect::<Vec<_>>(),
            &one,
            true,
            true,
            false
        ));
        for value in ["", "x"] {
            assert!(regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &optional,
                true,
                true,
                false
            ));
        }
        for value in ["x", "xyz"] {
            assert!(regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &repeated,
                true,
                true,
                false
            ));
        }
        for value in ["", "\n", "\r", "\u{2028}", "\u{2029}"] {
            assert!(!regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &one,
                true,
                true,
                false
            ));
        }
        assert!(regex_tokens_match(
            &"ab".encode_utf16().collect::<Vec<_>>(),
            &decode_regex_tokens(b"!#a!#a").unwrap(),
            true,
            true,
            false
        ));
    }

    #[test]
    fn regex_ascii_character_classes_support_ranges_negation_and_repetition() {
        let lower =
            (u128::from(b'a')..=u128::from(b'z')).fold(0u128, |mask, code| mask | (1u128 << code));
        let encoded = format!("!cC0{lower:032x}");
        let tokens = decode_regex_tokens(encoded.as_bytes()).unwrap();
        for value in ["abc", "xyz"] {
            assert!(regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &tokens,
                true,
                true,
                false
            ));
        }
        for value in ["", "ABC", "a1"] {
            assert!(!regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &tokens,
                true,
                true,
                false
            ));
        }
        assert!(regex_tokens_match(
            &"ABC".encode_utf16().collect::<Vec<_>>(),
            &tokens,
            true,
            true,
            true
        ));
        let negated_lower = decode_regex_tokens(format!("!cC1{lower:032x}").as_bytes()).unwrap();
        assert!(!regex_tokens_match(
            &"A".encode_utf16().collect::<Vec<_>>(),
            &negated_lower,
            true,
            true,
            true
        ));

        let digits =
            (u128::from(b'0')..=u128::from(b'9')).fold(0u128, |mask, code| mask | (1u128 << code));
        let encoded = format!("!cC1{digits:032x}");
        let negated = decode_regex_tokens(encoded.as_bytes()).unwrap();
        assert!(regex_tokens_match(
            &"-💡".encode_utf16().collect::<Vec<_>>(),
            &negated,
            true,
            true,
            false
        ));
        assert!(!regex_tokens_match(
            &"12".encode_utf16().collect::<Vec<_>>(),
            &negated,
            true,
            true,
            false
        ));
        assert!(decode_regex_tokens(b"!cX00000000000000000000000000000000").is_none());
    }

    #[test]
    fn regex_character_class_space_shorthand_uses_javascript_whitespace() {
        let zero_mask = "0".repeat(32);
        let whitespace = decode_regex_tokens(format!("!cC2{zero_mask}").as_bytes()).unwrap();
        for value in [" ", "\u{00a0}", "\u{3000}", "\u{feff}"] {
            assert!(regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &whitespace,
                true,
                true,
                false
            ));
        }
        for value in ["", "x"] {
            assert!(!regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &whitespace,
                true,
                true,
                false
            ));
        }
        let non_whitespace = decode_regex_tokens(format!("!cC3{zero_mask}").as_bytes()).unwrap();
        assert!(regex_tokens_match(
            &"x💡".encode_utf16().collect::<Vec<_>>(),
            &non_whitespace,
            true,
            true,
            false
        ));
        assert!(!regex_tokens_match(
            &"\u{00a0}".encode_utf16().collect::<Vec<_>>(),
            &non_whitespace,
            true,
            true,
            false
        ));
    }

    #[test]
    fn regex_word_boundaries_are_zero_width_and_ascii_based() {
        let boundary = decode_regex_tokens(b"666f6f!b2d").unwrap();
        assert!(regex_tokens_match(
            &"foo-".encode_utf16().collect::<Vec<_>>(),
            &boundary,
            true,
            true,
            false
        ));
        for value in ["foox-", "foo1-"] {
            assert!(!regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &boundary,
                true,
                true,
                false
            ));
        }
        assert!(regex_tokens_match(
            &"foo💡".encode_utf16().collect::<Vec<_>>(),
            &decode_regex_tokens(b"666f6f!b").unwrap(),
            true,
            false,
            false
        ));

        let non_boundary = decode_regex_tokens(b"666f6f!B78").unwrap();
        assert!(regex_tokens_match(
            &"foox".encode_utf16().collect::<Vec<_>>(),
            &non_boundary,
            true,
            true,
            false
        ));
        assert!(!regex_tokens_match(
            &"foo-x".encode_utf16().collect::<Vec<_>>(),
            &non_boundary,
            true,
            true,
            false
        ));
    }

    #[test]
    fn regex_star_runs_accept_empty_or_repeated_classes() {
        let mut digits: Vec<_> = "item".encode_utf16().map(RegexToken::Literal).collect();
        digits.extend([
            RegexToken::DigitsZeroOrMore,
            RegexToken::Literal(u16::from(b'x')),
        ]);
        for value in ["itemx", "item12x"] {
            assert!(regex_tokens_match(
                &value.encode_utf16().collect::<Vec<_>>(),
                &digits,
                true,
                true,
                false
            ));
        }
        assert!(!regex_tokens_match(
            &"itemax".encode_utf16().collect::<Vec<_>>(),
            &digits,
            true,
            true,
            false
        ));

        let mut word: Vec<_> = "a".encode_utf16().map(RegexToken::Literal).collect();
        word.extend([
            RegexToken::WordZeroOrMore,
            RegexToken::Literal(u16::from(b'z')),
        ]);
        assert!(regex_tokens_match(
            &"az".encode_utf16().collect::<Vec<_>>(),
            &word,
            true,
            true,
            false
        ));
        assert!(regex_tokens_match(
            &"a_word9z".encode_utf16().collect::<Vec<_>>(),
            &word,
            true,
            true,
            false
        ));

        let mut space: Vec<_> = "a".encode_utf16().map(RegexToken::Literal).collect();
        space.extend([
            RegexToken::SpaceZeroOrMore,
            RegexToken::Literal(u16::from(b'z')),
        ]);
        assert!(regex_tokens_match(
            &"az".encode_utf16().collect::<Vec<_>>(),
            &space,
            true,
            true,
            false
        ));
        assert!(regex_tokens_match(
            &"a \t\nz".encode_utf16().collect::<Vec<_>>(),
            &space,
            true,
            true,
            false
        ));
    }

    #[test]
    fn host_operator_grammar_controls_registered_aliases() {
        let tree = Tree::parse("<p data-score=2></p>");
        let compile = |source: &str, grammar| {
            tree.compile_host_selector_units_with_operator_grammar(
                &source.encode_utf16().collect::<Vec<_>>(),
                false,
                false,
                Some("@=="),
                true,
                Some(grammar),
            )
        };
        let original = compile("p[data-score@='2']", "@=|=").unwrap();
        assert!(compile("p[data-score@='2']", "=").is_none());
        assert!(compile("p[data-score='2']", "=").is_some());
        assert_eq!(original.select(&tree, None).len(), 1);
    }

    #[test]
    fn multiple_declarative_operator_aliases_execute_in_host_bridge() {
        let tree = Tree::parse("");
        let source = "p[data-score@=\"2\"][data-kind%=\"secondary\"]";
        let mut extensions = super::super::SelectorExtensions::default();
        assert!(extensions.register_operator("@=", equal));
        assert!(extensions.register_operator("%=", not_prefix));
        assert!(extensions.compile(source).is_ok());
        let plan = tree
            .compile_host_selector_units_with_bridge_operator(
                &source.encode_utf16().collect::<Vec<_>>(),
                false,
                false,
                Some("@==%=P"),
                true,
            )
            .unwrap();
        let mut snapshot = super::super::HostSnapshot::default();
        let document = snapshot.push(None, None, None, false, true, false).unwrap();
        let html = snapshot
            .push(Some(document), Some("html"), None, false, false, false)
            .unwrap();
        let body = snapshot
            .push(Some(html), Some("body"), None, false, false, false)
            .unwrap();
        let first = snapshot
            .push(Some(body), Some("p"), None, false, false, false)
            .unwrap();
        let second = snapshot
            .push(Some(body), Some("p"), None, false, false, false)
            .unwrap();
        for (node, kind) in [(first, "primary"), (second, "secondary")] {
            snapshot.set_attribute(
                node,
                None,
                &"data-score".encode_utf16().collect::<Vec<_>>(),
                &"2".encode_utf16().collect::<Vec<_>>(),
            );
            snapshot.set_attribute(
                node,
                None,
                &"data-kind".encode_utf16().collect::<Vec<_>>(),
                &kind.encode_utf16().collect::<Vec<_>>(),
            );
        }
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![first]));
    }

    #[test]
    fn literal_pattern_operator_record_matches_host_attributes() {
        let tree = Tree::parse("");
        let selector = "p[data-value@=\"Yes\"]";
        let plan = tree
            .compile_host_selector_units_with_bridge_operator(
                &selector.encode_utf16().collect::<Vec<_>>(),
                false,
                false,
                Some("@=G1^707265666978:$737566666978;"),
                true,
            )
            .expect("literal operator record should compile");
        assert!(
            tree.compile_host_selector_units_with_bridge_operator(
                &selector.encode_utf16().collect::<Vec<_>>(),
                false,
                false,
                Some("@=G1-707265666978:-737566666978;"),
                true,
            )
            .is_some(),
            "unanchored literal operator record should compile"
        );
        let mut snapshot = super::super::HostSnapshot::default();
        let doc = snapshot.push(None, None, None, false, true, false).unwrap();
        let matching = snapshot
            .push(Some(doc), Some("p"), None, false, false, false)
            .unwrap();
        let other = snapshot
            .push(Some(doc), Some("p"), None, false, false, false)
            .unwrap();
        for (node, value) in [(matching, "prefixYessuffix"), (other, "prefixNosuffix")] {
            snapshot.set_attribute(
                node,
                None,
                &"data-value".encode_utf16().collect::<Vec<_>>(),
                &value.encode_utf16().collect::<Vec<_>>(),
            );
        }
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![matching]));
    }

    #[test]
    fn rust_custom_attribute_predicate_runs_against_host_snapshot() {
        let mut extensions = super::super::SelectorExtensions::default();
        assert!(
            extensions.register_operator_with("%=", |got, wanted, insensitive| {
                equal(got, wanted, insensitive)
            })
        );
        let source = "p[data-value%=\"Yes\"]";
        let tree = Tree::parse("");
        let host_plan = tree
            .compile_host_selector_units_with_extensions(
                &source.encode_utf16().collect::<Vec<_>>(),
                &extensions,
                true,
            )
            .expect("custom operator should compile for host execution");
        let mut snapshot = super::super::HostSnapshot::default();
        let doc = snapshot.push(None, None, None, false, true, false).unwrap();
        let p = snapshot
            .push(Some(doc), Some("p"), None, false, false, false)
            .unwrap();
        snapshot.set_attribute(
            p,
            None,
            &"data-value".encode_utf16().collect::<Vec<_>>(),
            &"Yes".encode_utf16().collect::<Vec<_>>(),
        );
        assert_eq!(snapshot.query("select", &host_plan, 0), Some(vec![p]));

        let missing = snapshot
            .push(Some(doc), Some("p"), None, false, false, false)
            .unwrap();
        let missing_plan = tree
            .compile_host_selector_units_with_extensions(
                &"p[data-value%=\"null\"]".encode_utf16().collect::<Vec<_>>(),
                &extensions,
                true,
            )
            .expect("custom operator should compile for missing-attribute matching");
        assert_eq!(
            snapshot.query("select", &missing_plan, 0),
            Some(vec![missing])
        );
    }

    #[test]
    fn jquery_host_bridge_matches_non_ascii_attribute_values() {
        let tree = Tree::parse("");
        let source = "[data-value=\"café\"]";
        let plan = tree
            .compile_host_selector_units_with_bridge_extensions(
                &source.encode_utf16().collect::<Vec<_>>(),
                true,
                false,
                true,
            )
            .expect("Unicode attribute selector should stay on the host bridge");
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        let paragraph = snapshot
            .push(Some(0), Some("p"), None, false, false, false)
            .unwrap();
        snapshot.set_attribute(
            paragraph,
            None,
            &"data-value".encode_utf16().collect::<Vec<_>>(),
            &"café".encode_utf16().collect::<Vec<_>>(),
        );
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![paragraph]));
    }

    #[test]
    fn standard_host_bridge_matches_non_ascii_attribute_values() {
        let tree = Tree::parse("");
        let source = "[data-value=\"café\"]";
        let plan = tree
            .compile_host_selector_units(source.encode_utf16().collect::<Vec<_>>().as_slice())
            .expect("Unicode attribute selector should stay on the host bridge");
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        let paragraph = snapshot
            .push(Some(0), Some("p"), None, false, false, false)
            .unwrap();
        assert!(snapshot.set_attribute(
            paragraph,
            None,
            &"data-value".encode_utf16().collect::<Vec<_>>(),
            &"café".encode_utf16().collect::<Vec<_>>(),
        ));
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![paragraph]));
    }

    #[test]
    fn jquery_host_bridge_supports_unicode_selectors_with_forgiving_lists() {
        let tree = Tree::parse("");
        let source = ":is([data-value=\"café\"], :unsupported-nwsapi-test)";
        let plan = tree
            .compile_host_selector_units_with_bridge_extensions(
                &source.encode_utf16().collect::<Vec<_>>(),
                true,
                false,
                true,
            )
            .expect("forgiving Unicode selector should compile for the host bridge");
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        let paragraph = snapshot
            .push(Some(0), Some("p"), None, false, false, false)
            .unwrap();
        snapshot.set_attribute(
            paragraph,
            None,
            &"data-value".encode_utf16().collect::<Vec<_>>(),
            &"café".encode_utf16().collect::<Vec<_>>(),
        );
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![paragraph]));
    }
}

fn supported_plan(plan: &CompiledSelector) -> bool {
    plan.0
        .selectors
        .iter()
        .all(|selector| supported_selector(selector, true, true))
}

fn supported_plan_with_pseudo_elements(plan: &CompiledSelector) -> bool {
    plan.0
        .selectors
        .iter()
        .all(|selector| supported_selector_with_pseudo_elements(selector, true, true))
}

fn plan_has_pseudo_element(plan: &CompiledSelector) -> bool {
    plan.0.selectors.iter().any(|selector| {
        std::iter::once(&selector.first)
            .chain(selector.rest.iter().map(|(_, compound)| compound))
            .any(|compound| {
                compound
                    .pseudos
                    .iter()
                    .any(super::cascade::is_pseudo_element_marker)
            })
    })
}

fn supported_selector(selector: &Complex, allow_scope: bool, allow_language: bool) -> bool {
    if selector
        .rest
        .iter()
        .any(|(combinator, _)| matches!(combinator, Combinator::Custom(_, None)))
    {
        return false;
    }
    std::iter::once(&selector.first)
        .chain(selector.rest.iter().map(|(_, compound)| compound))
        .all(|compound| {
            !matches!(compound.namespace, TypeNamespace::Invalid)
                && compound.attrs.iter().all(supported_attr)
                && compound
                    .pseudos
                    .iter()
                    .all(|pseudo| supported_pseudo(pseudo, allow_scope, allow_language))
        })
}

fn supported_attr(attr: &super::Attr) -> bool {
    match &attr.m {
        AttrMatch::Units(m) => {
            m.supported_host_attribute(attr.html_name.as_deref().unwrap_or(&attr.name))
        }
        // Host snapshots compare attributes as UTF-16, so scalar values from
        // extension parsers can include the full Unicode range as well.
        AttrMatch::Equals(_)
        | AttrMatch::Includes(_)
        | AttrMatch::Prefix(_)
        | AttrMatch::Suffix(_)
        | AttrMatch::Substr(_)
        | AttrMatch::Present => true,
    }
}

fn supported_selector_with_pseudo_elements(
    selector: &Complex,
    allow_scope: bool,
    allow_language: bool,
) -> bool {
    if selector
        .rest
        .iter()
        .any(|(combinator, _)| matches!(combinator, Combinator::Custom(_, None)))
    {
        return false;
    }
    std::iter::once(&selector.first)
        .chain(selector.rest.iter().map(|(_, compound)| compound))
        .all(|compound| {
            let supported_pseudos = compound
                .pseudos
                .iter()
                .position(super::cascade::is_pseudo_element_marker)
                .map_or_else(
                    || {
                        compound
                            .pseudos
                            .iter()
                            .all(|pseudo| supported_pseudo(pseudo, allow_scope, allow_language))
                    },
                    |marker| {
                        compound.pseudos[..marker]
                            .iter()
                            .all(|pseudo| supported_pseudo(pseudo, allow_scope, allow_language))
                    },
                );
            !matches!(compound.namespace, TypeNamespace::Invalid)
                && compound.attrs.iter().all(supported_attr)
                && supported_pseudos
        })
}

fn supported_pseudo(pseudo: &Pseudo, allow_scope: bool, allow_language: bool) -> bool {
    match pseudo {
        Pseudo::Unknown(unknown)
            if matches!(
                unknown.name.as_str(),
                "current" | "active-view-transition-type"
            ) =>
        {
            true
        }
        Pseudo::Heading(_)
        | Pseudo::FirstChild
        | Pseudo::LastChild
        | Pseudo::OnlyChild
        | Pseudo::FirstOfType
        | Pseudo::LastOfType
        | Pseudo::OnlyOfType
        | Pseudo::Empty
        | Pseudo::Root
        | Pseudo::Checked
        | Pseudo::Selected
        | Pseudo::Link
        | Pseudo::Defined
        | Pseudo::Disabled
        | Pseudo::Enabled
        | Pseudo::Required
        | Pseudo::Optional
        | Pseudo::ReadOnly
        | Pseudo::ReadWrite
        | Pseudo::Open(_)
        | Pseudo::State(_)
        | Pseudo::HostState(
            super::SelectorState::Target
            | super::SelectorState::Active
            | super::SelectorState::ActiveViewTransition
            | super::SelectorState::Autofill
            | super::SelectorState::Buffering
            | super::SelectorState::Closed
            | super::SelectorState::Current
            | super::SelectorState::Default
            | super::SelectorState::Focus
            | super::SelectorState::FocusVisible
            | super::SelectorState::FocusWithin
            | super::SelectorState::Future
            | super::SelectorState::Fullscreen
            | super::SelectorState::FullscreenAncestor
            | super::SelectorState::Hover
            | super::SelectorState::Indeterminate
            | super::SelectorState::InterestSource
            | super::SelectorState::InterestTarget
            | super::SelectorState::InRange
            | super::SelectorState::Invalid
            | super::SelectorState::Modal
            | super::SelectorState::Muted
            | super::SelectorState::Open
            | super::SelectorState::OutOfRange
            | super::SelectorState::Past
            | super::SelectorState::Paused
            | super::SelectorState::PictureInPicture
            | super::SelectorState::PlaceholderShown
            | super::SelectorState::Playing
            | super::SelectorState::PopoverOpen
            | super::SelectorState::Seeking
            | super::SelectorState::Stalled
            | super::SelectorState::TargetAfter
            | super::SelectorState::TargetBefore
            | super::SelectorState::TargetCurrent
            | super::SelectorState::Valid
            | super::SelectorState::UserInvalid
            | super::SelectorState::UserValid
            | super::SelectorState::XrOverlay
            | super::SelectorState::Visited
            | super::SelectorState::VolumeLocked,
        )
        | Pseudo::Dir(_)
        | Pseudo::JqueryPosition(_)
        | Pseudo::Jquery(_)
        | Pseudo::Extension(_, _)
        | Pseudo::Fullscreen
        | Pseudo::HasSlotted(..)
        | Pseudo::Host {
            selectors: None, ..
        } => true,
        Pseudo::Host {
            selectors: Some(list),
            ..
        } => list
            .iter()
            .all(|selector| supported_selector(selector, allow_scope, allow_language)),
        Pseudo::Scope => allow_scope,
        Pseudo::Lang(_) => allow_language,
        Pseudo::NthChild(a, b)
        | Pseudo::NthLastChild(a, b)
        | Pseudo::NthOfType(a, b)
        | Pseudo::NthLastOfType(a, b) => supported_anb(*a, *b),
        Pseudo::NthChildOf(a, b, list) | Pseudo::NthLastChildOf(a, b, list) => {
            supported_anb(*a, *b)
                && list
                    .iter()
                    .all(|selector| supported_selector(selector, false, allow_language))
        }
        Pseudo::Is(list) | Pseudo::Matches(list) | Pseudo::Where(list) => {
            list.iter().any(|selector| {
                supported_selector(selector, allow_scope, allow_language)
                    || selector_has_never_matching_namespace(selector)
            }) || list.is_empty()
        }
        Pseudo::Not(list) => list
            .iter()
            .all(|selector| supported_selector(selector, allow_scope, allow_language)),
        Pseudo::Has(list) => list.iter().all(|relative| {
            !matches!(relative.combinator, Combinator::Custom(_, None))
                && supported_selector(&relative.complex, false, allow_language)
        }),
        _ => false,
    }
}

/// A named namespace prefix cannot be resolved by the DOM selector API. Inside a forgiving
/// selector list, NWSAPI drops that branch; the Rust matcher also guarantees it cannot match.
fn selector_has_never_matching_namespace(selector: &Complex) -> bool {
    std::iter::once(&selector.first)
        .chain(selector.rest.iter().map(|(_, compound)| compound))
        .any(|compound| matches!(compound.namespace, TypeNamespace::Invalid))
}

fn supported_anb(a: i64, b: i64) -> bool {
    const LIMIT: i64 = 1 << 30;
    (-LIMIT..LIMIT).contains(&a) && (-LIMIT..LIMIT).contains(&b)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn units(source: &str) -> Vec<u16> {
        source.encode_utf16().collect()
    }

    #[test]
    fn host_snapshot_direct_lookups_preserve_scope_duplicates_and_xml_case() {
        let mut html = HostSnapshot::default();
        html.push(None, None, None, false, true, false).unwrap();
        html.push(
            Some(0),
            Some("main"),
            Some("http://www.w3.org/1999/xhtml"),
            false,
            false,
            false,
        )
        .unwrap();
        for _ in 0..2 {
            let row = html
                .push(
                    Some(1),
                    Some("p"),
                    Some("http://www.w3.org/1999/xhtml"),
                    false,
                    false,
                    false,
                )
                .unwrap();
            assert!(html.set_attribute(row, None, &units("id"), &units("duplicate")));
            assert!(html.set_attribute(row, None, &units("class"), &units("alpha beta")));
        }
        assert_eq!(html.by_id("duplicate", 1), Some(vec![2, 3]));
        assert_eq!(html.by_class("alpha beta", 1), Some(vec![2, 3]));
        assert_eq!(html.by_tag("P", 1), Some(vec![2, 3]));
        assert_eq!(html.by_id("main", 1), Some(Vec::new()));

        let mut xml = HostSnapshot::for_xml_document();
        xml.push(None, None, None, false, true, false).unwrap();
        xml.push(Some(0), Some("Item"), Some("urn:test"), false, false, false)
            .unwrap();
        xml.push(Some(0), Some("item"), Some("urn:test"), false, false, false)
            .unwrap();
        assert_eq!(xml.by_tag("Item", 0), Some(vec![1]));
        assert_eq!(xml.by_tag("item", 0), Some(vec![2]));
        assert_eq!(xml.by_tag("ITEM", 0), Some(Vec::new()));
    }

    #[test]
    fn inert_pseudo_elements_are_supported_without_matching_elements() {
        let tree = Tree::parse("");
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("p"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();

        for selector in ["p::before", "p::marker", "p::highlight(test)"] {
            let plan = tree
                .compile_host_selector_units(&units(selector))
                .unwrap_or_else(|| panic!("valid pseudo-element selector fell back: {selector}"));
            assert_eq!(
                snapshot.query("select", &plan, 0),
                Some(Vec::new()),
                "{selector}"
            );
        }

        let mixed = tree
            .compile_host_selector_units(&units("p::marker, p"))
            .unwrap();
        assert_eq!(snapshot.query("select", &mixed, 0), Some(vec![1]));
    }

    #[test]
    fn wildcard_namespace_operator_does_not_coerce_an_existing_nonmatching_attribute() {
        let tree = Tree::parse("");
        let mut snapshot = HostSnapshot::default();
        let document = snapshot.push(None, None, None, false, true, false).unwrap();
        let html = snapshot
            .push(
                Some(document),
                Some("html"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        let body = snapshot
            .push(
                Some(html),
                Some("body"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        let candidate = snapshot
            .push(
                Some(body),
                Some("p"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        assert!(snapshot.set_attribute(
            candidate,
            Some(&units("urn:test")),
            &units("x:data-missing"),
            &units("present"),
        ));

        for selector in [
            "[*|data-missing^=n]",
            "[*|data-missing$=l]",
            "[*|data-missing*=ull]",
        ] {
            tree.compile_selector(selector)
                .unwrap_or_else(|error| panic!("DOM selector rejected: {selector}: {error:?}"));
            let plan = tree
                .compile_host_selector_units(&units(selector))
                .unwrap_or_else(|| panic!("host selector rejected: {selector}"));
            assert_eq!(snapshot.query("select", &plan, document), Some(vec![]));
        }

        assert!(snapshot.set_attribute(
            candidate,
            Some(&units("urn:test")),
            &units("x:data-case"),
            &units("MiXeD"),
        ));
        assert!(snapshot.set_attribute(
            candidate,
            Some(&units("urn:test")),
            &units("x:type"),
            &units("null"),
        ));
        for (selector, expected) in [
            ("[*|data-case=\"mixed\"]", vec![]),
            ("[*|data-case=\"MiXeD\"]", vec![candidate]),
            ("[*|type=\"NULL\"]", vec![candidate]),
        ] {
            let plan = tree
                .compile_host_selector_units(&units(selector))
                .unwrap_or_else(|| panic!("host selector rejected: {selector}"));
            assert_eq!(snapshot.query("select", &plan, document), Some(expected));
        }
    }

    #[test]
    fn duplicate_id_policy_seeds_document_queries_but_keeps_element_queries_complete() {
        let tree = Tree::parse("");
        let plan = tree.compile_host_selector_units(&units("#x")).unwrap();
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("main"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        for (tag, row) in [("i", 2), ("b", 3)] {
            snapshot
                .push(
                    Some(1),
                    Some(tag),
                    Some("http://www.w3.org/1999/xhtml"),
                    false,
                    false,
                    false,
                )
                .unwrap();
            assert!(snapshot.set_attribute(row, None, &units("id"), &units("x")));
        }
        snapshot.set_ids_dupes(false);

        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![2]));
        assert_eq!(snapshot.query("select", &plan, 1), Some(vec![2, 3]));
    }

    #[test]
    fn host_snapshot_route_planner_setting_controls_bulk_has_dispatch() {
        fn reject_if_called(_: crate::HasFeatures) -> crate::HasRoute {
            panic!("disabled host route planner was called")
        }

        let tree = Tree::parse("");
        let plan = tree
            .compile_host_selector_units(&units(".anchor:has(> .witness)"))
            .unwrap();
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        for (parent, tag) in [
            (0, "main"),
            (1, "div"),
            (2, "span"),
            (1, "section"),
            (4, "div"),
        ] {
            snapshot
                .push(
                    Some(parent),
                    Some(tag),
                    Some("http://www.w3.org/1999/xhtml"),
                    false,
                    false,
                    false,
                )
                .unwrap();
        }
        assert!(snapshot.set_attribute(2, None, &units("class"), &units("anchor")));
        assert!(snapshot.set_attribute(3, None, &units("class"), &units("witness")));
        assert!(snapshot.set_attribute(5, None, &units("class"), &units("anchor")));
        snapshot.tree.set_bulk_has_planner(Some(reject_if_called));
        snapshot.set_route_planner(false);

        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![2]));
    }

    #[test]
    fn host_snapshot_accepts_capturing_bulk_has_planner() {
        let tree = Tree::parse("");
        let plan = tree
            .compile_host_selector_units(&units(".anchor:has(> .witness)"))
            .unwrap();
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        for (parent, tag) in [
            (0, "main"),
            (1, "div"),
            (2, "span"),
            (1, "section"),
            (4, "div"),
        ] {
            snapshot
                .push(
                    Some(parent),
                    Some(tag),
                    Some("http://www.w3.org/1999/xhtml"),
                    false,
                    false,
                    false,
                )
                .unwrap();
        }
        assert!(snapshot.set_attribute(2, None, &units("class"), &units("anchor")));
        assert!(snapshot.set_attribute(3, None, &units("class"), &units("witness")));
        assert!(snapshot.set_attribute(5, None, &units("class"), &units("anchor")));

        let expected_relationship = crate::HasRelationship::Child;
        let captured_route = String::from("inverse");
        snapshot.set_bulk_has_planner_with(move |features| {
            assert_eq!(features.relationship, expected_relationship);
            assert_eq!(features.anchors, 2);
            assert_eq!(features.witnesses, 1);
            if captured_route == "forward" {
                crate::HasRoute::Forward
            } else {
                crate::HasRoute::Inverse
            }
        });
        assert!(snapshot.has_custom_bulk_has_planner());
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![2]));
        snapshot.set_bulk_has_planner(None);
        assert!(!snapshot.has_custom_bulk_has_planner());
    }

    #[test]
    fn host_snapshot_uses_selected_model_for_eligible_data_ok_has_selectors() {
        let tree = Tree::parse("");
        let plan = tree
            .compile_host_selector_units(&units(".anchor[data-ok='1']:has(.witness[data-ok='1'])"))
            .expect("trained host-model selector should compile");
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("section"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(1),
                Some("i"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        for (row, name, value) in [
            (1, "class", "anchor"),
            (1, "data-ok", "1"),
            (2, "class", "witness"),
            (2, "data-ok", "1"),
        ] {
            assert!(snapshot.set_attribute(row, None, &units(name), &units(value)));
        }
        snapshot.set_route_planner_host(Some(nwsapi_has::has_policy::Host::Jsdom));
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![1]));
        snapshot.set_route_planner_host(None);
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![1]));
    }

    #[test]
    fn custom_has_planner_takes_precedence_over_host_model() {
        fn force_inverse(_: nwsapi_has::has_policy::Features) -> nwsapi_has::has_policy::Route {
            nwsapi_has::has_policy::Route::Inverse
        }

        let tree = Tree::parse("");
        let plan = tree
            .compile_host_selector_units(&units(".anchor[data-ok='1']:has(.witness[data-ok='1'])"))
            .unwrap();
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("section"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(1),
                Some("i"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        for (row, name, value) in [
            (1, "class", "anchor"),
            (1, "data-ok", "1"),
            (2, "class", "witness"),
            (2, "data-ok", "1"),
        ] {
            assert!(snapshot.set_attribute(row, None, &units(name), &units(value)));
        }
        snapshot.set_route_planner_host(Some(nwsapi_has::has_policy::Host::Chromium));
        snapshot.tree.set_bulk_has_planner(Some(force_inverse));
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![1]));
    }

    #[test]
    fn host_bridge_preserves_v3_empty_results_for_column_combinators() {
        let tree = Tree::parse("");
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        for selector in ["col || td", "td:has(|| td)", "p:nth-child(1 of col || td)"] {
            let plan = tree
                .compile_host_selector_units(&units(selector))
                .unwrap_or_else(|| panic!("host bridge should compile `{selector}`"));
            assert_eq!(
                snapshot.query("select", &plan, 0),
                Some(Vec::new()),
                "{selector}"
            );
        }
    }

    #[test]
    fn bridge_extensions_support_the_declarative_nwsapi_not_equal_operator() {
        let tree =
            Tree::parse("<p id=equal title=A></p><p id=different title=B></p><p id=missing></p>");
        let plan = tree
            .compile_host_selector_units_with_bridge_extensions(
                &units("p[title!=A]"),
                false,
                true,
                true,
            )
            .expect("declarative != should compile for a host bridge");
        assert_eq!(
            plan.select(&tree, None),
            [tree.get_element_by_id("different").unwrap()]
        );

        let insensitive = tree
            .compile_host_selector_units_with_bridge_extensions(
                &units("p[title!=a i]"),
                false,
                true,
                true,
            )
            .unwrap();
        assert_eq!(
            insensitive.select(&tree, None),
            [tree.get_element_by_id("different").unwrap()]
        );
        assert!(tree
            .compile_host_selector_units_with_bridge_extensions(
                &units("p[title!=A]"),
                false,
                false,
                true,
            )
            .is_none());
    }

    #[test]
    fn host_snapshots_run_registered_rust_selector_and_combinator_extensions() {
        fn featured(tree: &Tree, node: super::super::Handle, _: Option<&str>) -> bool {
            tree.has_attribute(node, "data-featured")
        }
        fn points_to(
            tree: &Tree,
            right: super::super::Handle,
            visit: &mut dyn FnMut(super::super::Handle) -> bool,
        ) -> bool {
            tree.get_attribute(right, "data-points-to")
                .and_then(|id| tree.get_element_by_id(id))
                .is_some_and(visit)
        }
        fn unequal(got: &[u16], wanted: &[u16], _: bool) -> bool {
            got != wanted
        }

        let mut extensions = super::super::SelectorExtensions::default();
        assert!(extensions.register_selector(
            "featured",
            super::super::SelectorArity::Flag,
            featured,
        ));
        assert!(extensions.register_combinator('!', points_to));
        assert!(extensions.register_operator("!=", unequal));
        let tree = Tree::parse("");
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("main"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(0),
                Some("span"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        let featured_attr = units("data-featured");
        let yes = units("");
        assert!(snapshot.set_attribute(1, None, &featured_attr, &yes));
        assert!(snapshot.set_attribute(1, None, &units("role"), &units("admin")));
        let ref_attr = units("data-points-to");
        let target = units("host");
        assert!(snapshot.set_attribute(2, None, &ref_attr, &target));
        // Give the referenced host an id so the native combinator can resolve it.
        assert!(snapshot.set_attribute(1, None, &units("id"), &units("host")));

        let plan = tree
            .compile_host_selector_units_with_extensions(
                &units("main:featured[role!=guest] ! span"),
                &extensions,
                true,
            )
            .expect("registered Rust extensions should be supported by the snapshot bridge");
        assert_eq!(snapshot.query("select", &plan, 0), Some(vec![2]));
    }

    #[test]
    fn host_snapshot_identity_combinator_composes_with_attribute_aliases() {
        let tree = Tree::parse("");
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        let p = snapshot
            .push(Some(0), Some("p"), None, false, false, false)
            .unwrap();
        snapshot.set_attribute(p, None, &units("id"), &units("pick"));
        for (source, expected) in [
            ("p!p[id@=pick]", vec![p]),
            ("div!p", vec![]),
            ("p!p!p", vec![p]),
        ] {
            let plan = tree
                .compile_host_selector_units_with_bridge_operator(
                    &units(source),
                    false,
                    false,
                    Some("!CI@=="),
                    true,
                )
                .unwrap();
            assert_eq!(snapshot.query("select", &plan, 0), Some(expected));
        }
        for invalid in ["!C", "!CX", "!CI!CI", ">CI"] {
            assert!(tree
                .compile_host_selector_units_with_bridge_operator(
                    &units("p!p"),
                    false,
                    false,
                    Some(invalid),
                    true,
                )
                .is_none());
        }
    }

    #[test]
    fn invalid_pseudo_element_selectors_still_fall_back() {
        let tree = Tree::parse("");
        for selector in ["p::bogus", "p::before > span", "p::before:first-child"] {
            assert!(
                tree.compile_host_selector_units(&units(selector)).is_none(),
                "{selector}"
            );
        }
    }

    #[test]
    fn empty_forgiving_selector_lists_are_supported_and_never_match() {
        let tree = Tree::parse("");
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("p"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();

        for selector in [":is()", ":where()", "p:nth-child(1 of ::before)"] {
            let plan = tree
                .compile_host_selector_units(&units(selector))
                .unwrap_or_else(|| panic!("empty forgiving list fell back: {selector}"));
            assert_eq!(snapshot.query("select", &plan, 0), Some(Vec::new()));
        }
    }

    #[test]
    fn jquery_host_plugin_is_opt_in_and_reads_host_visibility_and_children() {
        let tree = Tree::parse("");
        assert!(tree.compile_host_selector_units(&units("p:even")).is_none());
        let even = tree
            .compile_host_selector_units_with_jquery(&units("p:even"), true)
            .unwrap();
        let even_then_odd = tree
            .compile_host_selector_units_with_jquery(&units("p:even:odd"), true)
            .unwrap();
        let odd_then_even = tree
            .compile_host_selector_units_with_jquery(&units("p:odd:even"), true)
            .unwrap();
        let second_then_lt = tree
            .compile_host_selector_units_with_jquery(&units("p:eq(1):lt(3)"), true)
            .unwrap();
        let hidden = tree
            .compile_host_selector_units_with_jquery(&units("p:hidden"), true)
            .unwrap();
        let parent = tree
            .compile_host_selector_units_with_jquery(&units("p:parent"), true)
            .unwrap();

        let mut snapshot = HostSnapshot::default();
        assert_eq!(snapshot.push(None, None, None, false, true, false), Some(0));
        assert_eq!(
            snapshot.push(
                Some(0),
                Some("html"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false
            ),
            Some(1)
        );
        assert_eq!(
            snapshot.push(
                Some(1),
                Some("p"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false
            ),
            Some(2)
        );
        assert_eq!(
            snapshot.push(
                Some(1),
                Some("p"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false
            ),
            Some(3)
        );
        assert!(snapshot.set_has_child(2, true));
        assert_eq!(snapshot.query("select", &even, 0), Some(vec![2]));
        assert_eq!(
            snapshot.query("select", &even_then_odd, 0),
            Some(vec![2, 3])
        );
        assert_eq!(snapshot.query("select", &odd_then_even, 0), Some(vec![3]));
        assert_eq!(snapshot.query("select", &second_then_lt, 0), Some(vec![3]));
        assert_eq!(snapshot.query("select", &hidden, 0), Some(vec![2, 3]));
        assert_eq!(snapshot.query("select", &parent, 0), Some(vec![2]));
    }

    #[test]
    fn host_selector_compilation_obeys_forgiving_list_configuration() {
        let tree = Tree::parse("");
        let invalid_branch = units("p:is(.valid, :unknown)");
        assert!(tree
            .compile_host_selector_units_with_options(&invalid_branch, false, true)
            .is_some());
        assert!(tree
            .compile_host_selector_units_with_options(&invalid_branch, false, false)
            .is_none());
        let jquery_extension = units("p:even");
        assert!(tree
            .compile_host_selector_units_with_options(&jquery_extension, true, false)
            .is_some());
    }

    #[test]
    fn host_traversal_matches_selector_and_index_plugin_contracts() {
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("html"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(1),
                Some("main"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(2),
                Some("p"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(2),
                Some("button"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        let tree = Tree::parse("");
        let button = tree.compile_host_selector_units(&units("button")).unwrap();
        let any = tree.compile_host_selector_units(&units("*")).unwrap();

        assert_eq!(snapshot.traverse("up", 3, Some(&any), None), Some(2));
        assert_eq!(snapshot.traverse("up", 3, None, Some(0)), Some(2));
        assert_eq!(snapshot.traverse("next", 3, Some(&button), None), Some(4));
        assert_eq!(snapshot.traverse("next", 3, None, Some(0)), Some(4));
        assert_eq!(snapshot.traverse("previous", 4, None, Some(0)), Some(3));
        assert_eq!(snapshot.traverse("down", 2, None, None), Some(3));
        assert_eq!(snapshot.traverse("down", 2, None, Some(0)), Some(2));
        assert_eq!(snapshot.traverse("down", 2, Some(&button), None), Some(4));
        assert_eq!(snapshot.traverse("down", 2, None, Some(2)), Some(4));
    }

    #[test]
    fn host_state_updates_are_atomic_and_accept_existing_custom_states() {
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("button"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();

        assert!(snapshot.set_host_states(1, &["state:ready".into()]));
        assert!(snapshot.set_host_states(1, &["state:ready".into()]));
        let tree = Tree::parse("");
        let ready = tree
            .compile_host_selector_units(&units(":state(ready)"))
            .unwrap();
        assert_eq!(snapshot.query("select", &ready, 0), Some(vec![1]));

        assert!(!snapshot.set_host_states(1, &["hover".into(), "unknown".into()]));
        let hover = tree.compile_host_selector_units(&units(":hover")).unwrap();
        assert_eq!(snapshot.query("select", &hover, 0), Some(Vec::new()));
    }

    #[test]
    fn host_snapshots_match_dynamic_modal_popover_media_and_open_states() {
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("html"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(1),
                Some("dialog"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(1),
                Some("div"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(1),
                Some("video"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(1),
                Some("input"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(1),
                Some("a"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        assert!(snapshot.set_attribute(3, None, &units("popover"), &units("")));
        assert!(snapshot.set_attribute(5, None, &units("placeholder"), &units("value")));
        assert!(snapshot.set_attribute(5, None, &units("readonly"), &units("")));
        assert!(snapshot.set_attribute(6, None, &units("href"), &units("#target")));
        assert!(snapshot.set_host_states(2, &["modal".into(), "fullscreen".into()]));
        assert!(snapshot.set_host_states(3, &["popover-open".into(), "open".into()]));
        assert!(snapshot.set_host_states(4, &["playing".into(), "muted".into()]));
        assert!(snapshot.set_host_states(2, &["closed".into()]));
        assert!(snapshot.set_host_states(
            5,
            &[
                "active-view-transition".into(),
                "autofill".into(),
                "buffering".into(),
                "current".into(),
                "default".into(),
                "focus".into(),
                "focus-visible".into(),
                "focus-within".into(),
                "fullscreen-ancestor".into(),
                "future".into(),
                "hover".into(),
                "indeterminate".into(),
                "interest-source".into(),
                "interest-target".into(),
                "in-range".into(),
                "invalid".into(),
                "out-of-range".into(),
                "past".into(),
                "paused".into(),
                "placeholder-shown".into(),
                "seeking".into(),
                "stalled".into(),
                "target-after".into(),
                "target-before".into(),
                "target-current".into(),
                "user-valid".into(),
                "user-invalid".into(),
                "volume-locked".into(),
                "xr-overlay".into(),
                "state:ready".into(),
            ],
        ));
        assert!(snapshot.set_host_states(6, &["visited".into()]));
        assert!(snapshot.set_host_states(5, &["functional::current(.chapter)".into()]));
        assert!(snapshot.set_host_states(
            5,
            &[
                "functional::current(:is(.other, .chapter))".into(),
                "functional::current(:is(:current(.inner), .chapter))".into(),
                "functional::current(.inner)".into(),
            ]
        ));
        assert!(snapshot.set_host_states(
            4,
            &["functional::active-view-transition-type(fade, slide)".into()]
        ));

        for (selector, expected) in [
            (":modal", vec![2]),
            (":fullscreen", vec![2]),
            (":-webkit-full-screen", vec![2]),
            (":closed", vec![2]),
            (":popover-open", vec![3]),
            (":open", vec![3]),
            (":playing", vec![4]),
            (":muted", vec![4]),
            (":visited", vec![6]),
            (":active-view-transition", vec![5]),
            ("input:read-only", vec![5]),
            (":autofill", vec![5]),
            (":current", vec![5]),
            (":-webkit-autofill", vec![5]),
            (":indeterminate", vec![5]),
            (":interest-source", vec![5]),
            (":interest-target", vec![5]),
            (":-webkit-full-screen-ancestor", vec![5]),
            (":placeholder-shown", vec![5]),
            (":target-after", vec![5]),
            (":target-before", vec![5]),
            (":target-current", vec![5]),
            (":user-valid", vec![5]),
            (":user-invalid", vec![5]),
            (":xr-overlay", vec![5]),
            (":visited", vec![6]),
            (":current(.chapter)", vec![5]),
            (
                ":is(:current(.chapter), :current(:is(.other, .chapter)))",
                vec![5],
            ),
            (":current(:is(:current(.inner), .chapter))", vec![5]),
            (":active-view-transition-type(fade, slide)", vec![4]),
        ] {
            let plan = Tree::parse("")
                .compile_host_selector_units(&units(selector))
                .unwrap_or_else(|| panic!("host selector rejected: {selector}"));
            assert_eq!(snapshot.query("select", &plan, 0), Some(expected));
        }
        for state in [
            "active-view-transition",
            "autofill",
            "buffering",
            "current",
            "default",
            "focus",
            "focus-visible",
            "focus-within",
            "fullscreen-ancestor",
            "future",
            "hover",
            "indeterminate",
            "interest-source",
            "interest-target",
            "in-range",
            "invalid",
            "out-of-range",
            "past",
            "paused",
            "placeholder-shown",
            "seeking",
            "stalled",
            "target-after",
            "target-before",
            "target-current",
            "user-valid",
            "user-invalid",
            "volume-locked",
            "xr-overlay",
            "state(ready)",
        ] {
            let selector = format!(":{state}");
            let plan = Tree::parse("")
                .compile_host_selector_units(&units(&selector))
                .unwrap_or_else(|| panic!("host selector rejected: {selector}"));
            assert_eq!(
                snapshot.query("select", &plan, 0),
                Some(vec![5]),
                "{selector}"
            );
        }
    }
    #[test]
    fn host_shadow_snapshot_uses_host_reported_assigned_slot_state() {
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, false, true).unwrap();
        snapshot
            .push(
                Some(0),
                Some("slot"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        assert!(snapshot.set_host_states(
            1,
            &[
                "has-slotted".into(),
                "has-slotted-selector:.assigned".into(),
            ],
        ));
        let tree = Tree::parse("");
        for selector in [":has-slotted", ":has-slotted(.assigned)"] {
            let plan = tree.compile_host_selector_units(&units(selector)).unwrap();
            assert_eq!(snapshot.query("select", &plan, 0), Some(vec![1]));
        }
        for selector in [":host", ":host(#host)", ":host-context(body)"] {
            let plan = tree.compile_host_selector_units(&units(selector)).unwrap();
            assert_eq!(snapshot.query("select", &plan, 0), Some(Vec::new()));
        }
        let missing = tree
            .compile_host_selector_units(&units(":has-slotted(.missing)"))
            .unwrap();
        assert_eq!(snapshot.query("select", &missing, 0), Some(Vec::new()));
        let slotted = tree
            .compile_host_selector_units(&units("::slotted(*)"))
            .expect("valid slotted pseudo-element should be supported");
        assert_eq!(snapshot.query("select", &slotted, 0), Some(Vec::new()));
    }

    #[test]
    fn host_selector_compilation_accepts_shadow_only_forms() {
        let tree = Tree::parse("");
        for selector in [":host", ":host(#host)", ":host-context(body)"] {
            assert!(
                tree.compile_host_selector_units(&units(selector)).is_some(),
                "host-only selector should compile: {selector}"
            );
        }
    }

    #[test]
    fn host_context_selectors_match_across_the_shadow_boundary() {
        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, true, false).unwrap();
        snapshot
            .push(
                Some(0),
                Some("html"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(1),
                Some("body"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(2),
                Some("main"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        snapshot
            .push(
                Some(3),
                Some("div"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        assert!(snapshot.set_attribute(4, None, &units("id"), &units("shadow-host")));
        assert_eq!(
            snapshot.push(Some(4), None, None, false, false, true),
            Some(5)
        );
        snapshot
            .push(
                Some(5),
                Some("slot"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();

        let tree = Tree::parse("");
        for selector in [
            ":host > slot",
            ":host(#shadow-host) > slot",
            ":host-context(body) > slot",
        ] {
            let plan = tree.compile_host_selector_units(&units(selector)).unwrap();
            assert_eq!(
                snapshot.query("select", &plan, 5),
                Some(vec![6]),
                "{selector}"
            );
        }
        let host_only = tree.compile_host_selector_units(&units(":host")).unwrap();
        assert_eq!(snapshot.query("select", &host_only, 5), Some(Vec::new()));
    }

    #[test]
    fn shadow_language_uses_complete_document_ancestry_and_falls_back_without_it() {
        let mut complete = HostSnapshot::default();
        complete.push(None, None, None, false, true, false).unwrap();
        complete
            .push(
                Some(0),
                Some("html"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        complete
            .push(
                Some(1),
                Some("div"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        assert!(complete.set_attribute(2, None, &units("lang"), &units("en")));
        complete
            .push(Some(2), None, None, false, false, true)
            .unwrap();
        complete
            .push(
                Some(3),
                Some("slot"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        let tree = Tree::parse("");
        let language = tree
            .compile_host_selector_units(&units(":lang(en)"))
            .unwrap();
        assert_eq!(complete.query("select", &language, 3), Some(vec![4]));

        let mut snapshot = HostSnapshot::default();
        snapshot.push(None, None, None, false, false, true).unwrap();
        snapshot
            .push(
                Some(0),
                Some("span"),
                Some("http://www.w3.org/1999/xhtml"),
                false,
                false,
                false,
            )
            .unwrap();
        let language = Tree::parse("")
            .compile_host_selector_units(&units(":lang(en)"))
            .unwrap();
        let tag = Tree::parse("")
            .compile_host_selector_units(&units("span"))
            .unwrap();

        assert_eq!(snapshot.query("traverse:down:selector", &language, 0), None,);
        assert_eq!(
            snapshot.query("traverse:down:selector", &tag, 0),
            Some(vec![1]),
        );
    }
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum HostDocumentKind {
    Html,
    Xml,
}

/// A preorder snapshot of a host tree, keyed by the host's row indexes.
pub struct HostSnapshot {
    tree: Tree,
    fragment: super::Handle,
    nodes: Vec<super::Handle>,
    indexes: rustc_hash::FxHashMap<super::Handle, u32>,
    shadow_root: bool,
}

impl Default for HostSnapshot {
    fn default() -> Self {
        Self::from_html_tree(Tree::parse("<!doctype html>"))
    }
}

impl HostSnapshot {
    /// Build a host snapshot using HTML quirks-mode selector matching.
    #[must_use]
    pub fn for_quirks_document() -> Self {
        Self::from_html_tree(Tree::parse(""))
    }

    fn from_html_tree(mut tree: Tree) -> Self {
        let document = tree.root();
        for child in tree.children(document) {
            tree.remove_child(document, child);
        }
        tree.host_document = Some(HostDocumentKind::Html);
        let fragment = tree.create_document_fragment();
        Self {
            tree,
            fragment,
            nodes: Vec::new(),
            indexes: rustc_hash::FxHashMap::default(),
            shadow_root: false,
        }
    }
}

impl HostSnapshot {
    /// Find host snapshot descendants containing every CSS-whitespace-delimited class token.
    #[must_use]
    pub fn by_class(&self, classes: &str, context: u32) -> Option<Vec<u32>> {
        let root = *self.nodes.get(context as usize)?;
        Some(
            self.tree
                .by_class(Some(root), classes)
                .iter()
                .filter_map(|node| self.indexes.get(node).copied())
                .collect(),
        )
    }

    /// Find host snapshot descendants with the exact ID in tree order.
    #[must_use]
    pub fn by_id(&self, id: &str, context: u32) -> Option<Vec<u32>> {
        let root = *self.nodes.get(context as usize)?;
        Some(
            self.tree
                .by_id(Some(root), id)
                .iter()
                .filter_map(|node| self.indexes.get(node).copied())
                .collect(),
        )
    }

    /// Find host snapshot descendants by local tag name, or all elements for `*`.
    #[must_use]
    pub fn by_tag(&self, tag: &str, context: u32) -> Option<Vec<u32>> {
        let root = *self.nodes.get(context as usize)?;
        Some(
            self.tree
                .by_tag(Some(root), tag)
                .iter()
                .filter_map(|node| self.indexes.get(node).copied())
                .collect(),
        )
    }

    /// Match the host engine's duplicate-ID policy for document-rooted queries.
    pub fn set_ids_dupes(&mut self, enabled: bool) {
        self.tree.selector_config.ids_dupes = enabled;
    }

    /// Enable or disable the native bulk `:has()` route planner.
    pub fn set_route_planner(&mut self, enabled: bool) {
        self.tree.selector_config.route_planner = enabled;
    }

    /// Select the trained route planner matching the host implementation.
    pub fn set_route_planner_host(&mut self, host: Option<nwsapi_has::has_policy::Host>) {
        self.tree.set_bulk_has_host_policy(host);
    }

    /// Set a native bulk `:has()` planner for this host snapshot.
    ///
    /// Pass `None` to restore the built-in policy. A custom planner takes
    /// precedence over the selected host model.
    pub fn set_bulk_has_planner(&mut self, planner: Option<crate::BulkHasPlanner>) {
        self.tree.set_bulk_has_planner(planner);
    }

    /// Set a capturing native bulk `:has()` planner for this host snapshot.
    ///
    /// The closure owns its state and remains installed until replaced or
    /// cleared with `set_bulk_has_planner(None)`.
    pub fn set_bulk_has_planner_with(
        &mut self,
        planner: impl Fn(nwsapi_has::has_policy::Features) -> nwsapi_has::has_policy::Route + 'static,
    ) {
        self.tree.set_bulk_has_planner_with(planner);
    }

    /// Whether this snapshot has a custom native bulk `:has()` planner.
    #[must_use]
    pub fn has_custom_bulk_has_planner(&self) -> bool {
        self.tree.has_custom_bulk_has_planner()
    }

    /// Create an XML snapshot with case-sensitive selector names.
    #[must_use]
    pub fn for_xml_document() -> Self {
        let mut snapshot = Self::default();
        snapshot.tree.host_document = Some(HostDocumentKind::Xml);
        snapshot
    }

    /// Append an element, or an untagged root representing a document or fragment.
    /// Set the document flag only for the first row of a document snapshot.
    /// A non-root row must name an earlier row as its parent.
    pub fn push(
        &mut self,
        parent: Option<u32>,
        tag: Option<&str>,
        namespace: Option<&str>,
        has_text_child: bool,
        document: bool,
        shadow_root: bool,
    ) -> Option<u32> {
        let index = u32::try_from(self.nodes.len()).ok()?;
        if (shadow_root && (document || tag.is_some())) || (tag.is_none() && namespace.is_some()) {
            return None;
        }
        let node = if document {
            if index != 0 || tag.is_some() || parent.is_some() {
                return None;
            }
            self.tree.root()
        } else if let Some(tag) = tag {
            let parent = match parent {
                Some(parent) => *self.nodes.get(parent as usize)?,
                None if index == 0 => self.fragment,
                None => return None,
            };
            let node = if let Some(namespace) = namespace {
                self.tree.create_element_namespace(Some(namespace), tag)
            } else {
                self.tree.create_element(tag)
            };
            self.tree.append_child(parent, node);
            if has_text_child {
                // V3's empty test counts any text child, even a zero-length node.
                let text = self.tree.create_text_node(" ");
                self.tree.append_child(node, text);
            }
            node
        } else if shadow_root {
            match parent {
                Some(parent) => self.tree.attach_shadow(*self.nodes.get(parent as usize)?),
                None if index == 0 => self.fragment,
                _ => return None,
            }
        } else {
            if index != 0 || parent.is_some() {
                return None;
            }
            self.fragment
        };
        self.shadow_root |= shadow_root;
        self.indexes.insert(node, index);
        self.nodes.push(node);
        Some(index)
    }

    /// Set a snapshot element's attribute using its exact namespace, name and value.
    pub fn set_attribute(
        &mut self,
        row: u32,
        namespace: Option<&[u16]>,
        name: &[u16],
        value: &[u16],
    ) -> bool {
        let Some(&node) = self.nodes.get(row as usize) else {
            return false;
        };
        if self.tree.node_type(node) != super::NodeType::Element {
            return false;
        }
        self.tree
            .set_attribute_ns_units(node, namespace, name, value);
        true
    }

    /// Apply a live boolean form property captured from the host DOM.
    pub fn set_form_property(&mut self, row: u32, prop: super::FormProp, value: bool) -> bool {
        let Some(&node) = self.nodes.get(row as usize) else {
            return false;
        };
        if self.tree.node_type(node) != super::NodeType::Element {
            return false;
        }
        self.tree.set_form_property(node, prop, value);
        true
    }

    /// Preserve whether an element has any direct child node for the jQuery `:parent` plugin.
    pub fn set_has_child(&mut self, row: u32, value: bool) -> bool {
        let Some(&node) = self.nodes.get(row as usize) else {
            return false;
        };
        if self.tree.node_type(node) != super::NodeType::Element {
            return false;
        }
        if value && self.tree.children(node).is_empty() {
            let comment = self.tree.create_comment("");
            self.tree.append_child(node, comment);
        }
        true
    }

    /// Apply a host-reported selector state to one snapshot element.
    pub fn set_selector_state(
        &mut self,
        row: u32,
        state: super::SelectorState,
        value: bool,
    ) -> bool {
        let Some(&node) = self.nodes.get(row as usize) else {
            return false;
        };
        if self.tree.node_type(node) != super::NodeType::Element {
            return false;
        }
        self.tree.set_selector_state(node, state, value);
        true
    }

    /// Apply named host selector states from the v3 DOM helper layer.
    pub fn set_host_states(&mut self, row: u32, states: &[String]) -> bool {
        let Some(&node) = self.nodes.get(row as usize) else {
            return false;
        };
        if self.tree.node_type(node) != super::NodeType::Element {
            return false;
        }
        if states.iter().any(|name| !valid_host_state_name(name)) {
            return false;
        }
        for name in states {
            if let Some(selector) = name.strip_prefix("functional:") {
                self.tree.set_host_functional_state(node, selector, true);
                continue;
            }
            if let Some(selector) = name.strip_prefix("has-slotted-selector:") {
                self.tree.set_host_slotted_selector(node, selector, true);
                continue;
            }
            if name == "has-slotted" {
                self.tree
                    .set_selector_state(node, super::SelectorState::HostHasSlotted, true);
                continue;
            }
            if let Some(value) = name.strip_prefix("state:") {
                let value: Vec<u16> = value.encode_utf16().collect();
                // `set_custom_state_utf16` reports whether membership changed, so
                // false also means an already-present state. The preflight above
                // guarantees this row and state name are valid.
                self.tree.set_custom_state_utf16(node, &value, true);
                continue;
            }
            let state = super::SelectorState::from_pseudo(name).expect("prevalidated state");
            self.tree.set_selector_state(node, state, true);
        }
        true
    }

    /// Apply the v3 host-computed HTML directionality for one element.
    pub fn set_directionality(&mut self, row: u32, direction: &str) -> bool {
        let Some(&node) = self.nodes.get(row as usize) else {
            return false;
        };
        if self.tree.node_type(node) != super::NodeType::Element {
            return false;
        }
        let rtl = match direction {
            "ltr" => false,
            "rtl" => true,
            _ => return false,
        };
        self.tree
            .set_selector_state(node, super::SelectorState::HostDirectionRtl, rtl);
        self.tree
            .set_selector_state(node, super::SelectorState::HostDirectionLtr, !rtl);
        true
    }

    /// Apply the host registry's custom-element definition state to one element.
    pub fn set_custom_element_defined(&mut self, row: u32, defined: bool) -> bool {
        let Some(&node) = self.nodes.get(row as usize) else {
            return false;
        };
        if self.tree.node_type(node) != super::NodeType::Element {
            return false;
        }
        if self.tree.namespace_uri(node) != Some("http://www.w3.org/1999/xhtml") {
            return true;
        }
        let custom_name = self
            .tree
            .local_name(node)
            .is_some_and(|name| name.contains('-'));
        if !custom_name && !self.tree.has_attribute(node, "is") {
            self.tree
                .set_custom_element_state(node, crate::rtdom::CustomElementState::Uncustomized);
            return true;
        }
        let state = if defined {
            crate::rtdom::CustomElementState::Custom
        } else {
            crate::rtdom::CustomElementState::Undefined
        };
        self.tree.set_custom_element_state(node, state);
        true
    }

    /// Run a compiled host selector and return the matching original row indexes.
    #[must_use]
    pub fn query(&self, method: &str, plan: &CompiledSelector, context: u32) -> Option<Vec<u32>> {
        // Shadow-root queries can inherit language from the host. Use the Rust
        // matcher only when the snapshot includes the document ancestry; a
        // detached shadow snapshot must let the host decide.
        let complete_document_ancestry = self
            .nodes
            .first()
            .is_some_and(|node| self.tree.node_type(*node) == super::NodeType::Document);
        let supported_in_shadow = if plan_has_pseudo_element(plan) {
            supported_plan_with_pseudo_elements(plan)
        } else {
            plan.0
                .selectors
                .iter()
                .all(|selector| supported_selector(selector, true, complete_document_ancestry))
        };
        if self.shadow_root && !supported_in_shadow {
            return None;
        }
        if let Some(traversal) = method.strip_prefix("traverse:") {
            let (direction, target) = traversal.split_once(':')?;
            let result = match target {
                "none" => self.traverse(direction, context, None, None),
                "selector" => self.traverse(direction, context, Some(plan), None),
                value if value.starts_with("index:") => self.traverse(
                    direction,
                    context,
                    None,
                    Some(value.strip_prefix("index:")?.parse().ok()?),
                ),
                _ => return None,
            };
            return Some(result.into_iter().collect());
        }
        let node = *self.nodes.get(context as usize)?;
        let one = |result: Option<super::Handle>| {
            result.and_then(|handle| self.indexes.get(&handle).copied())
        };
        match method {
            "match" => Some(
                plan.matches(&self.tree, node)
                    .then_some(context)
                    .into_iter()
                    .collect(),
            ),
            "closest" => Some(one(plan.closest(&self.tree, node)).into_iter().collect()),
            "first" => Some(
                one(plan.first(&self.tree, Some(node)))
                    .into_iter()
                    .collect(),
            ),
            "select" => plan
                .select(&self.tree, Some(node))
                .iter()
                .map(|handle| self.indexes.get(handle).copied())
                .collect(),
            _ => None,
        }
    }

    /// Traverse a host snapshot from one original row using the NWSAPI
    /// traversal extension's selector or zero-based index semantics.
    #[must_use]
    pub fn traverse(
        &self,
        method: &str,
        context: u32,
        selector: Option<&CompiledSelector>,
        index: Option<usize>,
    ) -> Option<u32> {
        let node = *self.nodes.get(context as usize)?;
        let target = match (selector, index) {
            (Some(plan), None) => Some(super::TraversalTarget::Selector(plan)),
            (None, Some(index)) => Some(super::TraversalTarget::Index(index)),
            (None, None) if method == "down" => None,
            _ => return None,
        };
        let result = match method {
            "up" => self.tree.up(node, target?),
            "down" => self.tree.down(node, target),
            "next" => self.tree.next(node, target?),
            "previous" => self.tree.previous(node, target?),
            _ => return None,
        }?;
        self.indexes.get(&result).copied()
    }
}

fn valid_host_state_name(name: &str) -> bool {
    if let Some(selector) = name.strip_prefix("functional:") {
        return matches!(
            selector.split_once('(').map(|(name, _)| name),
            Some(":current" | ":active-view-transition-type")
        ) && selector.ends_with(')');
    }
    if let Some(selector) = name.strip_prefix("has-slotted-selector:") {
        return !selector.is_empty();
    }
    if name == "has-slotted" {
        return true;
    }
    if let Some(value) = name.strip_prefix("state:") {
        return !value.is_empty();
    }
    let Some(state) = super::SelectorState::from_pseudo(name) else {
        return false;
    };
    matches!(
        state,
        super::SelectorState::Active
            | super::SelectorState::ActiveViewTransition
            | super::SelectorState::Autofill
            | super::SelectorState::Buffering
            | super::SelectorState::Closed
            | super::SelectorState::Current
            | super::SelectorState::Default
            | super::SelectorState::Focus
            | super::SelectorState::FocusVisible
            | super::SelectorState::FocusWithin
            | super::SelectorState::Future
            | super::SelectorState::Fullscreen
            | super::SelectorState::FullscreenAncestor
            | super::SelectorState::Hover
            | super::SelectorState::Indeterminate
            | super::SelectorState::InterestSource
            | super::SelectorState::InterestTarget
            | super::SelectorState::InRange
            | super::SelectorState::Invalid
            | super::SelectorState::Modal
            | super::SelectorState::Muted
            | super::SelectorState::Open
            | super::SelectorState::OutOfRange
            | super::SelectorState::Past
            | super::SelectorState::Paused
            | super::SelectorState::PictureInPicture
            | super::SelectorState::PlaceholderShown
            | super::SelectorState::Playing
            | super::SelectorState::PopoverOpen
            | super::SelectorState::Seeking
            | super::SelectorState::Stalled
            | super::SelectorState::TargetAfter
            | super::SelectorState::TargetBefore
            | super::SelectorState::TargetCurrent
            | super::SelectorState::Valid
            | super::SelectorState::UserInvalid
            | super::SelectorState::UserValid
            | super::SelectorState::Visited
            | super::SelectorState::VolumeLocked
            | super::SelectorState::XrOverlay
    )
}
