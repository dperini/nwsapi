//! Math expressions Chrome 156 keeps unresolved at parse time because an operand is only
//! known at computed-value time: the tree-counting functions `sibling-index()` /
//! `sibling-count()` (turbo-dom#338). Blink simplifies the expression tree around them:
//! literal factors of a product multiply into one leading coefficient (absolute lengths in
//! px, times in s), literal terms of a sum add up in front (numbers, then percentages, then
//! units in ASCII order), nested sums and products flatten, and a product inside a sum (or a
//! sum inside a product) is parenthesized: `calc(sibling-index() * 2px + 1px)` is
//! `calc(1px + (2px * sibling-index()))`. Chrome 156 control:
//! `tests/fixtures/css_tree_counting_shape_chrome156.json`.
use super::components::{calc_text, canonical_terms, components, literal, Comp, Kind, Terms};

/// Whether `comps` hold a tree-counting function, nested ones included (function texts are
/// spelled lowercase with empty argument lists).
pub(super) fn has_tree_counting(comps: &[Comp]) -> bool {
    comps.iter().any(|comp| {
        matches!(comp.kind, Kind::Function(_))
            && (comp.text.contains("sibling-index()") || comp.text.contains("sibling-count()"))
    })
}

enum Expr {
    /// Like-unit literal terms.
    Literal(Terms),
    /// The literal terms, then the unresolved ones (`true`: subtracted).
    Sum(Terms, Vec<(bool, Expr)>),
    /// The coefficient (unit, value) and the factors (`true`: a divisor).
    Product((String, f64), Vec<(bool, Expr)>),
    /// A function kept as written: a tree-counting function or another math function.
    Function(String),
}

/// The re-tokenized arguments of a function or block `comp` spelled, after `open` bytes.
fn nested(comp: &Comp, open: usize) -> Vec<Comp> {
    components(&comp.text[open..comp.text.len() - 1])
        .expect("a function's text is its tokenized arguments re-joined")
}

fn operand(comp: &Comp) -> Expr {
    if let Some(terms) = literal(comp) {
        return Expr::Literal(canonical_terms(terms));
    }
    // `calc_type` admitted only literals, blocks and math functions as operands.
    match &comp.kind {
        Kind::Function(name) if name == "(" => sum(&nested(comp, 1)),
        // A nested math function Chrome simplified already spells `calc(...)`.
        _ if comp.text.starts_with("calc(") => sum(&nested(comp, 5)),
        _ => Expr::Function(comp.text.clone()),
    }
}

/// Add like-unit `terms` into `into`, negated when `negative`.
fn add_terms(into: &mut Terms, terms: Terms, negative: bool) {
    let sign = if negative { -1.0 } else { 1.0 };
    for (unit, value) in terms {
        match into.iter_mut().find(|(existing, _)| *existing == unit) {
            Some(term) => term.1 += sign * value,
            None => into.push((unit, sign * value)),
        }
    }
}

/// A checked `calc()` sum: operands at even positions, `+` / `-` / `*` / `/` between them.
fn sum(comps: &[Comp]) -> Expr {
    let mut literals = Terms::new();
    let mut rest = Vec::new();
    let mut start = 0;
    let mut negative = false;
    for index in (1..=comps.len()).step_by(2) {
        let next = comps.get(index).map(|comp| &comp.kind);
        if !matches!(next, None | Some(Kind::Delim('+' | '-'))) {
            continue;
        }
        match product(&comps[start..index]) {
            Expr::Literal(terms) => add_terms(&mut literals, terms, negative),
            Expr::Sum(terms, terms_rest) => {
                add_terms(&mut literals, terms, negative);
                rest.extend(
                    terms_rest
                        .into_iter()
                        .map(|(minus, term)| (minus != negative, term)),
                );
            }
            other => rest.push((negative, other)),
        }
        negative = next == Some(&Kind::Delim('-'));
        start = index + 1;
    }
    if rest.is_empty() {
        return Expr::Literal(literals);
    }
    if literals.is_empty() && rest.len() == 1 && !rest[0].0 {
        return rest.remove(0).1;
    }
    Expr::Sum(literals, rest)
}

/// A checked product: operands at even positions, `*` / `/` between them.
fn product(comps: &[Comp]) -> Expr {
    let mut coefficient = (String::new(), 1.0);
    let mut factors = Vec::new();
    for (index, comp) in comps.iter().enumerate().step_by(2) {
        let divisor = index > 0 && matches!(comps[index - 1].kind, Kind::Slash | Kind::Delim('/'));
        match (operand(comp), divisor) {
            // `calc_type` admitted unitless divisors and at most one unit per product.
            (Expr::Literal(terms), _) if terms.len() == 1 => {
                let (unit, value) = &terms[0];
                if divisor {
                    coefficient.1 /= value;
                } else {
                    coefficient.1 *= value;
                    if !unit.is_empty() {
                        coefficient.0.clone_from(unit);
                    }
                }
            }
            (Expr::Product((unit, value), more), false) => {
                coefficient.1 *= value;
                if !unit.is_empty() {
                    coefficient.0 = unit;
                }
                factors.extend(more);
            }
            (other, divisor) => factors.push((divisor, other)),
        }
    }
    if factors.is_empty() {
        return Expr::Literal(vec![coefficient]);
    }
    if matches!((&coefficient, factors.as_slice()), ((u, v), [(false, _)]) if u.is_empty() && *v == 1.0)
    {
        return factors.remove(0).1;
    }
    Expr::Product(coefficient, factors)
}

/// `calc()`'s text without the wrapper; `(...)` around a nested sum or product.
fn text(expr: &Expr, grouped: bool) -> String {
    let body = match expr {
        Expr::Function(text) => return text.clone(),
        Expr::Literal(terms) => literal_text(terms),
        Expr::Sum(literals, rest) => sum_text(literals, rest),
        Expr::Product(coefficient, factors) => product_text(coefficient, factors),
    };
    if grouped {
        format!("({body})")
    } else {
        body
    }
}

/// Like-unit terms as a `calc()` sum's text without the wrapper.
fn literal_text(terms: &[(String, f64)]) -> String {
    let text = calc_text(terms.to_vec());
    text[5..text.len() - 1].to_string()
}

fn sum_text(literals: &Terms, rest: &[(bool, Expr)]) -> String {
    let mut out = String::new();
    if !literals.is_empty() {
        out = literal_text(literals);
    }
    // The first term is never subtracted: a sum's first product is added, and a flattened
    // group starts with its own literals or its own added term.
    for (minus, term) in rest {
        if !out.is_empty() {
            out.push_str(if *minus { " - " } else { " + " });
        }
        out.push_str(&text(term, true));
    }
    out
}

fn product_text((unit, value): &(String, f64), factors: &[(bool, Expr)]) -> String {
    let mut out = String::new();
    // A unitless 1 is left out before a multiplied factor.
    if !(unit.is_empty() && *value == 1.0 && !factors[0].0) {
        out = literal_text(&[(unit.clone(), *value)]);
    }
    for (divisor, factor) in factors {
        if !out.is_empty() {
            out.push_str(if *divisor { " / " } else { " * " });
        }
        out.push_str(&text(factor, true));
    }
    out
}

/// `calc(<sum>)` holding a tree-counting function, as Chrome spells it: a lone function
/// without the `calc()` wrapper (`calc(sibling-index())` is `sibling-index()`).
pub(super) fn calc_text_of(inner: &[Comp]) -> String {
    match sum(inner) {
        Expr::Function(text) => text,
        expr => format!("calc({})", text(&expr, false)),
    }
}

/// A math function argument (a sum) holding a tree-counting function, without a wrapper.
pub(super) fn argument_text(argument: &[Comp]) -> String {
    text(&sum(argument), false)
}
