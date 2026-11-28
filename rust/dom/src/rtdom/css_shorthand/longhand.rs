//! Longhand specified values the way Chrome 156 spells them (turbo-dom#97): the longhands
//! of the shorthands (and a few common ones) go through their value grammar, which admits or
//! rejects the value; any other longhand gets the context-free spelling (units and keywords
//! lowercase, `0` as `0px` where a length is meant, `url("...")`, double-quoted strings,
//! `rgb()` colors, simplified `calc()`), for the embedder to validate.
use super::components::{
    components, has_substitution, join, substitution_text, Comp, Kind, CSS_WIDE,
};
use super::grammar::{
    alternates, area_row, areas_text, bg_size, collapse4, color, commas, corner_shape, delay_v,
    easing, font_family, gap_v, group_set, kw, line_style, line_width, margin_v, marker_v,
    outline_style, overflow_v, overscroll_v, padding_v, path_data_valid, path_text, position,
    radius, range_value, repeat_style, rotate_part, rule_break_v, rule_inset_v, rule_visibility_v,
    scroll_margin_v, scroll_padding_v, single, spacing_v, track_list, try_fallbacks, Ty, CAPS,
    EAST_ASIAN, FONT_SIZES, LIGATURES, NUMERIC, STRETCHES,
};
use super::shape::shape_with_box;

/// A longhand value's spelling.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Spelled {
    /// The value is valid for the longhand; Chrome's spelling.
    Valid(String),
    /// The longhand's grammar rejects the value.
    Invalid,
    /// No grammar here for the longhand: Chrome's spelling if the embedder admits it.
    Unchecked(String),
}

type Parse = fn(&[Comp]) -> Option<String>;

fn one_of(comps: &[Comp], ty: Ty) -> Option<String> {
    single(comps, ty)
}
/// A comma list of `item`s.
fn listed(comps: &[Comp], item: impl Fn(&[Comp]) -> Option<String>) -> Option<String> {
    commas(comps)?
        .into_iter()
        .map(item)
        .collect::<Option<Vec<_>>>()
        .map(|items| items.join(", "))
}
fn keywords(comps: &[Comp], names: &[&str]) -> Option<String> {
    match comps {
        [only] => kw(only, names),
        _ => None,
    }
}
fn radius_pair(comps: &[Comp]) -> Option<String> {
    match comps {
        [a] => radius(a),
        [a, b] => {
            let (a, b) = (radius(a)?, radius(b)?);
            Some(if a == b { a } else { format!("{a} {b}") })
        }
        _ => None,
    }
}
fn flex_factor(comps: &[Comp]) -> Option<String> {
    single(comps, |c| c.number(false))
}
fn flex_basis(comps: &[Comp]) -> Option<String> {
    single(comps, |c| {
        kw(
            c,
            &[
                "auto",
                "content",
                "min-content",
                "max-content",
                "fit-content",
            ],
        )
        .or_else(|| c.length_percentage(false))
    })
}
fn font_size(comps: &[Comp]) -> Option<String> {
    single(comps, |c| {
        kw(c, FONT_SIZES).or_else(|| c.length_percentage(false))
    })
}
fn font_weight(comps: &[Comp]) -> Option<String> {
    single(comps, |c| {
        kw(c, &["normal", "bold", "bolder", "lighter"]).or_else(|| {
            // A literal weight is in [1, 1000]; a math function is checked when computed.
            c.number(false).filter(|_| match c.kind {
                Kind::Number { value, .. } => (1.0..=1000.0).contains(&value),
                _ => true,
            })
        })
    })
}
fn font_style(comps: &[Comp]) -> Option<String> {
    match comps {
        [only] => kw(only, &["normal", "italic", "oblique"]),
        [oblique, angle] if oblique.is_ident(&["oblique"]) => super::grammar::oblique(angle),
        _ => None,
    }
}
fn line_height(comps: &[Comp]) -> Option<String> {
    single(comps, |c| {
        kw(c, &["normal"])
            .or_else(|| c.number(false))
            .or_else(|| c.length_percentage(false))
    })
}
fn font_stretch(comps: &[Comp]) -> Option<String> {
    single(comps, |c| {
        kw(c, &["normal"])
            .or_else(|| kw(c, STRETCHES))
            .or_else(|| c.percentage(false))
    })
}
fn variant_groups(comps: &[Comp], groups: &[&[&str]], extra: &[&str]) -> Option<String> {
    if let [only] = comps {
        if let Some(value) = kw(only, extra) {
            return Some(value);
        }
    }
    let (used, value) = group_set(comps, groups)?;
    (used == comps.len()).then_some(value)
}
fn ligatures(comps: &[Comp]) -> Option<String> {
    variant_groups(comps, LIGATURES, &["normal", "none"])
}
fn numeric(comps: &[Comp]) -> Option<String> {
    variant_groups(comps, NUMERIC, &["normal"])
}
fn east_asian(comps: &[Comp]) -> Option<String> {
    variant_groups(comps, EAST_ASIAN, &["normal"])
}
fn position_try_fallbacks(comps: &[Comp]) -> Option<String> {
    match comps {
        [only] if only.is_ident(&["none"]) => Some("none".into()),
        _ => try_fallbacks(comps),
    }
}
fn z_index(comps: &[Comp]) -> Option<String> {
    single(comps, |c| kw(c, &["auto"]).or_else(|| c.integer(i64::MIN)))
}
const SIZE_FUNCTIONS: &[&str] = &["anchor-size", "calc-size"];
fn size(comps: &[Comp]) -> Option<String> {
    single(comps, |c| {
        kw(
            c,
            &[
                "auto",
                "min-content",
                "max-content",
                "fit-content",
                "stretch",
                "-webkit-fill-available",
            ],
        )
        .or_else(|| c.length_percentage(false))
        .or_else(|| c.function_named(SIZE_FUNCTIONS))
    })
}
fn max_size(comps: &[Comp]) -> Option<String> {
    single(comps, |c| {
        kw(
            c,
            &[
                "none",
                "min-content",
                "max-content",
                "fit-content",
                "stretch",
                "-webkit-fill-available",
            ],
        )
        .or_else(|| c.length_percentage(false))
        .or_else(|| c.function_named(SIZE_FUNCTIONS))
    })
}
fn image_list(comps: &[Comp]) -> Option<String> {
    listed(comps, |item| {
        single(item, |c| c.image().or_else(|| kw(c, &["none"])))
    })
}
fn repeat_list(comps: &[Comp]) -> Option<String> {
    listed(comps, |item| {
        repeat_style(item)
            .filter(|(used, _)| *used == item.len())
            .map(|(_, text)| text)
    })
}
fn size_list(comps: &[Comp]) -> Option<String> {
    listed(comps, |item| {
        bg_size(item)
            .filter(|(used, _)| *used == item.len())
            .map(|(_, text)| text)
    })
}
fn position_x(comps: &[Comp]) -> Option<String> {
    listed(comps, |item| match item {
        [only] => kw(only, &["left", "center", "right"]).or_else(|| only.length_percentage(true)),
        [side, offset] if side.is_ident(&["left", "right"]) => Some(format!(
            "{} {}",
            side.ident()?,
            offset.length_percentage(true)?
        )),
        _ => None,
    })
}
fn position_y(comps: &[Comp]) -> Option<String> {
    listed(comps, |item| match item {
        [only] => kw(only, &["top", "center", "bottom"]).or_else(|| only.length_percentage(true)),
        [side, offset] if side.is_ident(&["top", "bottom"]) => Some(format!(
            "{} {}",
            side.ident()?,
            offset.length_percentage(true)?
        )),
        _ => None,
    })
}
fn time_list(comps: &[Comp]) -> Option<String> {
    listed(comps, |item| single(item, |c| c.time(true)))
}
fn duration_list(comps: &[Comp]) -> Option<String> {
    listed(comps, |item| single(item, |c| c.time(false)))
}
fn easing_list(comps: &[Comp]) -> Option<String> {
    listed(comps, |item| single(item, easing))
}
fn transition_property(comps: &[Comp]) -> Option<String> {
    // `none` only stands alone.
    if comps.len() > 1 && comps.iter().any(|comp| comp.is_ident(&["none"])) {
        return None;
    }
    listed(comps, |item| {
        single(item, |c| {
            kw(c, &["none", "all"]).or_else(|| {
                c.custom_ident(&["none", "initial"]).map(|value| {
                    if value.starts_with("--") {
                        value
                    } else {
                        value.to_ascii_lowercase()
                    }
                })
            })
        })
    })
}
fn grid_line_value(comps: &[Comp]) -> Option<String> {
    super::grammar::grid_line(comps)
}
fn track_list_value(comps: &[Comp]) -> Option<String> {
    track_list(comps)
}
fn range_start(comps: &[Comp]) -> Option<String> {
    range_value(comps, "normal", false)
        .filter(|(used, ..)| *used == comps.len())
        .map(|(_, text, _)| text)
}
fn range_end(comps: &[Comp]) -> Option<String> {
    range_value(comps, "normal", true)
        .filter(|(used, ..)| *used == comps.len())
        .map(|(_, text, _)| text)
}
fn text_decoration_line(comps: &[Comp]) -> Option<String> {
    if let [only] = comps {
        if only.is_ident(&["none"]) {
            return Some("none".into());
        }
    }
    let order = [
        "underline",
        "overline",
        "line-through",
        "blink",
        "spelling-error",
        "grammar-error",
    ];
    let mut seen = Vec::new();
    for comp in comps {
        match comp.keyword(&order) {
            Some(name) if !seen.contains(&name) => seen.push(name),
            _ => return None,
        }
    }
    let text: Vec<&str> = order
        .iter()
        .copied()
        .filter(|name| seen.iter().any(|seen| seen == name))
        .collect();
    (!text.is_empty()).then(|| text.join(" "))
}

fn grid_areas(comps: &[Comp]) -> Option<String> {
    match comps {
        [only] if only.is_ident(&["none"]) => Some("none".into()),
        _ => areas_text(&comps.iter().map(area_row).collect::<Option<Vec<_>>>()?),
    }
}
/// The `<coord-box>` keywords (`offset-path`).
const COORD_BOXES: &[&str] = &[
    "content-box",
    "padding-box",
    "border-box",
    "fill-box",
    "stroke-box",
    "view-box",
];
/// `clip-path`'s `shape() || <geometry-box>` and `path()`; the embedder's grammar decides the
/// other values.
fn clip_path(comps: &[Comp]) -> Option<String> {
    let mut boxes = COORD_BOXES.to_vec();
    boxes.push("margin-box");
    shape_with_box(comps, &boxes, "border-box").or_else(|| {
        single(comps, |c| {
            c.function_named(&["path"])
                .filter(|value| path_data_valid(value))
                .map(|value| path_text(&value))
        })
    })
}
/// `shape-outside`'s `shape() || <shape-box>`; the embedder's grammar decides the other values.
fn shape_outside(comps: &[Comp]) -> Option<String> {
    shape_with_box(
        comps,
        &["margin-box", "border-box", "padding-box", "content-box"],
        "margin-box",
    )
}
fn offset_path(comps: &[Comp]) -> Option<String> {
    if comps.iter().any(|c| c.function_named(&["shape"]).is_some()) {
        return shape_with_box(comps, COORD_BOXES, "border-box");
    }
    single(comps, |c| {
        kw(c, &["none"]).or_else(|| {
            c.function_named(&[
                "path", "ray", "circle", "ellipse", "inset", "polygon", "xywh", "rect",
            ])
            .or_else(|| c.url())
            .filter(|value| !value.starts_with("path(") || path_data_valid(value))
            .map(|value| {
                if value.starts_with("path(") {
                    path_text(&value)
                } else {
                    value
                }
            })
        })
    })
}
fn opacity(comps: &[Comp]) -> Option<String> {
    single(comps, |c| {
        c.number(true).or_else(|| match c.kind {
            Kind::Percentage(value) => Some(super::super::css_values::css_number(value / 100.0)),
            // A percentage `calc()` stays as written.
            _ => c.length_percentage(true).filter(|_| c.text.contains('%')),
        })
    })
}
/// `display`: Chrome spells the two-keyword forms with their one-keyword names.
fn display(comps: &[Comp]) -> Option<String> {
    match comps {
        [only] => kw(
            only,
            &[
                "none",
                "contents",
                "block",
                "inline",
                "inline-block",
                "flow-root",
                "flex",
                "inline-flex",
                "grid",
                "inline-grid",
                "table",
                "inline-table",
                "table-row-group",
                "table-header-group",
                "table-footer-group",
                "table-row",
                "table-cell",
                "table-column-group",
                "table-column",
                "table-caption",
                "list-item",
                "ruby",
                "ruby-text",
                "math",
                "-webkit-box",
                "-webkit-inline-box",
            ],
        ),
        [outer, inner] => {
            let pair = (outer.ident()?, inner.ident()?);
            let name = match (pair.0.as_str(), pair.1.as_str()) {
                ("block", "flow") | ("flow", "block") => "block",
                ("inline", "flow") | ("flow", "inline") => "inline",
                ("inline", "flow-root") | ("flow-root", "inline") => "inline-block",
                ("block", "flow-root") | ("flow-root", "block") => "flow-root",
                ("block", "flex") | ("flex", "block") => "flex",
                ("inline", "flex") | ("flex", "inline") => "inline-flex",
                ("block", "grid") | ("grid", "block") => "grid",
                ("inline", "grid") | ("grid", "inline") => "inline-grid",
                ("block", "table") | ("table", "block") => "table",
                ("inline", "table") | ("table", "inline") => "inline-table",
                ("block", "ruby") | ("ruby", "block") => "block ruby",
                ("inline", "ruby") | ("ruby", "inline") => "ruby",
                _ => return None,
            };
            Some(name.into())
        }
        _ => None,
    }
}
fn animation_names(comps: &[Comp]) -> Option<String> {
    listed(comps, |item| {
        single(item, |c| {
            if c.is_ident(&["none"]) {
                return Some("none".into());
            }
            if matches!(c.kind, Kind::Str(_)) {
                return super::grammar::animation_name_string(c);
            }
            c.custom_ident(&["none"])
        })
    })
}
fn box_shadow(comps: &[Comp]) -> Option<String> {
    shadow(comps, true)
}
fn text_shadow(comps: &[Comp]) -> Option<String> {
    shadow(comps, false)
}
fn offset_rotate(comps: &[Comp]) -> Option<String> {
    match rotate_part(comps)? {
        (used, text) if used == comps.len() => Some(text),
        _ => None,
    }
}
/// `box-shadow` / `text-shadow` (`r#box`: a spread length and `inset`): each shadow as Chrome
/// orders it (color, lengths, `inset`).
fn shadow(comps: &[Comp], r#box: bool) -> Option<String> {
    if let [only] = comps {
        if only.is_ident(&["none"]) {
            return Some("none".into());
        }
    }
    listed(comps, |item| {
        let mut shadow_color = None;
        let mut inset = false;
        let mut lengths = Vec::new();
        for comp in item {
            // The blur radius (the third length) is not negative.
            let negative = matches!(comp.kind, Kind::Dimension { value, .. } if value < 0.0);
            if r#box && comp.is_ident(&["inset"]) && !inset {
                inset = true;
            } else if let Some(value) = comp.length(true).filter(|_| {
                lengths.len() < if r#box { 4 } else { 3 } && !(lengths.len() == 2 && negative)
            }) {
                lengths.push(value);
            } else {
                shadow_color = Some(comp.color().filter(|_| shadow_color.is_none())?);
            }
        }
        if lengths.len() < 2 {
            return None;
        }
        let mut parts: Vec<String> = shadow_color.into_iter().collect();
        parts.extend(lengths);
        if inset {
            parts.push("inset".into());
        }
        Some(parts.join(" "))
    })
}

/// A position longhand: one, two or (`four`) four values, and for `transform-origin` (`z`)
/// an optional depth length after two.
fn origin(comps: &[Comp], four: bool, z: bool) -> Option<String> {
    let pair = |comps: &[Comp]| position(comps).map(|(x, y)| format!("{x} {y}"));
    match comps.len() {
        1 | 2 => pair(comps),
        3 if z => Some(format!("{} {}", pair(&comps[..2])?, comps[2].length(true)?)),
        4 if four => pair(comps),
        _ => None,
    }
}
/// One to four values, collapsed the way Chrome writes a box.
fn quad(comps: &[Comp], ty: Ty) -> Option<String> {
    if comps.is_empty() || comps.len() > 4 {
        return None;
    }
    let values = comps.iter().map(ty).collect::<Option<Vec<_>>>()?;
    Some(collapse4(&values))
}
/// `border-image-slice`: up to four numbers / percentages, `fill` (before or after) last.
fn image_slice(comps: &[Comp]) -> Option<String> {
    let fill = |comp: &Comp| comp.is_ident(&["fill"]);
    let (values, filled) = match comps {
        [first, rest @ ..] if fill(first) => (rest, true),
        [rest @ .., last] if fill(last) => (rest, true),
        _ => (comps, false),
    };
    if values.is_empty() || values.len() > 4 {
        return None;
    }
    let values = values
        .iter()
        .map(|comp| comp.number(false).or_else(|| comp.percentage(false)))
        .collect::<Option<Vec<_>>>()?;
    let text = collapse4(&values);
    Some(if filled { format!("{text} fill") } else { text })
}

/// The value grammar of `name`, and whether its rejection is final (`strict`): a lenient
/// grammar's rejection leaves the value to the embedder's own grammar.
fn grammar_of(name: &str) -> Option<(Parse, bool)> {
    let parse: Parse = match name {
        "margin-top"
        | "margin-right"
        | "margin-bottom"
        | "margin-left"
        | "margin-block-start"
        | "margin-block-end"
        | "margin-inline-start"
        | "margin-inline-end"
        | "top"
        | "right"
        | "bottom"
        | "left"
        | "inset-block-start"
        | "inset-block-end"
        | "inset-inline-start"
        | "inset-inline-end" => |c| one_of(c, margin_v),
        "padding-top"
        | "padding-right"
        | "padding-bottom"
        | "padding-left"
        | "padding-block-start"
        | "padding-block-end"
        | "padding-inline-start"
        | "padding-inline-end" => |c| one_of(c, padding_v),
        "scroll-margin-top"
        | "scroll-margin-right"
        | "scroll-margin-bottom"
        | "scroll-margin-left"
        | "scroll-margin-block-start"
        | "scroll-margin-block-end"
        | "scroll-margin-inline-start"
        | "scroll-margin-inline-end" => |c| one_of(c, scroll_margin_v),
        "scroll-padding-top"
        | "scroll-padding-right"
        | "scroll-padding-bottom"
        | "scroll-padding-left"
        | "scroll-padding-block-start"
        | "scroll-padding-block-end"
        | "scroll-padding-inline-start"
        | "scroll-padding-inline-end" => |c| one_of(c, scroll_padding_v),
        "border-top-width"
        | "border-right-width"
        | "border-bottom-width"
        | "border-left-width"
        | "border-block-start-width"
        | "border-block-end-width"
        | "border-inline-start-width"
        | "border-inline-end-width"
        | "outline-width"
        | "column-rule-width"
        | "row-rule-width"
        | "-webkit-text-stroke-width" => |c| one_of(c, line_width),
        "border-top-style"
        | "border-right-style"
        | "border-bottom-style"
        | "border-left-style"
        | "border-block-start-style"
        | "border-block-end-style"
        | "border-inline-start-style"
        | "border-inline-end-style"
        | "column-rule-style"
        | "row-rule-style" => |c| one_of(c, line_style),
        "outline-style" => |c| one_of(c, outline_style),
        "border-top-color"
        | "border-right-color"
        | "border-bottom-color"
        | "border-left-color"
        | "border-block-start-color"
        | "border-block-end-color"
        | "border-inline-start-color"
        | "border-inline-end-color"
        | "outline-color"
        | "column-rule-color"
        | "row-rule-color"
        | "text-decoration-color"
        | "text-emphasis-color"
        | "-webkit-text-stroke-color"
        | "background-color"
        | "color" => |c| one_of(c, color),
        "row-gap" | "column-gap" => |c| one_of(c, gap_v),
        "overflow-x" | "overflow-y" => |c| one_of(c, overflow_v),
        "overscroll-behavior-x" | "overscroll-behavior-y" => |c| one_of(c, overscroll_v),
        "-webkit-border-horizontal-spacing" | "-webkit-border-vertical-spacing" => {
            |c| one_of(c, spacing_v)
        }
        "interest-delay-start" | "interest-delay-end" => |c| one_of(c, delay_v),
        "column-rule-inset-cap-start"
        | "column-rule-inset-cap-end"
        | "column-rule-inset-junction-start"
        | "column-rule-inset-junction-end"
        | "row-rule-inset-cap-start"
        | "row-rule-inset-cap-end"
        | "row-rule-inset-junction-start"
        | "row-rule-inset-junction-end" => |c| one_of(c, rule_inset_v),
        "column-rule-break" | "row-rule-break" => |c| one_of(c, rule_break_v),
        "column-rule-visibility-items" | "row-rule-visibility-items" => {
            |c| one_of(c, rule_visibility_v)
        }
        "marker-start" | "marker-mid" | "marker-end" => |c| one_of(c, marker_v),
        "corner-top-left-shape"
        | "corner-top-right-shape"
        | "corner-bottom-right-shape"
        | "corner-bottom-left-shape"
        | "corner-start-start-shape"
        | "corner-start-end-shape"
        | "corner-end-start-shape"
        | "corner-end-end-shape" => |c| one_of(c, corner_shape),
        "border-top-left-radius"
        | "border-top-right-radius"
        | "border-bottom-right-radius"
        | "border-bottom-left-radius" => radius_pair,
        "flex-grow" | "flex-shrink" => flex_factor,
        "flex-basis" => flex_basis,
        "flex-direction" => |c| keywords(c, &["row", "row-reverse", "column", "column-reverse"]),
        "flex-wrap" => |c| keywords(c, &["nowrap", "wrap", "wrap-reverse"]),
        "font-size" => font_size,
        "font-weight" => font_weight,
        "font-style" => font_style,
        "font-family" => font_family,
        "line-height" => line_height,
        "font-stretch" => font_stretch,
        "font-variant-caps" => |c| keywords(c, &["normal"]).or_else(|| keywords(c, CAPS)),
        "font-variant-position" => |c| keywords(c, &["normal", "sub", "super"]),
        "font-variant-emoji" => |c| keywords(c, &["normal", "text", "emoji", "unicode"]),
        "font-variant-ligatures" => ligatures,
        "font-variant-numeric" => numeric,
        "font-variant-east-asian" => east_asian,
        "font-kerning" => |c| keywords(c, &["auto", "normal", "none"]),
        "font-optical-sizing" => |c| keywords(c, &["auto", "none"]),
        "font-synthesis-weight" | "font-synthesis-style" | "font-synthesis-small-caps" => {
            |c| keywords(c, &["auto", "none"])
        }
        "position-try-fallbacks" => position_try_fallbacks,
        "position-try-order" => |c| {
            keywords(
                c,
                &[
                    "normal",
                    "most-width",
                    "most-height",
                    "most-block-size",
                    "most-inline-size",
                ],
            )
        },
        "text-decoration-line" => text_decoration_line,
        "text-decoration-style" => {
            |c| keywords(c, &["solid", "double", "dotted", "dashed", "wavy"])
        }
        "list-style-position" => |c| keywords(c, &["inside", "outside"]),
        "list-style-image" => |c| single(c, |c| c.image().or_else(|| kw(c, &["none"]))),
        "z-index" => z_index,
        "order" => |c| single(c, |c| c.integer(i64::MIN)),
        "width" | "height" | "min-width" | "min-height" | "block-size" | "inline-size"
        | "min-block-size" | "min-inline-size" => size,
        "max-width" | "max-height" | "max-block-size" | "max-inline-size" => max_size,
        "column-count" => |c| single(c, |c| kw(c, &["auto"]).or_else(|| c.integer(1))),
        "column-width" | "column-height" => {
            |c| single(c, |c| kw(c, &["auto"]).or_else(|| c.length(false)))
        }
        "column-wrap" => |c| keywords(c, &["auto", "nowrap", "wrap"]),
        "column-span" => |c| keywords(c, &["none", "all"]),
        "column-fill" => |c| keywords(c, &["auto", "balance"]),
        "break-before" | "break-after" => |c| {
            keywords(
                c,
                &[
                    "auto",
                    "avoid",
                    "avoid-page",
                    "page",
                    "left",
                    "right",
                    "recto",
                    "verso",
                    "avoid-column",
                    "column",
                ],
            )
        },
        "break-inside" => |c| keywords(c, &["auto", "avoid", "avoid-page", "avoid-column"]),
        "grid-row-start" | "grid-row-end" | "grid-column-start" | "grid-column-end" => {
            grid_line_value
        }
        "grid-template-columns" | "grid-template-rows" => track_list_value,
        "transition-duration" => duration_list,
        "animation-duration" => |c| {
            listed(c, |item| {
                single(item, |c| c.time(false).or_else(|| kw(c, &["auto"])))
            })
        },
        "font-variant-alternates" => |c| match c {
            [only] if only.is_ident(&["normal"]) => only.ident(),
            _ => alternates(c)
                .filter(|(used, _)| *used == c.len())
                .map(|(_, text)| text),
        },
        "text-align" => |c| {
            keywords(
                c,
                &[
                    "start",
                    "end",
                    "left",
                    "right",
                    "center",
                    "justify",
                    "match-parent",
                    "-webkit-left",
                    "-webkit-right",
                    "-webkit-center",
                    "-webkit-auto",
                ],
            )
        },
        "transition-delay" | "animation-delay" => time_list,
        "transition-timing-function" | "animation-timing-function" => easing_list,
        "transition-property" => transition_property,
        "background-image" | "mask-image" => image_list,
        "background-repeat" | "mask-repeat" => repeat_list,
        "background-size" | "mask-size" => size_list,
        "background-attachment" => {
            |c| listed(c, |item| keywords(item, &["scroll", "fixed", "local"]))
        }
        "background-origin" => |c| {
            listed(c, |item| {
                keywords(item, &["border-box", "padding-box", "content-box"])
            })
        },
        "background-clip" => |c| {
            listed(c, |item| {
                keywords(
                    item,
                    &[
                        "border-box",
                        "padding-box",
                        "content-box",
                        "text",
                        "border-area",
                    ],
                )
            })
        },
        "background-position-x" | "-webkit-mask-position-x" => position_x,
        "background-position-y" | "-webkit-mask-position-y" => position_y,
        "animation-range-start" => range_start,
        "animation-range-end" => range_end,
        "offset-distance" => |c| single(c, |c| c.length_percentage(true)),
        "offset-anchor" => |c| match c {
            [only] if only.is_ident(&["auto"]) => only.ident(),
            _ => origin(c, true, false),
        },
        "offset-position" => |c| match c {
            [only] if only.is_ident(&["auto", "normal"]) => only.ident(),
            _ => origin(c, true, false),
        },
        "object-position" | "perspective-origin" => |c| origin(c, true, false),
        "transform-origin" => |c| origin(c, false, true),
        "border-image-slice" => image_slice,
        "justify-items" => |c| {
            super::grammar::justify_items(c)
                .filter(|(used, _)| *used == c.len())
                .map(|(_, text)| text)
        },
        "border-image-width" => |c| {
            quad(c, |c| {
                c.number(false)
                    .or_else(|| c.length_percentage(false))
                    .or_else(|| kw(c, &["auto"]))
            })
        },
        "border-image-outset" => |c| quad(c, |c| c.number(false).or_else(|| c.length(false))),
        // `none`, or a trigger name and one or two actions per item.
        "animation-trigger" => |c| match c {
            [only] if only.is_ident(&["none"]) => only.ident(),
            _ => listed(c, |item| {
                const ACTIONS: &[&str] = &[
                    "none",
                    "play",
                    "play-once",
                    "play-forwards",
                    "play-backwards",
                    "pause",
                    "reset",
                    "replay",
                ];
                let (name, actions) = item.split_first()?;
                if !(1..=2).contains(&actions.len()) {
                    return None;
                }
                let mut parts = vec![name.dashed_ident()?];
                for action in actions {
                    parts.push(action.keyword(ACTIONS)?);
                }
                Some(parts.join(" "))
            }),
        },
        "white-space-collapse" => |c| {
            keywords(
                c,
                &["collapse", "preserve", "preserve-breaks", "break-spaces"],
            )
        },
        "text-wrap-mode" => |c| keywords(c, &["wrap", "nowrap"]),
        "text-wrap-style" => {
            |c| keywords(c, &["auto", "balance", "stable", "pretty", "avoid-orphans"])
        }
        "overflow-wrap" => |c| keywords(c, &["normal", "break-word", "anywhere"]),
        "grid-template-areas" => grid_areas,
        "offset-path" => offset_path,
        "opacity" => opacity,
        "display" => display,
        "animation-name" => animation_names,
        "box-shadow" => box_shadow,
        "text-shadow" => text_shadow,
        "offset-rotate" => offset_rotate,
        "clip-path" => clip_path,
        "shape-outside" => shape_outside,
        _ => return None,
    };
    // Image and easing lists and display have more forms than the grammar knows.
    let lenient = matches!(
        name,
        "background-image"
            | "mask-image"
            | "list-style-image"
            | "transition-timing-function"
            | "animation-timing-function"
            | "display"
            | "clip-path"
            | "shape-outside"
    );
    Some((parse, !lenient))
}

/// Properties whose identifiers are names (kept as written) rather than keywords.
const NAMED: &[&str] = &[
    "animation-name",
    "font-family",
    "container-name",
    "counter-reset",
    "counter-increment",
    "counter-set",
    "grid-area",
    "grid-row-start",
    "grid-row-end",
    "grid-column-start",
    "grid-column-end",
    "grid-template-areas",
    "view-transition-name",
    "view-transition-class",
    "anchor-name",
    "position-anchor",
    "anchor-scope",
    "timeline-scope",
    "font-palette",
    "will-change",
    "page",
    "quotes",
    "content",
];
/// Keywords those properties still spell lowercase.
const NAME_KEYWORDS: &[&str] = &["none", "auto", "span", "normal", "all", "match-element"];

/// Properties where a unitless `0` is a length (`0px`).
fn zero_is_length(name: &str) -> bool {
    let sides = ["top", "right", "bottom", "left"];
    sides.contains(&name)
        || [
            "margin",
            "padding",
            "inset",
            "width",
            "height",
            "size",
            "gap",
            "radius",
            "spacing",
            "indent",
            "offset",
            "flex-basis",
            "font-size",
            "column-width",
            "column-height",
            "perspective",
            "shape-margin",
            "position-x",
            "position-y",
            "thickness",
        ]
        .iter()
        .any(|part| name.contains(part))
}

/// Functions whose identifier arguments are names, kept as written.
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
    "url",
    "src",
    "[",
];
/// Transform functions whose unitless `0` is a length.
const LENGTH_FUNCTIONS: &[&str] = &[
    "translate",
    "translatex",
    "translatey",
    "translatez",
    "translate3d",
    "perspective",
];

/// A function's spelling: as `components` wrote it (keyword arguments lowercase), a length
/// function's `0` as `0px`.
fn function_text(function: &str, comp: &Comp) -> String {
    if NAMING_FUNCTIONS.contains(&function) {
        return comp.text.clone();
    }
    let Some(open) = comp.text.find(['(', '[']) else {
        unreachable!("a function component's text has its opening bracket");
    };
    let Some(inner) = components(&comp.text[open + 1..comp.text.len() - 1]) else {
        unreachable!("a function component's arguments were tokenized to build it");
    };
    let lengths = LENGTH_FUNCTIONS.contains(&function);
    let spelled: Vec<Comp> = inner
        .iter()
        .map(|part| {
            // The rest is spelled already: `components` lowercased the keyword arguments of
            // every function but a naming one (nested ones included), and a length
            // function's zero only counts at the top level.
            let text = match &part.kind {
                Kind::Number { value, .. } if lengths && *value == 0.0 => "0px".into(),
                _ => part.text.clone(),
            };
            Comp {
                kind: part.kind.clone(),
                text,
            }
        })
        .collect();
    format!(
        "{}{}{}",
        &comp.text[..=open],
        join(&spelled),
        &comp.text[comp.text.len() - 1..]
    )
}

/// The context-free spelling: components joined, identifiers lowercase unless they name
/// something, a lone `0` as `0px` where a length is meant.
fn generic(name: &str, comps: &[Comp]) -> String {
    let named = NAMED.contains(&name) || name.starts_with("--");
    let spelled: Vec<Comp> = comps
        .iter()
        .map(|comp| {
            let text = match &comp.kind {
                Kind::Ident(ident) if !ident.starts_with("--") => {
                    let lower = ident.to_ascii_lowercase();
                    if named && !NAME_KEYWORDS.contains(&lower.as_str()) {
                        ident.clone()
                    } else {
                        lower
                    }
                }
                Kind::Hash(_) => comp.color().unwrap_or_else(|| comp.text.clone()),
                Kind::Function(function) if !named => function_text(function, comp),
                Kind::Number { value, .. }
                    if *value == 0.0 && comps.len() == 1 && zero_is_length(name) =>
                {
                    "0px".into()
                }
                _ => comp.text.clone(),
            };
            Comp {
                kind: comp.kind.clone(),
                text,
            }
        })
        .collect();
    join(&spelled)
}

/// A lenient grammar's rejection of a `shape()` is final: the embedders' grammars do not know
/// `shape()` (turbo-dom#338).
fn has_shape(comps: &[Comp]) -> bool {
    comps.iter().any(|c| c.function_named(&["shape"]).is_some())
}

/// The specified value of longhand `name` set to `value`, as Chrome 156 spells it.
#[must_use]
pub fn longhand_value(name: &str, value: &str) -> Spelled {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Spelled::Invalid;
    }
    let lower = trimmed.to_ascii_lowercase();
    if CSS_WIDE.contains(&lower.as_str()) {
        return Spelled::Valid(lower);
    }
    if has_substitution(trimmed) {
        return Spelled::Unchecked(substitution_text(trimmed));
    }
    let Some(comps) = components(trimmed) else {
        return Spelled::Invalid;
    };
    if comps.is_empty() {
        return Spelled::Invalid;
    }
    match grammar_of(name) {
        Some((parse, strict)) => match parse(&comps) {
            Some(text) => Spelled::Valid(text),
            None if strict || has_shape(&comps) => Spelled::Invalid,
            None => Spelled::Unchecked(generic(name, &comps)),
        },
        None => Spelled::Unchecked(generic(name, &comps)),
    }
}
