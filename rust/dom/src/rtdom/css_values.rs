//! Chrome-compatible CSS value grammars shared by the browser binding
//! (`turbo-dom-browser-env`'s CSSOM, `CSS.supports`) and native layout
//! consumers, so every consumer parses `zoom` with exactly one grammar.
//!
//! Moved verbatim from the browser binding's `cssom_parser.rs`
//! (miaskiewicz/turbo-test@cb5c64e); the binding re-exports these items.
use cssparser::{ParseError, Parser, ParserInput};

/// Chrome156 standardized `zoom`: `normal`, a non-negative `<number>` or
/// `<percentage>`, or one `calc()` of either kind. Returns Chrome's specified-value
/// serialization and the factor it computes to (zero still means "no zoom").
#[must_use]
pub fn zoom_value(source: &str) -> Option<(String, f32)> {
    let mut source = ParserInput::new(source);
    let mut input = Parser::new(&mut source);
    let value = zoom_component(&mut input).ok()?;
    input.expect_exhausted().ok()?;
    Some(value)
}

#[derive(Clone, Copy, PartialEq)]
enum ZoomKind {
    Number,
    Percentage,
}

type ZoomResult<'i> = Result<(String, f32), ParseError<'i, ()>>;

fn zoom_component<'i>(input: &mut Parser<'i, '_>) -> ZoomResult<'i> {
    input.skip_whitespace();
    let location = input.current_source_location();
    let start = input.position();
    match input.next()?.clone() {
        cssparser::Token::Ident(name) if name.eq_ignore_ascii_case("normal") => {
            Ok(("normal".into(), 1.0))
        }
        cssparser::Token::Number { value, .. } if value >= 0.0 => Ok((css_number(value), value)),
        cssparser::Token::Percentage { unit_value, .. } if unit_value >= 0.0 => {
            let percent = percentage(input.slice_from(start), unit_value);
            Ok((format!("{}%", css_number(percent)), ratio(percent)))
        }
        cssparser::Token::Function(name) if name.eq_ignore_ascii_case("calc") => input
            .parse_nested_block(|input| {
                let (value, kind) = calc_sum(input)?;
                input.expect_exhausted()?;
                let suffix = if kind == ZoomKind::Percentage {
                    "%"
                } else {
                    ""
                };
                let factor = if kind == ZoomKind::Percentage {
                    ratio(value)
                } else {
                    value
                };
                Ok((
                    format!("calc({}{suffix})", css_number(value)),
                    factor.max(0.0),
                ))
            }),
        _ => Err(location.new_custom_error(())),
    }
}

// Blink keeps the authored percentage as a float and divides it for the factor;
// the tokenizer's pre-divided unit value would round differently.
fn percentage(token: &str, unit_value: f32) -> f32 {
    token
        .trim()
        .trim_end_matches('%')
        .parse()
        .unwrap_or_else(|_| (f64::from(unit_value) * 100.0) as f32)
}
fn ratio(percent: f32) -> f32 {
    (f64::from(percent) / 100.0) as f32
}

fn calc_sum<'i>(input: &mut Parser<'i, '_>) -> Result<(f32, ZoomKind), ParseError<'i, ()>> {
    let (mut total, kind) = calc_product(input)?;
    while let Ok(sign) = input.try_parse(|input| match input.next()?.clone() {
        cssparser::Token::Delim(sign @ ('+' | '-')) => Ok(sign),
        _ => Err(input.new_custom_error::<_, ()>(())),
    }) {
        let (value, other) = calc_product(input)?;
        if other != kind {
            return Err(input.new_custom_error(()));
        }
        total = if sign == '+' {
            total + value
        } else {
            total - value
        };
    }
    Ok((total, kind))
}

fn calc_product<'i>(input: &mut Parser<'i, '_>) -> Result<(f32, ZoomKind), ParseError<'i, ()>> {
    let (mut total, mut kind) = calc_value(input)?;
    while let Ok(operator) = input.try_parse(|input| match input.next()?.clone() {
        cssparser::Token::Delim(operator @ ('*' | '/')) => Ok(operator),
        _ => Err(input.new_custom_error::<_, ()>(())),
    }) {
        let (value, other) = calc_value(input)?;
        match (operator, kind, other) {
            ('*', _, ZoomKind::Number) => total *= value,
            ('*', ZoomKind::Number, ZoomKind::Percentage) => {
                total *= value;
                kind = ZoomKind::Percentage;
            }
            ('/', _, ZoomKind::Number) if value != 0.0 => total /= value,
            _ => return Err(input.new_custom_error(())),
        }
    }
    Ok((total, kind))
}

fn calc_value<'i>(input: &mut Parser<'i, '_>) -> Result<(f32, ZoomKind), ParseError<'i, ()>> {
    input.skip_whitespace();
    let location = input.current_source_location();
    let start = input.position();
    match input.next()?.clone() {
        cssparser::Token::Number { value, .. } => Ok((value, ZoomKind::Number)),
        cssparser::Token::Percentage { unit_value, .. } => Ok((
            percentage(input.slice_from(start), unit_value),
            ZoomKind::Percentage,
        )),
        cssparser::Token::ParenthesisBlock => input.parse_nested_block(calc_sum),
        cssparser::Token::Function(name) if name.eq_ignore_ascii_case("calc") => {
            input.parse_nested_block(calc_sum)
        }
        _ => Err(location.new_custom_error(())),
    }
}

/// Blink's CSS number serialization: six significant digits (printf `%g`).
#[must_use]
pub fn css_number(value: f32) -> String {
    let value = f64::from(value);
    if value == 0.0 || !value.is_finite() {
        return "0".into();
    }
    let exponent = value.abs().log10().floor() as i32;
    if !(-5..6).contains(&exponent) {
        let text = format!("{value:.5e}");
        let (mantissa, power) = text.split_once('e').unwrap_or((&text, "0"));
        let mantissa = trim_fraction(mantissa);
        let power: i32 = power.parse().unwrap_or(0);
        let sign = if power < 0 { '-' } else { '+' };
        return format!("{mantissa}e{sign}{:02}", power.abs());
    }
    let decimals = usize::try_from(5 - exponent).unwrap_or(0);
    trim_fraction(&format!("{value:.decimals$}")).to_string()
}

fn trim_fraction(text: &str) -> &str {
    if text.contains('.') {
        text.trim_end_matches('0').trim_end_matches('.')
    } else {
        text
    }
}

#[cfg(test)]
mod tests {
    use super::{css_number, percentage, trim_fraction, zoom_value};

    #[test]
    fn zoom_uses_chrome156_grammar_serialization_and_factors() {
        for (source, text, factor) in [
            ("2", "2", 2.0),
            ("200%", "200%", 2.0),
            ("NORMAL", "normal", 1.0),
            ("-0", "0", 0.0),
            ("0.0", "0", 0.0),
            (".25", "0.25", 0.25),
            ("+2", "2", 2.0),
            ("1E1", "10", 10.0),
            ("0.3333333", "0.333333", 0.333_333_3),
            ("33.33333%", "33.3333%", 0.333_333_28),
            ("calc(1 + 1)", "calc(2)", 2.0),
            ("calc(3 - 1)", "calc(2)", 2.0),
            ("calc(1 - 3)", "calc(-2)", 0.0),
            ("calc(50% + 50%)", "calc(100%)", 1.0),
            ("calc(2 * 1.5)", "calc(3)", 3.0),
            ("calc(50% * 2)", "calc(100%)", 1.0),
            ("calc(4 / 2)", "calc(2)", 2.0),
            ("calc((1 + 1) * 50%)", "calc(100%)", 1.0),
            ("CALC(calc(1) * 2)", "calc(2)", 2.0),
            ("  2  ", "2", 2.0),
        ] {
            assert_eq!(
                zoom_value(source),
                Some((text.to_string(), factor)),
                "{source}"
            );
        }
        for source in [
            "reset",
            "document",
            "-1",
            "-50%",
            "abc",
            "2px",
            "2 3",
            "calc(1 + 10%)",
            "calc(1 +1)",
            "calc(10% * 10%)",
            "calc(1 / 0)",
            "calc(1 / 10%)",
            "calc(2px)",
            "calc(1 2)",
            "calc(",
            "",
        ] {
            assert_eq!(zoom_value(source), None, "{source}");
        }
    }

    #[test]
    fn css_number_matches_blink_six_significant_digits() {
        for (value, text) in [
            (1e6, "1e+06"),
            (1.5e-7, "1.5e-07"),
            (123_456.7, "123457"),
            (0.1, "0.1"),
            (0.0, "0"),
            (f32::INFINITY, "0"),
            (f32::NAN, "0"),
            (-2.5, "-2.5"),
            (100.0, "100"),
        ] {
            assert_eq!(css_number(value), text);
        }
        assert_eq!(trim_fraction("10"), "10");
        assert_eq!(trim_fraction("1.500"), "1.5");
        assert_eq!(trim_fraction("2.000"), "2");
    }

    #[test]
    fn percentage_prefers_the_authored_digits() {
        assert_eq!(percentage("33.33333%", 0.333_333_3), 33.33333);
        // Unparseable token text falls back to the tokenizer's unit value.
        assert_eq!(percentage("bogus", 0.5), 50.0);
    }
}
