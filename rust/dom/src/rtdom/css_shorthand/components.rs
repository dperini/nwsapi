//! Component values of a shorthand's declaration value: the top-level tokens (a function or
//! a block counts as one component), each with Chrome 156's specified-value spelling where it
//! is context free (numbers, dimensions, strings, `url()`, function arguments), and the value
//! types the shorthand grammars test them against.
use super::super::color::canonicalize_color;
use super::super::css_values::css_number;
use cssparser::{Parser, ParserInput, Token};

#[derive(Clone, Debug, PartialEq)]
pub(super) enum Kind {
    /// An identifier, as authored.
    Ident(String),
    Number {
        value: f32,
        integer: bool,
    },
    /// The percentage (50 for `50%`).
    Percentage(f32),
    Dimension {
        value: f32,
        unit: String,
    },
    Hash(String),
    Str(String),
    Url(String),
    /// A function (lowercase name) or a `(` / `[` block (name `(` / `[`).
    Function(String),
    Comma,
    Slash,
    Delim(char),
    Other,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Comp {
    pub(super) kind: Kind,
    /// The context-free canonical spelling.
    pub(super) text: String,
}

/// Every CSS <length> unit Chrome 156 parses (lowercase).
pub const LENGTH_UNITS: &[&str] = &[
    "px", "em", "rem", "ex", "rex", "ch", "rch", "ic", "ric", "cap", "rcap", "lh", "rlh", "vw",
    "vh", "vi", "vb", "vmin", "vmax", "svw", "svh", "svi", "svb", "svmin", "svmax", "lvw", "lvh",
    "lvi", "lvb", "lvmin", "lvmax", "dvw", "dvh", "dvi", "dvb", "dvmin", "dvmax", "cqw", "cqh",
    "cqi", "cqb", "cqmin", "cqmax", "cm", "mm", "q", "in", "pt", "pc",
];
const MATH_FUNCTIONS: &[&str] = &[
    "calc",
    "min",
    "max",
    "clamp",
    "round",
    "mod",
    "rem",
    "abs",
    "sign",
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "atan2",
    "pow",
    "sqrt",
    "hypot",
    "log",
    "exp",
    "calc-size",
    "sibling-index",
    "sibling-count",
];
const IMAGE_FUNCTIONS: &[&str] = &[
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "repeating-linear-gradient",
    "repeating-radial-gradient",
    "repeating-conic-gradient",
    "-webkit-linear-gradient",
    "-webkit-radial-gradient",
    "-webkit-repeating-linear-gradient",
    "-webkit-repeating-radial-gradient",
    "-webkit-gradient",
    "image-set",
    "-webkit-image-set",
    "cross-fade",
    "-webkit-cross-fade",
    "paint",
    "image",
];
const COLOR_FUNCTIONS: &[&str] = &[
    "rgb",
    "rgba",
    "hsl",
    "hsla",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "color",
    "color-mix",
    "light-dark",
    "contrast-color",
    "-webkit-device-cmyk",
];
const SYSTEM_COLORS: &[&str] = &[
    "currentcolor",
    "transparent",
    "accentcolor",
    "accentcolortext",
    "activetext",
    "buttonborder",
    "buttonface",
    "buttontext",
    "canvas",
    "canvastext",
    "field",
    "fieldtext",
    "graytext",
    "highlight",
    "highlighttext",
    "linktext",
    "mark",
    "marktext",
    "selecteditem",
    "selecteditemtext",
    "visitedtext",
    "activeborder",
    "activecaption",
    "appworkspace",
    "background",
    "buttonhighlight",
    "buttonshadow",
    "captiontext",
    "inactiveborder",
    "inactivecaption",
    "inactivecaptiontext",
    "infobackground",
    "infotext",
    "menu",
    "menutext",
    "scrollbar",
    "threeddarkshadow",
    "threedface",
    "threedhighlight",
    "threedlightshadow",
    "threedshadow",
    "window",
    "windowframe",
    "windowtext",
    "-webkit-link",
    "-webkit-focus-ring-color",
    "-internal-quirk-inherit",
];

/// Functions whose identifier arguments are names (kept as written).
const NAMING_FUNCTIONS: &[&str] = &[
    "stylistic",
    "styleset",
    "character-variant",
    "swash",
    "ornaments",
    "annotation",
    "local",
    "format",
    "attr",
    "counter",
    "counters",
    "symbols",
    "src",
    "var",
    "env",
];

/// A math function Chrome simplified to one term (its text spells `calc(...)`): that term's
/// unit and value.
fn math_value(comp: &Comp) -> Option<(String, f64)> {
    if !comp.is_math() || !comp.text.starts_with("calc(") {
        return None;
    }
    match sum_terms(&components(&comp.text[5..comp.text.len() - 1])?)?.as_slice() {
        [(unit, value)] => Some((unit.clone(), *value)),
        _ => None,
    }
}

/// Units whose values Chrome resolves while parsing (absolute lengths, times, angles and
/// frequencies after `sum_terms` canonicalized them): `abs()` / `sign()` / `min()` / `max()` /
/// `clamp()` of them simplify; relative lengths and percentages stay as written.
const RESOLVED_UNITS: &[&str] = &["", "px", "s", "deg", "hz"];

/// Math functions whose arguments are `calc()` sums.
const SUM_FUNCTIONS: &[&str] = &["min", "max", "clamp", "abs", "sign"];

/// CSS-wide keywords, lowercase.
pub(super) const CSS_WIDE: &[&str] = &["initial", "inherit", "unset", "revert", "revert-layer"];

pub(super) fn quoted(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\a "),
            _ => out.push(character),
        }
    }
    out.push('"');
    out
}

fn dimension_text(value: f32, unit: &str) -> String {
    format!("{}{}", css_number(value), unit.to_ascii_lowercase())
}

/// Blink keeps the authored percentage digits; the tokenizer pre-divides by 100.
fn percent_of(token: &str, unit_value: f32) -> f32 {
    token
        .trim()
        .trim_end_matches('%')
        .parse()
        .unwrap_or_else(|_| (f64::from(unit_value) * 100.0) as f32)
}

/// ASCII-lowercase `Kind::Ident` texts whose identifier does not start with `--`
/// (custom idents are case-preserving).
fn lowercase_non_dashed_idents(inner: &mut [Comp]) {
    for comp in inner {
        if let Kind::Ident(ident) = &comp.kind {
            if !ident.starts_with("--") {
                comp.text = ident.to_ascii_lowercase();
            }
        }
    }
}

/// Fold `calc()`/math expressions in `cubic-bezier()` / `linear()` arguments into
/// numbers (both) and percentages (`linear` only), matching Blink's serialization.
fn normalize_timing_number_components(name: &str, inner: &mut [Comp]) {
    for comp in inner {
        match math_value(comp) {
            Some((unit, value)) if unit.is_empty() => {
                comp.text = css_number(value as f32);
                comp.kind = Kind::Number {
                    value: value as f32,
                    integer: false,
                };
            }
            Some((unit, value)) if unit == "%" && name == "linear" => {
                comp.text = format!("{}%", css_number(value as f32));
                comp.kind = Kind::Percentage(value as f32);
            }
            _ => {}
        }
    }
}

fn read_function_comp(name: &str, inner: Vec<Comp>) -> Option<Comp> {
    if name == "url" {
        let [Comp {
            kind: Kind::Str(url),
            ..
        }] = inner.as_slice()
        else {
            return None;
        };
        return Some(Comp {
            text: format!("url({})", quoted(url)),
            kind: Kind::Url(url.clone()),
        });
    }
    let mut inner = inner;
    if !NAMING_FUNCTIONS.contains(&name) {
        lowercase_non_dashed_idents(&mut inner);
    }
    if name == "cubic-bezier" || name == "linear" {
        normalize_timing_number_components(name, &mut inner);
    }
    if !function_valid(name, &inner) {
        return None;
    }
    let text = match name {
        "calc" if super::math::has_tree_counting(&inner) => Some(super::math::calc_text_of(&inner)),
        "calc" => calc_sum(&inner),
        "min" | "max" | "clamp" => min_max(name, &inner),
        "abs" | "sign" => abs_sign(name, &inner),
        "rgb" | "rgba" | "hsl" | "hsla" => color_function(name, &inner),
        "lab" | "lch" | "oklab" | "oklch" => Some(lab_function(name, &inner)),
        "steps" => steps_text(&inner),
        "linear" => linear_text(&inner),
        _ => None,
    };
    let text = text.unwrap_or_else(|| {
        let spelled = camel_function(name);
        if SUM_FUNCTIONS.contains(&name) {
            format!("{spelled}({})", sum_arguments(&inner))
        } else {
            format!("{spelled}({})", join(&inner))
        }
    });
    Some(Comp {
        text,
        kind: Kind::Function(name.to_string()),
    })
}

fn read(input: &mut Parser<'_, '_>, out: &mut Vec<Comp>) -> Option<()> {
    loop {
        let start = input.position();
        let Ok(token) = input.next() else {
            return Some(());
        };
        let comp = match token.clone() {
            Token::Ident(name) => Comp {
                text: name.to_string(),
                kind: Kind::Ident(name.to_string()),
            },
            Token::Number {
                value, int_value, ..
            } => Comp {
                text: css_number(value),
                kind: Kind::Number {
                    value,
                    integer: int_value.is_some(),
                },
            },
            Token::Percentage { unit_value, .. } => {
                let percent = percent_of(input.slice_from(start), unit_value);
                Comp {
                    text: format!("{}%", css_number(percent)),
                    kind: Kind::Percentage(percent),
                }
            }
            Token::Dimension { value, unit, .. } => {
                // A length past `f32`'s range (`1e39px`) is the largest float, as Chrome
                // clamps it (`3.40282e+38px`), never infinite (which would read `0px`).
                let value = value.clamp(-f32::MAX, f32::MAX);
                Comp {
                    text: dimension_text(value, &unit),
                    kind: Kind::Dimension {
                        value,
                        unit: unit.to_ascii_lowercase(),
                    },
                }
            }
            Token::Hash(value) | Token::IDHash(value) => Comp {
                text: format!("#{value}"),
                kind: Kind::Hash(value.to_string()),
            },
            Token::QuotedString(value) => Comp {
                text: quoted(&value),
                kind: Kind::Str(value.to_string()),
            },
            Token::UnquotedUrl(value) => Comp {
                text: format!("url({})", quoted(&value)),
                kind: Kind::Url(value.to_string()),
            },
            Token::Comma => Comp {
                text: ",".into(),
                kind: Kind::Comma,
            },
            Token::Delim('/') => Comp {
                text: "/".into(),
                kind: Kind::Slash,
            },
            Token::Delim(character) if character != '!' => Comp {
                text: character.to_string(),
                kind: Kind::Delim(character),
            },
            Token::Function(name) => {
                let name = name.to_ascii_lowercase();
                let inner = input
                    .parse_nested_block(|input| {
                        let mut inner = Vec::new();
                        read(input, &mut inner)
                            .ok_or_else(|| input.new_custom_error::<(), ()>(()))?;
                        Ok(inner)
                    })
                    .ok()?;
                read_function_comp(&name, inner)?
            }
            Token::ParenthesisBlock | Token::SquareBracketBlock => {
                let (open, close) = if matches!(token, Token::ParenthesisBlock) {
                    ("(", ")")
                } else {
                    ("[", "]")
                };
                let inner = input
                    .parse_nested_block(|input| {
                        let mut inner = Vec::new();
                        read(input, &mut inner)
                            .ok_or_else(|| input.new_custom_error::<(), ()>(()))?;
                        Ok(inner)
                    })
                    .ok()?;
                Comp {
                    text: format!("{open}{}{close}", join(&inner)),
                    kind: Kind::Function(open.into()),
                }
            }
            Token::BadUrl(_)
            | Token::BadString(_)
            | Token::CloseParenthesis
            | Token::CloseSquareBracket
            | Token::CloseCurlyBracket
            | Token::CurlyBracketBlock
            | Token::Semicolon => return None,
            _ => Comp {
                text: input.slice_from(start).trim().to_string(),
                kind: Kind::Other,
            },
        };
        out.push(comp);
    }
}

/// A flat `calc()` sum (`a + b - c` of numbers, percentages and dimensions) the way Blink
/// simplifies it: like units combined, numbers first, then percentages, then units in ASCII
/// order. `None` for anything else.
fn calc_sum(inner: &[Comp]) -> Option<String> {
    sum_terms(inner).map(calc_text)
}

pub(super) type Terms = Vec<(String, f64)>;

/// A literal `calc()` operand's one term: a number, a percentage, a dimension or a constant
/// (`calc_type` admits only the constants as identifiers: the last one is `nan`).
pub(super) fn literal(comp: &Comp) -> Option<Terms> {
    Some(match &comp.kind {
        Kind::Number { value, .. } => vec![(String::new(), f64::from(*value))],
        Kind::Percentage(value) => vec![("%".to_string(), f64::from(*value))],
        Kind::Dimension { value, unit } => vec![(unit.clone(), f64::from(*value))],
        Kind::Ident(name) => {
            let value = match name.to_ascii_lowercase().as_str() {
                "e" => std::f64::consts::E,
                "pi" => std::f64::consts::PI,
                "infinity" => f64::INFINITY,
                "-infinity" => f64::NEG_INFINITY,
                _ => f64::NAN,
            };
            vec![(String::new(), value)]
        }
        _ => return None,
    })
}

/// The like-unit terms of a sum of products (operands: literals, the constants, nested
/// parentheses / `calc()`, one-unit `min()` / `max()` / `clamp()`), absolute lengths combined
/// in px; `None` when Chrome would keep the expression unsimplified.
fn sum_terms(inner: &[Comp]) -> Option<Vec<(String, f64)>> {
    // Operands alternate with operators (`function_valid` / `calc_type` checked every sum
    // before it gets here); products bind first.
    if inner.len().is_multiple_of(2) {
        unreachable!("a checked calc() sum has an odd number of components");
    }
    let nested = |comp: &Comp, open: usize| components(&comp.text[open..comp.text.len() - 1]);
    let operand = |comp: &Comp| -> Option<Terms> {
        if let Some(terms) = literal(comp) {
            return Some(terms);
        }
        match &comp.kind {
            Kind::Function(name) if name == "(" => sum_terms(&nested(comp, 1)?),
            // A nested math function Chrome simplified already spells `calc(...)`.
            Kind::Function(_) if comp.is_math() && comp.text.starts_with("calc(") => {
                sum_terms(&nested(comp, 5)?)
            }
            _ => None,
        }
    };
    let scalar = |terms: &Terms| match terms.as_slice() {
        [(unit, value)] if unit.is_empty() => Some(*value),
        _ => None,
    };
    let scale = |terms: Terms, factor: f64| -> Terms {
        terms
            .into_iter()
            .map(|(unit, value)| (unit, value * factor))
            .collect()
    };
    let mut terms: Terms = Vec::new();
    let push = |terms: &mut Terms, product: Terms, sign: f64| {
        for (unit, value) in product {
            match terms.iter_mut().find(|(existing, _)| *existing == unit) {
                Some(term) => term.1 += sign * value,
                None => terms.push((unit, sign * value)),
            }
        }
    };
    let mut sign = 1.0;
    let mut current = operand(&inner[0])?;
    let mut index = 1;
    while index < inner.len() {
        let next = operand(&inner[index + 1])?;
        match inner[index].kind {
            Kind::Delim('*') => {
                current = match scalar(&next) {
                    Some(factor) => scale(current, factor),
                    // `calc_type` admitted at most one dimension: the left side is the scalar.
                    None => scale(next, scalar(&current)?),
                };
            }
            Kind::Slash | Kind::Delim('/') => current = scale(current, 1.0 / scalar(&next)?),
            Kind::Delim(operator @ ('+' | '-')) => {
                push(&mut terms, current, sign);
                sign = [(-1.0_f64), 1.0][usize::from(operator == '+')];
                current = next;
            }
            _ => unreachable!("a checked calc() sum has only * / + - operators"),
        }
        index += 2;
    }
    push(&mut terms, current, sign);
    Some(canonical_terms(terms))
}

/// Like-unit terms with absolute lengths combined in px and times, angles and frequencies in
/// their canonical unit (`calc(1ms)` is `calc(0.001s)`).
pub(super) fn canonical_terms(mut terms: Terms) -> Terms {
    // Absolute lengths combine in px.
    let absolute = |unit: &str| match unit {
        "in" => Some(96.0),
        "cm" => Some(96.0 / 2.54),
        "mm" => Some(96.0 / 25.4),
        "q" => Some(96.0 / 101.6),
        "pt" => Some(96.0 / 72.0),
        "pc" => Some(16.0),
        _ => None,
    };
    if terms.iter().any(|(unit, _)| absolute(unit).is_some()) {
        let mut px = 0.0;
        let mut rest = Vec::new();
        for (unit, value) in terms {
            match absolute(&unit) {
                Some(factor) => px += value * factor,
                None if unit == "px" => px += value,
                None => rest.push((unit, value)),
            }
        }
        rest.push(("px".to_string(), px));
        terms = rest;
    }
    // Times, angles and frequencies resolve to their canonical unit (`calc(1ms)` is
    // `calc(0.001s)`).
    for (canonical, units) in [
        ("s", &[("s", 1.0), ("ms", 0.001)][..]),
        (
            "deg",
            &[
                ("deg", 1.0),
                ("grad", 0.9),
                ("rad", 180.0 / std::f64::consts::PI),
                ("turn", 360.0),
            ][..],
        ),
        ("hz", &[("hz", 1.0), ("khz", 1000.0)][..]),
    ] {
        let factor = |unit: &str| {
            units
                .iter()
                .find(|(name, _)| *name == unit)
                .map(|(_, f)| *f)
        };
        if terms
            .iter()
            .filter(|(unit, _)| factor(unit).is_some())
            .count()
            > 0
        {
            let mut total = 0.0;
            terms.retain(|(unit, value)| match factor(unit) {
                Some(f) => {
                    total += value * f;
                    false
                }
                None => true,
            });
            terms.push((canonical.to_string(), total));
        }
    }
    terms
}

/// A `calc()` operand or sum's type: a number, a dimension of a category (percentages fit
/// any dimension), or unknown (a nested math function).
#[derive(Clone, Copy, PartialEq)]
enum CalcType {
    Number,
    Percent,
    Unit(u8),
    Unknown,
}

fn unit_category(unit: &str) -> Option<u8> {
    if LENGTH_UNITS.contains(&unit) {
        return Some(0);
    }
    match unit {
        "s" | "ms" => Some(1),
        "deg" | "grad" | "rad" | "turn" => Some(2),
        "hz" | "khz" => Some(3),
        "dpi" | "dpcm" | "dppx" | "x" => Some(4),
        _ => None,
    }
}

/// The type of a `calc()` sum, `None` when Chrome rejects it: a sum mixes numbers and
/// dimensions or two dimension categories, a product multiplies two dimensions, or a divisor
/// has a unit.
fn multiply_type(a: CalcType, b: CalcType) -> Option<CalcType> {
    if unit_type(a) && unit_type(b) {
        return None;
    }
    Some(match (a, b) {
        (CalcType::Number | CalcType::Unknown, other) | (other, _) => other,
    })
}

fn accumulate_type(total: Option<CalcType>, product: CalcType) -> Option<CalcType> {
    match total {
        None => Some(product),
        Some(total) => sum_type(total, product),
    }
}

fn calc_type(inner: &[Comp]) -> Option<CalcType> {
    let operand = |comp: &Comp| match &comp.kind {
        Kind::Number { .. } => Some(CalcType::Number),
        Kind::Percentage(_) => Some(CalcType::Percent),
        Kind::Dimension { unit, .. } => unit_category(unit).map(CalcType::Unit),
        Kind::Function(name) if name == "(" => {
            calc_type(&components(&comp.text[1..comp.text.len() - 1])?)
        }
        Kind::Function(_) if comp.is_math() => math_type(comp),
        Kind::Ident(name)
            if matches!(
                name.to_ascii_lowercase().as_str(),
                "e" | "pi" | "infinity" | "-infinity" | "nan"
            ) =>
        {
            Some(CalcType::Number)
        }
        _ => None,
    };
    let (first, rest) = inner.split_first()?;
    let mut total: Option<CalcType> = None;
    let mut product = operand(first)?;
    for pair in rest.chunks(2) {
        let [operator, next] = pair else {
            return None;
        };
        let next = operand(next)?;
        match operator.kind {
            Kind::Delim('*') => product = multiply_type(product, next)?,
            Kind::Slash | Kind::Delim('/') if unit_type(next) => return None,
            Kind::Slash | Kind::Delim('/') => {}
            Kind::Delim('+' | '-') => {
                total = Some(accumulate_type(total, product)?);
                product = next;
            }
            _ => return None,
        }
    }
    match total {
        None => Some(product),
        Some(total) => sum_type(total, product),
    }
}

fn unit_type(ty: CalcType) -> bool {
    matches!(ty, CalcType::Percent | CalcType::Unit(_))
}

/// The type of a sum of two types (`None`: Chrome rejects adding them).
fn sum_type(a: CalcType, b: CalcType) -> Option<CalcType> {
    match (a, b) {
        (CalcType::Unknown, other) | (other, CalcType::Unknown) => Some(other),
        (CalcType::Number, CalcType::Number) => Some(CalcType::Number),
        (CalcType::Percent, other) | (other, CalcType::Percent) if unit_type(other) => Some(other),
        (CalcType::Unit(x), CalcType::Unit(y)) if x == y => Some(a),
        _ => None,
    }
}

/// A math function's type: a simplified one's `calc()` sum, `min()` / `max()` / `clamp()` /
/// `abs()` their arguments' common type, `sign()` a number, the others unknown.
fn math_type(comp: &Comp) -> Option<CalcType> {
    let open = comp.text.find('(')? + 1;
    let inner = components(&comp.text[open..comp.text.len() - 1])?;
    if comp.text.starts_with("calc(") {
        return calc_type(&inner);
    }
    match comp.function()? {
        "sign" | "sibling-index" | "sibling-count" => Some(CalcType::Number),
        "min" | "max" | "clamp" | "abs" => arguments_type(&inner),
        _ => Some(CalcType::Unknown),
    }
}

/// The comma-separated arguments of a function.
fn arguments(inner: &[Comp]) -> Vec<&[Comp]> {
    inner.split(|comp| comp.kind == Kind::Comma).collect()
}

/// A `calc()` sum's type when Chrome accepts it: operands alternate with operators (a literal
/// product has at most one unit) and the types add up.
fn checked_sum(inner: &[Comp]) -> Option<CalcType> {
    if inner.is_empty() || inner.len().is_multiple_of(2) {
        return None;
    }
    let unit = |comp: &Comp| matches!(comp.kind, Kind::Dimension { .. } | Kind::Percentage(_));
    let alternates = inner.iter().enumerate().all(|(index, comp)| {
        if index % 2 == 1 {
            let product = matches!(comp.kind, Kind::Delim('*'));
            let operator =
                product || matches!(comp.kind, Kind::Delim('+' | '-' | '/') | Kind::Slash);
            operator && !(product && unit(&inner[index - 1]) && unit(&inner[index + 1]))
        } else {
            !matches!(comp.kind, Kind::Comma | Kind::Slash | Kind::Delim(_))
        }
    });
    calc_type(inner).filter(|_| alternates)
}

fn is_none(argument: &[Comp]) -> bool {
    matches!(argument, [only] if only.is_ident(&["none"]))
}

/// The common type of a math function's comma-separated `calc()` sums (`clamp()`'s `none`
/// bounds left out); `None` when an argument is not a sum or the types do not add up.
fn arguments_type(inner: &[Comp]) -> Option<CalcType> {
    arguments(inner)
        .into_iter()
        .filter(|argument| !is_none(argument))
        .try_fold(CalcType::Unknown, |total, argument| {
            sum_type(total, checked_sum(argument)?)
        })
}

fn rgb_hsl_valid(name: &str, inner: &[Comp]) -> bool {
    let commas = inner.iter().filter(|comp| comp.kind == Kind::Comma).count();
    if inner.first().is_some_and(|comp| comp.is_ident(&["from"])) {
        return rgb_hsl_from_valid(inner, commas);
    }
    if name.starts_with("hsl")
        && inner
            .first()
            .is_some_and(|comp| !hsl_hue_valid(comp, commas))
    {
        return false;
    }
    if commas > 0 {
        rgb_hsl_legacy_comma_valid(inner, commas)
    } else {
        rgb_hsl_modern_space_valid(inner)
    }
}

/// `rgb(from <color> ...)`: comma-less, three or four space-separated channels, with
/// an optional `/ <alpha>` tail.
fn rgb_hsl_from_valid(inner: &[Comp], commas: usize) -> bool {
    commas == 0 && (inner.len() == 5 || (inner.len() == 7 && inner[5].is_slash()))
}

/// Hue channel: number, angle dimension, `none` (modern syntax only), or math.
fn hsl_hue_valid(comp: &Comp, commas: usize) -> bool {
    match &comp.kind {
        Kind::Number { .. } => true,
        Kind::Dimension { unit, .. } => unit_category(unit) == Some(2),
        Kind::Ident(_) => commas == 0 && comp.is_ident(&["none"]),
        Kind::Function(_) if comp.is_math() => matches!(
            math_type(comp),
            Some(CalcType::Number | CalcType::Unit(2) | CalcType::Unknown)
        ),
        _ => false,
    }
}

/// Legacy comma syntax: three channels + optional alpha, each separated by a comma.
fn rgb_hsl_legacy_comma_valid(inner: &[Comp], commas: usize) -> bool {
    (commas == 2 || commas == 3)
        && inner.len() == 2 * commas + 1
        && inner
            .iter()
            .enumerate()
            .all(|(index, comp)| (comp.kind == Kind::Comma) == (index % 2 == 1))
}

/// Modern space syntax: three space-separated channels, optionally `/ <alpha>`.
fn rgb_hsl_modern_space_valid(inner: &[Comp]) -> bool {
    match inner.iter().position(|comp| comp.kind == Kind::Slash) {
        Some(slash) => slash == 3 && inner.len() == 5,
        None => inner.len() == 3,
    }
}

/// Structural checks Chrome makes before keeping a function: `calc()` / `min()` / `max()` /
/// `clamp()` / `abs()` / `sign()` take type-checked sums (`clamp()` bounds may be `none`),
/// `rgb()` / `hsl()` have three channels (and an alpha) in one syntax with an angle or number
/// hue, `linear()` stops a number and at most two percentages, `cubic-bezier()` four numbers.
fn steps_valid(inner: &[Comp]) -> bool {
    let count = |comp: &Comp, minimum: f32| match comp.kind {
        Kind::Number {
            value,
            integer: true,
        } => value >= minimum,
        _ => comp.is_math(),
    };
    match inner {
        [steps] => count(steps, 1.0),
        [steps, comma, position] if comma.kind == Kind::Comma => {
            let Some(position) = position.keyword(&[
                "start",
                "end",
                "jump-start",
                "jump-end",
                "jump-none",
                "jump-both",
            ]) else {
                return false;
            };
            let minimum = if position == "jump-none" { 2.0 } else { 1.0 };
            count(steps, minimum)
        }
        _ => false,
    }
}

fn function_valid(name: &str, inner: &[Comp]) -> bool {
    match name {
        "calc" => checked_sum(inner).is_some(),
        "min" | "max" => {
            !arguments(inner).into_iter().any(is_none) && arguments_type(inner).is_some()
        }
        "clamp" => {
            let arguments = arguments(inner);
            arguments.len() == 3 && !is_none(arguments[1]) && arguments_type(inner).is_some()
        }
        "abs" | "sign" => !inner.iter().any(Comp::is_comma) && checked_sum(inner).is_some(),
        "sibling-index" | "sibling-count" => inner.is_empty(),
        "rgb" | "rgba" | "hsl" | "hsla" => rgb_hsl_valid(name, inner),
        "linear" => {
            let output = |comp: &Comp| matches!(comp.kind, Kind::Number { .. });
            let position = |comp: &Comp| matches!(comp.kind, Kind::Percentage(_));
            inner.iter().any(|comp| comp.kind == Kind::Comma)
                && arguments(inner).iter().all(|stop| {
                    (1..=3).contains(&stop.len())
                        && output(&stop[0])
                        && stop[1..].iter().all(position)
                })
        }
        "steps" => steps_valid(inner),
        "cubic-bezier" => {
            let arguments = arguments(inner);
            arguments.len() == 4
                && arguments
                    .iter()
                    .enumerate()
                    .all(|(index, argument)| match argument {
                        [Comp {
                            kind: Kind::Number { value, .. },
                            ..
                        }] => index % 2 == 1 || (0.0..=1.0).contains(value),
                        _ => false,
                    })
        }
        _ => true,
    }
}

/// `calc()` of simplified terms: numbers, then percentages, then units in ASCII order.
pub(super) fn calc_text(mut terms: Vec<(String, f64)>) -> String {
    let rank = |unit: &str| match unit {
        "" => 0,
        "%" => 1,
        _ => 2,
    };
    terms.sort_by(|a, b| rank(&a.0).cmp(&rank(&b.0)).then(a.0.cmp(&b.0)));
    if let [(unit, value)] = terms.as_slice() {
        if !value.is_finite() {
            // `calc(1px / 0)` is `calc(infinity * 1px)`.
            let infinity = if value.is_nan() {
                "NaN"
            } else if *value < 0.0 {
                "-infinity"
            } else {
                "infinity"
            };
            let unit = if unit.is_empty() {
                String::new()
            } else {
                format!(" * 1{unit}")
            };
            return format!("calc({infinity}{unit})");
        }
    }
    let mut out = String::from("calc(");
    for (index, (unit, value)) in terms.iter().enumerate() {
        let number = |value: f64| css_number(value as f32);
        if index == 0 {
            out.push_str(&number(*value));
        } else if *value < 0.0 {
            out.push_str(" - ");
            out.push_str(&number(-value));
        } else {
            out.push_str(" + ");
            out.push_str(&number(*value));
        }
        out.push_str(unit);
    }
    out.push(')');
    out
}

/// A sum's single term when Chrome resolves it while parsing.
fn resolved(terms: &[(String, f64)]) -> Option<(String, f64)> {
    match terms {
        [(unit, value)] if RESOLVED_UNITS.contains(&unit.as_str()) => Some((unit.clone(), *value)),
        _ => None,
    }
}

/// `min()` / `max()` / `clamp()` Chrome simplifies: one argument (`clamp()`'s `none` bounds
/// left out) is its `calc()` sum, arguments that all resolve in one unit their value.
fn min_max(name: &str, inner: &[Comp]) -> Option<String> {
    let arguments = arguments(inner);
    if let [only] = arguments
        .iter()
        .filter(|argument| !is_none(argument))
        .collect::<Vec<_>>()
        .as_slice()
    {
        return sum_terms(only).map(calc_text);
    }
    let mut unit = None;
    let mut values = Vec::new();
    for argument in &arguments {
        if is_none(argument) {
            values.push(None);
            continue;
        }
        // `function_valid` type-checked the arguments: resolved ones share the unit.
        let (this, value) = resolved(&sum_terms(argument)?)?;
        unit = Some(this);
        values.push(Some(value));
    }
    let value = match (name, values.as_slice()) {
        ("min", _) => values
            .iter()
            .flatten()
            .copied()
            .fold(f64::INFINITY, f64::min),
        ("max", _) => values
            .iter()
            .flatten()
            .copied()
            .fold(f64::NEG_INFINITY, f64::max),
        (_, [low, Some(value), high]) => value
            .min(high.unwrap_or(f64::INFINITY))
            .max(low.unwrap_or(f64::NEG_INFINITY)),
        _ => unreachable!("function_valid admits clamp() with three arguments, a middle one"),
    };
    Some(calc_text(vec![(unit?, value)]))
}

/// `abs()` / `sign()` of a sum Chrome resolves: its `calc()` value (`sign()` a number).
fn abs_sign(name: &str, inner: &[Comp]) -> Option<String> {
    let (unit, value) = resolved(&sum_terms(inner)?)?;
    Some(if name == "abs" {
        calc_text(vec![(unit, value.abs())])
    } else {
        // `sign()` keeps a (signed) zero and NaN.
        let sign = if value == 0.0 || value.is_nan() {
            value
        } else {
            value.signum()
        };
        calc_text(vec![(String::new(), sign)])
    })
}

/// The arguments of a math function Chrome keeps: each a simplified sum without the `calc()`
/// wrapper (`min(1px, calc(1px + 1em))` is `min(1px, 1em + 1px)`), or as written.
fn sum_arguments(inner: &[Comp]) -> String {
    arguments(inner)
        .into_iter()
        .map(
            |argument| match (!is_none(argument)).then(|| sum_terms(argument)).flatten() {
                None if super::math::has_tree_counting(argument) => {
                    super::math::argument_text(argument)
                }
                Some(terms) => {
                    let text = calc_text(terms);
                    text[5..text.len() - 1].to_string()
                }
                None => join(argument),
            },
        )
        .collect::<Vec<_>>()
        .join(", ")
}

/// Blink's alpha spelling: the shortest of two or three decimals naming the same 8-bit alpha.
fn alpha_text(alpha: f64) -> String {
    let alpha = alpha.clamp(0.0, 1.0);
    let byte = (alpha * 255.0).round();
    let two = (alpha * 100.0).round() / 100.0;
    let value = if (two * 255.0).round() == byte {
        two
    } else {
        (alpha * 1000.0).round() / 1000.0
    };
    css_number(value as f32)
}

fn rgb_text(channels: [f64; 3], alpha: f64) -> String {
    // Channels computed from hsl() land a hair off a half: round at 1e-9 first.
    let [r, g, b] =
        channels.map(|channel| ((channel * 1e9).round() / 1e9).round().clamp(0.0, 255.0) as i64);
    if alpha >= 1.0 {
        format!("rgb({r}, {g}, {b})")
    } else {
        format!("rgba({r}, {g}, {b}, {})", alpha_text(alpha))
    }
}

/// `#rgb[a]` / `#rrggbb[aa]` as Chrome serializes them.
fn hex_color(hex: &str) -> Option<String> {
    let digits: Vec<f64> = hex
        .chars()
        .map(|c| c.to_digit(16).map(f64::from))
        .collect::<Option<_>>()?;
    let pairs: Vec<f64> = match digits.len() {
        3 | 4 => digits.iter().map(|d| d * 17.0).collect(),
        6 | 8 => digits
            .chunks(2)
            .map(|pair| pair[0] * 16.0 + pair[1])
            .collect(),
        _ => return None,
    };
    let alpha = pairs.get(3).map_or(1.0, |a| a / 255.0);
    Some(rgb_text([pairs[0], pairs[1], pairs[2]], alpha))
}

/// `rgb()` / `hsl()` in the legacy (commas) or modern (spaces, `/ alpha`) syntax.
fn color_function(name: &str, inner: &[Comp]) -> Option<String> {
    // `function_valid` admitted three channels and an optional alpha, or the relative syntax
    // (kept as written).
    let values: Vec<&Comp> = inner
        .iter()
        .filter(|comp| !comp.is_comma() && !comp.is_slash())
        .collect();
    if values.len() > 4 {
        return None;
    }
    let (parts, alpha_part) = (&values[..3], values.get(3).copied());
    // A channel: a literal, `none` (zero) or a math function that computes to one.
    let computed = |comp: &Comp, unit: &str| {
        if comp.is_ident(&["none"]) {
            return Some(0.0);
        }
        math_value(comp)
            .filter(|(found, _)| found == unit)
            .map(|(_, value)| value)
    };
    let number = |comp: &Comp| match comp.kind {
        Kind::Number { value, .. } => Some(f64::from(value)),
        _ => computed(comp, ""),
    };
    let percent = |comp: &Comp| match comp.kind {
        Kind::Percentage(value) => Some(f64::from(value)),
        _ => computed(comp, "%"),
    };
    let alpha = match alpha_part {
        None => 1.0,
        Some(comp) => number(comp).or_else(|| percent(comp).map(|p| p / 100.0))?,
    };
    let channels = if name.starts_with("rgb") {
        let channel = |comp: &Comp| number(comp).or_else(|| percent(comp).map(|p| p * 2.55));
        [channel(parts[0])?, channel(parts[1])?, channel(parts[2])?]
    } else {
        hsl_channels(parts, &computed, &percent)?
    };
    Some(rgb_text(channels, alpha))
}

/// Compute the sRGB channels of an `hsl()`/`hsla()` function. `parts` holds hue,
/// saturation, lightness. `computed` resolves `none` / math; `percent` resolves a
/// percentage or percentage-typed math.
fn hsl_channels(
    parts: &[&Comp],
    computed: &dyn Fn(&Comp, &str) -> Option<f64>,
    percent: &dyn Fn(&Comp) -> Option<f64>,
) -> Option<[f64; 3]> {
    // `function_valid` admitted a number, an angle, `none` or a math function hue.
    let hue = match &parts[0].kind {
        Kind::Number { value, .. } => f64::from(*value),
        Kind::Dimension { value, unit } => {
            f64::from(*value)
                * match unit.as_str() {
                    "deg" => 1.0,
                    "grad" => 0.9,
                    "rad" => 180.0 / std::f64::consts::PI,
                    _ => 360.0,
                }
        }
        _ => computed(parts[0], "").or_else(|| computed(parts[0], "deg"))?,
    };
    let (saturation, lightness) = (percent(parts[1])? / 100.0, percent(parts[2])? / 100.0);
    let hue = hue.rem_euclid(360.0) / 360.0;
    let q = if lightness < 0.5 {
        lightness * (1.0 + saturation)
    } else {
        lightness + saturation - lightness * saturation
    };
    let p = 2.0 * lightness - q;
    let channel = |t: f64| {
        let t = t.rem_euclid(1.0);
        255.0
            * if t < 1.0 / 6.0 {
                p + (q - p) * 6.0 * t
            } else if t < 0.5 {
                q
            } else if t < 2.0 / 3.0 {
                p + (q - p) * (2.0 / 3.0 - t) * 6.0
            } else {
                p
            }
    };
    Some([
        channel(hue + 1.0 / 3.0),
        channel(hue),
        channel(hue - 1.0 / 3.0),
    ])
}

/// `lab()` / `lch()` / `oklab()` / `oklch()`: a percentage lightness spelled as a number.
fn lab_function(name: &str, inner: &[Comp]) -> String {
    let mut parts: Vec<String> = Vec::new();
    for (index, comp) in inner.iter().enumerate() {
        let text = match (index, &comp.kind) {
            (0, Kind::Percentage(value)) => {
                let scale = if name.starts_with("ok") { 100.0 } else { 1.0 };
                css_number((f64::from(*value) / scale) as f32)
            }
            _ => comp.text.clone(),
        };
        parts.push(text);
    }
    format!("{name}({})", parts.join(" "))
}

/// `steps(n, end | jump-end)` is `steps(n)`; the position keyword lowercase.
fn steps_text(inner: &[Comp]) -> Option<String> {
    match inner {
        [count, comma, position] if comma.kind == Kind::Comma => {
            let position = position.ident()?;
            Some(if matches!(position.as_str(), "end" | "jump-end") {
                format!("steps({})", count.text)
            } else {
                format!("steps({}, {position})", count.text)
            })
        }
        _ => None,
    }
}

/// `linear()` with every stop's input position filled in (first 0%, last 100%, the rest
/// spread evenly between their known neighbours).
fn linear_text(inner: &[Comp]) -> Option<String> {
    let stops = build_linear_stops(inner)?;
    if stops.len() < 2 {
        unreachable!("function_valid admits linear() with a comma: two stops or more");
    }
    let mut flat: Vec<Option<f64>> = stops
        .iter()
        .flat_map(|(_, positions)| positions.iter().copied())
        .collect();
    let last = flat.len() - 1;
    flat[0].get_or_insert(0.0);
    flat[last].get_or_insert(100.0);
    // A position below the largest before it is that largest.
    let mut largest = f64::NEG_INFINITY;
    for position in flat.iter_mut().flatten() {
        largest = largest.max(*position);
        *position = largest;
    }
    fill_linear_gaps(&mut flat)?;
    let mut out = Vec::new();
    let mut index = 0;
    for (output, positions) in &stops {
        let texts: Vec<String> = positions
            .iter()
            .map(|_| {
                let value = flat[index].unwrap_or(0.0);
                index += 1;
                format!("{}%", css_number(value as f32))
            })
            .collect();
        out.push(format!("{output} {}", texts.join(" ")));
    }
    Some(format!("linear({})", out.join(", ")))
}

/// Split `linear()` arguments at commas into `(output, positions)` stops. A stop with two
/// positions splits into two single-position stops. Returns `None` if a stop is empty
/// (the first item has no output number).
fn build_linear_stops(inner: &[Comp]) -> Option<Vec<(String, Vec<Option<f64>>)>> {
    let mut stops: Vec<(String, Vec<Option<f64>>)> = Vec::new();
    for item in inner.split(|comp| comp.kind == Kind::Comma) {
        // `function_valid` admitted a number and at most two percentages per stop.
        let (output, rest) = item.split_first()?;
        let mut positions = Vec::new();
        for comp in rest {
            let Kind::Percentage(value) = comp.kind else {
                unreachable!("function_valid admits percentage positions")
            };
            positions.push(Some(f64::from(value)));
        }
        if positions.is_empty() {
            stops.push((output.text.clone(), vec![None]));
        } else {
            // A stop with two input positions is two stops.
            for position in positions {
                stops.push((output.text.clone(), vec![position]));
            }
        }
    }
    Some(stops)
}

/// Fill every `None` gap in `flat` by evenly spreading between its known neighbours.
/// Returns `None` if a gap has no known start or end (unreachable in valid input).
fn fill_linear_gaps(flat: &mut [Option<f64>]) -> Option<()> {
    let mut at = 0;
    while at < flat.len() {
        if flat[at].is_none() {
            let end = (at..flat.len()).find(|&index| flat[index].is_some())?;
            let (low, high) = (flat[at - 1]?, flat[end]?);
            let gaps = (end - at + 1) as f64;
            for (offset, index) in (at..end).enumerate() {
                flat[index] = Some(low + (high - low) * (offset as f64 + 1.0) / gaps);
            }
            at = end;
        }
        at += 1;
    }
    Some(())
}

/// Join components with single spaces, commas as `, `.
pub(super) fn join(comps: &[Comp]) -> String {
    let mut out = String::new();
    for (index, comp) in comps.iter().enumerate() {
        if comp.kind == Kind::Comma {
            out.push(',');
            continue;
        }
        if index > 0 {
            out.push(' ');
        }
        out.push_str(&comp.text);
    }
    out
}

/// Tokenize a declaration value into components; `None` for unbalanced or bad input.
pub(super) fn components(value: &str) -> Option<Vec<Comp>> {
    let mut source = ParserInput::new(value);
    let mut input = Parser::new(&mut source);
    let mut out = Vec::new();
    read(&mut input, &mut out)?;
    Some(out)
}

impl Comp {
    pub(super) fn ident(&self) -> Option<String> {
        match &self.kind {
            Kind::Ident(name) => Some(name.to_ascii_lowercase()),
            _ => None,
        }
    }
    pub(super) fn is_ident(&self, names: &[&str]) -> bool {
        self.ident()
            .is_some_and(|name| names.contains(&name.as_str()))
    }
    pub(super) fn keyword(&self, names: &[&str]) -> Option<String> {
        self.ident().filter(|name| names.contains(&name.as_str()))
    }
    pub(super) fn is_comma(&self) -> bool {
        self.kind == Kind::Comma
    }
    pub(super) fn is_slash(&self) -> bool {
        self.kind == Kind::Slash
    }
    fn function(&self) -> Option<&str> {
        match &self.kind {
            Kind::Function(name) => Some(name),
            _ => None,
        }
    }
    fn is_math(&self) -> bool {
        self.function()
            .is_some_and(|name| MATH_FUNCTIONS.contains(&name))
    }
    /// A math function whose arguments carry a unit `pick` accepts (`None`: unitless).
    fn math_of(&self, accepts: fn(&str) -> bool, percent: bool, number: bool) -> bool {
        if !self.is_math() {
            return false;
        }
        let Some(inner) = self
            .text
            .find('(')
            .and_then(|at| components(&self.text[at + 1..self.text.len() - 1]))
        else {
            unreachable!("a math function's text is its tokenized arguments re-joined");
        };
        let mut found = false;
        let mut bad = false;
        visit(&inner, &mut |comp| match &comp.kind {
            Kind::Dimension { unit, .. } => {
                if accepts(unit) {
                    found = true;
                } else {
                    bad = true;
                }
            }
            Kind::Percentage(_) => {
                if percent {
                    found = true;
                } else {
                    bad = true;
                }
            }
            _ => {}
        });
        !bad && (found || number)
    }
    /// `<length>` (a unitless zero is `0px`).
    pub(super) fn length(&self, negative: bool) -> Option<String> {
        match &self.kind {
            Kind::Dimension { value, unit } if LENGTH_UNITS.contains(&unit.as_str()) => {
                (negative || *value >= 0.0).then(|| self.text.clone())
            }
            Kind::Number { value, .. } if *value == 0.0 => Some("0px".into()),
            _ if self.math_of(|unit| LENGTH_UNITS.contains(&unit), false, false) => {
                Some(self.text.clone())
            }
            _ => None,
        }
    }
    pub(super) fn percentage(&self, negative: bool) -> Option<String> {
        match &self.kind {
            Kind::Percentage(value) => (negative || *value >= 0.0).then(|| self.text.clone()),
            _ => None,
        }
    }
    /// `<length-percentage>`.
    pub(super) fn length_percentage(&self, negative: bool) -> Option<String> {
        if self.math_of(|unit| LENGTH_UNITS.contains(&unit), true, false) {
            return Some(self.text.clone());
        }
        self.length(negative).or_else(|| self.percentage(negative))
    }
    pub(super) fn number(&self, negative: bool) -> Option<String> {
        match &self.kind {
            Kind::Number { value, .. } => (negative || *value >= 0.0).then(|| self.text.clone()),
            _ if self.math_of(|_| false, false, true) => Some(self.text.clone()),
            _ => None,
        }
    }
    pub(super) fn integer(&self, minimum: i64) -> Option<String> {
        match &self.kind {
            Kind::Number {
                value,
                integer: true,
            } if f64::from(*value) >= minimum as f64 => Some(self.text.clone()),
            _ if self.math_of(|_| false, false, true) => Some(self.text.clone()),
            _ => None,
        }
    }
    pub(super) fn time(&self, negative: bool) -> Option<String> {
        match &self.kind {
            Kind::Dimension { value, unit } if unit == "s" || unit == "ms" => {
                (negative || *value >= 0.0).then(|| self.text.clone())
            }
            _ if self.math_of(|unit| unit == "s" || unit == "ms", false, false) => {
                Some(self.text.clone())
            }
            _ => None,
        }
    }
    pub(super) fn angle(&self) -> Option<String> {
        match &self.kind {
            Kind::Dimension { unit, .. }
                if matches!(unit.as_str(), "deg" | "grad" | "rad" | "turn") =>
            {
                Some(self.text.clone())
            }
            Kind::Number { value, .. } if *value == 0.0 => Some("0deg".into()),
            _ if self.math_of(
                |unit| matches!(unit, "deg" | "grad" | "rad" | "turn"),
                false,
                false,
            ) =>
            {
                Some(self.text.clone())
            }
            _ => None,
        }
    }
    /// `<angle>` without the unitless zero (`offset-rotate`).
    pub(super) fn angle_strict(&self) -> Option<String> {
        self.angle()
            .filter(|_| !matches!(self.kind, Kind::Number { .. }))
    }
    /// `<color>`: hex and `rgb()` / `hsl()` serialize as `rgb()` / `rgba()`, keywords lowercase.
    pub(super) fn color(&self) -> Option<String> {
        match &self.kind {
            Kind::Hash(value) => hex_color(value),
            Kind::Ident(_) => {
                let name = self.ident()?;
                (SYSTEM_COLORS.contains(&name.as_str())
                    || canonicalize_color(&name, true).is_some())
                .then_some(name)
            }
            Kind::Function(name) if COLOR_FUNCTIONS.contains(&name.as_str()) => {
                Some(self.text.clone())
            }
            _ => None,
        }
    }
    pub(super) fn url(&self) -> Option<String> {
        matches!(self.kind, Kind::Url(_)).then(|| self.text.clone())
    }
    /// `<image>` (not `none`).
    pub(super) fn image(&self) -> Option<String> {
        self.url().or_else(|| {
            self.function()
                .filter(|name| IMAGE_FUNCTIONS.contains(name))
                .map(|_| self.text.clone())
        })
    }
    pub(super) fn string(&self) -> Option<String> {
        matches!(self.kind, Kind::Str(_)).then(|| self.text.clone())
    }
    /// `<custom-ident>` excluding the CSS-wide keywords, `default` and `excluded`.
    pub(super) fn custom_ident(&self, excluded: &[&str]) -> Option<String> {
        let Kind::Ident(name) = &self.kind else {
            return None;
        };
        let lower = name.to_ascii_lowercase();
        (!CSS_WIDE.contains(&lower.as_str())
            && lower != "default"
            && !excluded.contains(&lower.as_str()))
        .then(|| name.clone())
    }
    pub(super) fn dashed_ident(&self) -> Option<String> {
        match &self.kind {
            Kind::Ident(name) if name.starts_with("--") && name.len() > 2 => Some(name.clone()),
            _ => None,
        }
    }
    pub(super) fn function_named(&self, names: &[&str]) -> Option<String> {
        self.function()
            .filter(|name| names.contains(name))
            .map(|_| self.text.clone())
    }
}

fn visit(comps: &[Comp], callback: &mut dyn FnMut(&Comp)) {
    for comp in comps {
        callback(comp);
        if let Kind::Function(_) = comp.kind {
            if let Some(inner) = comp
                .text
                .find(['(', '['])
                .and_then(|at| components(&comp.text[at + 1..comp.text.len() - 1]))
            {
                visit(&inner, callback);
            }
        }
    }
}

/// Whether the raw value holds a `var()` / `env()` / `attr()` reference anywhere.
pub(super) fn has_substitution(value: &str) -> bool {
    // Reads the whole (nested) input: `parse_nested_block` only keeps a block's result when
    // the closure exhausted it (turbo-dom#115).
    fn scan(input: &mut Parser<'_, '_>) -> bool {
        let mut found = false;
        while let Ok(token) = input.next_including_whitespace_and_comments() {
            let nested = match token.clone() {
                Token::Function(name) => {
                    let lower = name.to_ascii_lowercase();
                    found |= matches!(lower.as_str(), "var" | "env" | "attr" | "if" | "inherit");
                    true
                }
                Token::ParenthesisBlock | Token::SquareBracketBlock | Token::CurlyBracketBlock => {
                    true
                }
                _ => false,
            };
            if nested {
                found |= input
                    .parse_nested_block(|input| Ok::<_, cssparser::ParseError<'_, ()>>(scan(input)))
                    .unwrap_or(false);
            }
        }
        found
    }
    let mut source = ParserInput::new(value);
    let mut input = Parser::new(&mut source);
    scan(&mut input)
}

/// The value normalized the way Chrome keeps a pending-substitution shorthand: tokens joined
/// as authored, runs of whitespace collapsed.
pub(super) fn substitution_text(value: &str) -> String {
    let mut out = String::new();
    let mut space = false;
    for character in value.trim().chars() {
        if character.is_whitespace() {
            space = true;
            continue;
        }
        if space && !out.is_empty() {
            out.push(' ');
        }
        space = false;
        out.push(character);
    }
    out
}

/// Chrome's spelling of a (lowercased) function name: the transform functions with a capital
/// letter keep it (`translateX`, `scaleY`, `rotateZ`, `skewX`, …); every other name is lowercase
/// (turbo-dom#225).
fn camel_function(name: &str) -> std::borrow::Cow<'_, str> {
    const CAMEL: &[&str] = &[
        "translateX",
        "translateY",
        "translateZ",
        "scaleX",
        "scaleY",
        "scaleZ",
        "rotateX",
        "rotateY",
        "rotateZ",
        "skewX",
        "skewY",
    ];
    match CAMEL.iter().find(|c| c.eq_ignore_ascii_case(name)) {
        Some(c) => std::borrow::Cow::Borrowed(c),
        None => std::borrow::Cow::Borrowed(name),
    }
}
