//! The `shape()` basic shape (CSS Shapes 2) as Chrome 156 parses and spells it
//! (turbo-dom#338): `shape(<fill-rule>? from <position>, <shape-command>#)`, the default
//! `nonzero` rule, `from origin` / `from start` anchors, `ccw` / `small` / `rotate 0deg` arc
//! flags and the default reference box of `clip-path` / `offset-path` (`border-box`) and
//! `shape-outside` (`margin-box`) left out. Chrome 156 control:
//! `tests/fixtures/css_math_shape_chrome156.json`.
use super::components::{components, Comp};
use super::grammar::position;

/// A `<position>` (one, two or four components): `x y`.
fn position_text(comps: &[Comp]) -> Option<String> {
    if comps.len() == 3 {
        return None;
    }
    let (x, y) = position(comps)?;
    Some(format!("{x} {y}"))
}

/// `<length-percentage>{2}`.
fn coordinate_pair(comps: &[Comp]) -> Option<String> {
    match comps {
        [x, y] => Some(format!(
            "{} {}",
            x.length_percentage(true)?,
            y.length_percentage(true)?
        )),
        _ => None,
    }
}

/// A control point: a `<position>` (a `to` command only) or a coordinate pair anchored
/// `from start | end | origin`, the command's default anchor left out.
fn control_point(comps: &[Comp], absolute: bool) -> Option<String> {
    let default = if absolute { "origin" } else { "start" };
    if let [_, _, from, anchor] = comps {
        if !from.is_ident(&["from"]) {
            return None;
        }
        let anchor = anchor.keyword(&["start", "end", "origin"])?;
        let pair = coordinate_pair(&comps[..2])?;
        return Some(if anchor == default {
            pair
        } else {
            format!("{pair} from {anchor}")
        });
    }
    if absolute {
        position_text(comps)
    } else {
        coordinate_pair(comps)
    }
}

/// `to <position>` or `by <coordinate-pair>`: the text and whether it is absolute.
fn end_point(comps: &[Comp]) -> Option<(String, bool)> {
    let (way, rest) = comps.split_first()?;
    match way.keyword(&["to", "by"])?.as_str() {
        "to" => Some((format!("to {}", position_text(rest)?), true)),
        _ => Some((format!("by {}", coordinate_pair(rest)?), false)),
    }
}

/// `with <control-point> [/ <control-point>]?` (`two`: the second one allowed); `None` when
/// `comps` are empty (no `with`).
fn controls(comps: &[Comp], absolute: bool, two: bool) -> Option<String> {
    // `split_end` cut the end point at the `with`.
    let (_, rest) = comps.split_first()?;
    let points: Vec<&[Comp]> = rest.split(Comp::is_slash).collect();
    if points.len() > if two { 2 } else { 1 } {
        return None;
    }
    let texts = points
        .into_iter()
        .map(|point| control_point(point, absolute))
        .collect::<Option<Vec<_>>>()?;
    Some(format!("with {}", texts.join(" / ")))
}

/// The end point at the front of `comps` (`to` + a position up to `stop`, or `by` + a pair)
/// and the rest.
fn split_end<'c>(comps: &'c [Comp], stop: &[&str]) -> Option<(String, bool, &'c [Comp])> {
    let at = comps
        .iter()
        .skip(1)
        .position(|comp| comp.is_ident(stop))
        .map_or(comps.len(), |at| at + 1);
    let (text, absolute) = end_point(&comps[..at])?;
    Some((text, absolute, &comps[at..]))
}

/// `hline` / `vline`: `to` a length-percentage or a side keyword of the axis, or `by` one.
fn axis_line(comps: &[Comp], sides: &[&str]) -> Option<String> {
    match comps {
        [way, value] if way.is_ident(&["to"]) => Some(format!(
            "to {}",
            value
                .keyword(sides)
                .or_else(|| value.length_percentage(true))?
        )),
        [way, value] if way.is_ident(&["by"]) => {
            Some(format!("by {}", value.length_percentage(true)?))
        }
        _ => None,
    }
}

/// `arc <end> [of <lp>{1,2}] && [cw | ccw]? && [large | small]? && [rotate <angle>]?`.
fn arc_of_radii(rest: &[Comp]) -> Option<(String, usize)> {
    let values: Vec<String> = rest
        .iter()
        .take(2)
        .map_while(|comp| comp.length_percentage(true))
        .collect();
    (!values.is_empty()).then(|| {
        let len = values.len();
        (values.join(" "), len + 1)
    })
}

fn arc(comps: &[Comp]) -> Option<String> {
    let (end, _, mut rest) = split_end(comps, &["of", "cw", "ccw", "large", "small", "rotate"])?;
    let (mut radii, mut sweep, mut size, mut rotate) = (None, None, None, None);
    while let Some(first) = rest.first() {
        let used = match first.ident()?.as_str() {
            "of" if radii.is_none() => {
                let (r, used) = arc_of_radii(&rest[1..])?;
                radii = Some(r);
                used
            }
            keyword @ ("cw" | "ccw") if sweep.is_none() => {
                sweep = Some(keyword == "cw");
                1
            }
            keyword @ ("large" | "small") if size.is_none() => {
                size = Some(keyword == "large");
                1
            }
            "rotate" if rotate.is_none() => {
                let angle = rest.get(1)?;
                angle.angle_strict()?;
                rotate = Some(angle);
                2
            }
            _ => return None,
        };
        rest = &rest[used..];
    }
    Some(arc_text(&end, &radii?, sweep, size, rotate))
}

fn arc_text(
    end: &str,
    radii: &str,
    sweep: Option<bool>,
    size: Option<bool>,
    rotate: Option<&Comp>,
) -> String {
    let mut out = format!("{end} of {radii}");
    if sweep == Some(true) {
        out.push_str(" cw");
    }
    if size == Some(true) {
        out.push_str(" large");
    }
    if let Some(angle) = rotate.filter(|angle| !zero_angle(angle)) {
        out = format!("{out} rotate {}", angle.text);
    }
    out
}

fn zero_angle(angle: &Comp) -> bool {
    matches!(angle.kind, super::components::Kind::Dimension { value, .. } if value == 0.0)
}

/// One `<shape-command>`.
fn curve_smooth(name: &str, rest: &[Comp]) -> Option<String> {
    let (end, absolute, rest) = split_end(rest, &["with"])?;
    if rest.is_empty() && name == "smooth" {
        Some(end)
    } else {
        Some(format!(
            "{end} {}",
            controls(rest, absolute, name == "curve")?
        ))
    }
}

fn command_text(name: &str, rest: &[Comp]) -> Option<String> {
    match name {
        "close" if rest.is_empty() => Some(String::new()),
        "move" | "line" => Some(end_point(rest)?.0),
        "hline" => axis_line(rest, &["left", "center", "right", "x-start", "x-end"]),
        "vline" => axis_line(rest, &["top", "center", "bottom", "y-start", "y-end"]),
        "curve" | "smooth" => curve_smooth(name, rest),
        "arc" => arc(rest),
        _ => None,
    }
}

fn command(comps: &[Comp]) -> Option<String> {
    let (first, rest) = comps.split_first()?;
    let name = first.ident()?;
    let text = command_text(&name, rest)?;
    Some(if text.is_empty() {
        name
    } else {
        format!("{name} {text}")
    })
}

/// A `shape()` function `comp` in Chrome's spelling, `None` when Chrome rejects it.
fn shape_head(head: &[Comp]) -> Option<(Option<String>, &[Comp])> {
    let (rule, head) = match head.first() {
        Some(first) if first.is_ident(&["nonzero", "evenodd"]) => (first.ident(), &head[1..]),
        _ => (None, head),
    };
    let (from, start) = head.split_first()?;
    if !from.is_ident(&["from"]) {
        return None;
    }
    Some((rule, start))
}

pub(super) fn shape_text(comp: &Comp) -> Option<String> {
    let inner = components(&comp.text[6..comp.text.len() - 1])?;
    let mut items: Vec<&[Comp]> = inner.split(Comp::is_comma).collect();
    if items.len() > 2 && items.last().is_some_and(|item| item.is_empty()) {
        items.pop();
    }
    let (head, commands) = items.split_first().filter(|(_, cmds)| !cmds.is_empty())?;
    let (rule, start) = shape_head(head)?;
    let mut parts = vec![format!("from {}", position_text(start)?)];
    for item in commands {
        parts.push(command(item)?);
    }
    let rule = match rule.as_deref() {
        Some("evenodd") => "evenodd ",
        _ => "",
    };
    Some(format!("shape({rule}{})", parts.join(", ")))
}

/// `shape() || <box>` (the box in `boxes`, `default` left out) as Chrome spells it: the
/// shape, then a box other than the default. `None` when `comps` hold no valid `shape()`.
pub(super) fn shape_with_box(comps: &[Comp], boxes: &[&str], default: &str) -> Option<String> {
    let (shape, reference) = match comps {
        [shape] => (shape, None),
        [shape, reference] if shape.function_named(&["shape"]).is_some() => {
            (shape, Some(reference))
        }
        [reference, shape] => (shape, Some(reference)),
        _ => return None,
    };
    shape.function_named(&["shape"])?;
    let text = shape_text(shape)?;
    match reference.map(|reference| reference.keyword(boxes)) {
        None => Some(text),
        Some(None) => None,
        Some(Some(name)) if name == default => Some(text),
        Some(Some(name)) => Some(format!("{text} {name}")),
    }
}

#[cfg(test)]
mod tests {
    use crate::rtdom::css_shorthand::{longhand_value, Spelled};

    /// `shape_head` rejects a head whose first token after an explicit fill-rule is not
    /// `from` (Chrome requires the `from <position>` anchor); the whole `shape()` is invalid.
    #[test]
    fn shape_head_without_from_after_fill_rule_is_invalid() {
        assert!(matches!(
            longhand_value("clip-path", "shape(nonzero foo, line to 0px 0px)"),
            Spelled::Invalid
        ));
    }
}
