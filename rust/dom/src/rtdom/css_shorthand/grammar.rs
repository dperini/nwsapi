//! Shorthand value grammars: each turns the components of a shorthand value into its
//! longhands' specified values, in the order Chrome 156 adds them, with omitted longhands at
//! their initial value (`initial` where Blink leaves them implicit).
use super::components::{components, join, Comp, Kind};
use std::fmt::Write as _;

pub(super) enum Parsed {
    Values(Vec<(&'static str, String)>),
    /// A value every longhand defers (a system font keyword).
    Pending(String),
}

type Out = Vec<(&'static str, String)>;
pub(super) type Ty = fn(&Comp) -> Option<String>;

const INITIAL: &str = "initial";

pub(super) fn kw(comp: &Comp, names: &[&str]) -> Option<String> {
    comp.keyword(names)
}
pub(super) fn margin_v(c: &Comp) -> Option<String> {
    c.length_percentage(true).or_else(|| kw(c, &["auto"]))
}
pub(super) fn padding_v(c: &Comp) -> Option<String> {
    c.length_percentage(false)
}
pub(super) fn scroll_margin_v(c: &Comp) -> Option<String> {
    c.length(true)
}
pub(super) fn scroll_padding_v(c: &Comp) -> Option<String> {
    c.length_percentage(false).or_else(|| kw(c, &["auto"]))
}
pub(super) fn line_width(c: &Comp) -> Option<String> {
    c.length(false)
        .or_else(|| kw(c, &["thin", "medium", "thick"]))
}
pub(super) const LINE_STYLES: &[&str] = &[
    "none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset",
];
pub(super) fn line_style(c: &Comp) -> Option<String> {
    kw(c, LINE_STYLES)
}
pub(super) fn color(c: &Comp) -> Option<String> {
    c.color()
}
pub(super) fn corner_shape(c: &Comp) -> Option<String> {
    kw(
        c,
        &["round", "scoop", "bevel", "notch", "square", "squircle"],
    )
    .or_else(|| c.function_named(&["superellipse"]))
}
pub(super) fn radius(c: &Comp) -> Option<String> {
    c.length_percentage(false)
}
pub(super) fn gap_v(c: &Comp) -> Option<String> {
    c.length_percentage(false).or_else(|| kw(c, &["normal"]))
}
pub(super) fn overflow_v(c: &Comp) -> Option<String> {
    kw(
        c,
        &["visible", "hidden", "clip", "scroll", "auto", "overlay"],
    )
}
pub(super) fn overscroll_v(c: &Comp) -> Option<String> {
    kw(c, &["auto", "contain", "none", "chain"])
}
pub(super) fn spacing_v(c: &Comp) -> Option<String> {
    c.length(false)
}
pub(super) fn delay_v(c: &Comp) -> Option<String> {
    kw(c, &["normal"]).or_else(|| c.time(false))
}
pub(super) fn rule_inset_v(c: &Comp) -> Option<String> {
    c.length_percentage(true)
        .or_else(|| kw(c, &["overlap-join"]))
}
pub(super) fn rule_break_v(c: &Comp) -> Option<String> {
    kw(c, &["none", "normal", "intersection"])
}
pub(super) fn rule_visibility_v(c: &Comp) -> Option<String> {
    kw(c, &["all", "normal", "around", "between"])
}
pub(super) fn marker_v(c: &Comp) -> Option<String> {
    kw(c, &["none"]).or_else(|| c.url())
}

pub(super) fn single(comps: &[Comp], ty: Ty) -> Option<String> {
    match comps {
        [comp] => ty(comp),
        _ => None,
    }
}
pub(super) fn list(comps: &[Comp], ty: Ty, max: usize) -> Option<Vec<String>> {
    if comps.is_empty() || comps.len() > max {
        return None;
    }
    comps.iter().map(ty).collect()
}
/// One to four values: top, right, bottom, left.
fn box4(comps: &[Comp], ty: Ty) -> Option<[String; 4]> {
    let v = list(comps, ty, 4)?;
    Some(match v.len() {
        1 => [v[0].clone(), v[0].clone(), v[0].clone(), v[0].clone()],
        2 => [v[0].clone(), v[1].clone(), v[0].clone(), v[1].clone()],
        3 => [v[0].clone(), v[1].clone(), v[2].clone(), v[1].clone()],
        _ => [v[0].clone(), v[1].clone(), v[2].clone(), v[3].clone()],
    })
}
fn pair(comps: &[Comp], ty: Ty) -> Option<[String; 2]> {
    let v = list(comps, ty, 2)?;
    let second = v.get(1).cloned().unwrap_or_else(|| v[0].clone());
    Some([v[0].clone(), second])
}
fn named<const N: usize>(names: &[&'static str], values: [String; N]) -> Out {
    names.iter().copied().zip(values).collect()
}
fn same(names: &[&'static str], value: &str) -> Out {
    names
        .iter()
        .map(|&name| (name, value.to_string()))
        .collect()
}

/// A slot parser: the components it consumes from the front and their value.
type Slot<'a> = &'a dyn Fn(&[Comp]) -> Option<(usize, String)>;

fn one(ty: Ty) -> impl Fn(&[Comp]) -> Option<(usize, String)> {
    move |comps: &[Comp]| comps.first().and_then(ty).map(|value| (1, value))
}

/// `a || b || ...`: each slot at most once, in any order; earlier slots win a component.
fn any_order(comps: &[Comp], slots: &[Slot<'_>]) -> Option<Vec<Option<String>>> {
    let mut out = vec![None; slots.len()];
    let mut at = 0;
    while at < comps.len() {
        let mut matched = false;
        for (index, slot) in slots.iter().enumerate() {
            if out[index].is_some() {
                continue;
            }
            if let Some((used, value)) = slot(&comps[at..]) {
                out[index] = Some(value);
                at += used;
                matched = true;
                break;
            }
        }
        if !matched {
            return None;
        }
    }
    Some(out)
}

/// Split at top-level commas; `None` on an empty item.
pub(super) fn commas(comps: &[Comp]) -> Option<Vec<&[Comp]>> {
    let items: Vec<&[Comp]> = comps.split(Comp::is_comma).collect();
    items.iter().all(|item| !item.is_empty()).then_some(items)
}
fn slashes(comps: &[Comp]) -> Vec<&[Comp]> {
    comps.split(Comp::is_slash).collect()
}

const BORDER_IMAGE_INITIAL: [&str; 5] = ["none", "100%", "1", "0", "stretch"];

pub(super) fn expand(grammar: &str, comps: &[Comp]) -> Option<Parsed> {
    if grammar == "font" {
        return font(comps);
    }
    // Each family helper returns `None` both for a grammar outside its family and for one
    // it failed to parse, so a failed parse falls through to the next family (and finally
    // to the outer `None` via `?`).
    let values = expand_box_grammars(grammar, comps)
        .or_else(|| expand_logical_pair_grammars(grammar, comps))
        .or_else(|| expand_logical_border_grammars(grammar, comps))
        .or_else(|| expand_logical_border_grammars_2(grammar, comps))
        .or_else(|| expand_corner_shape_grammars(grammar, comps))
        .or_else(|| expand_rule_and_corner_grammars(grammar, comps))
        .or_else(|| expand_rule_inset_grammars(grammar, comps))
        .or_else(|| expand_rule_inset_grammars_2(grammar, comps))
        .or_else(|| expand_composite_grammars(grammar, comps))
        .or_else(|| expand_composite_grammars_2(grammar, comps))
        .or_else(|| expand_composite_grammars_2b(grammar, comps))
        .or_else(|| expand_composite_grammars_3(grammar, comps))
        .or_else(|| expand_composite_grammars_3b(grammar, comps))?;
    Some(Parsed::Values(values))
}

fn expand_box_grammars(grammar: &str, comps: &[Comp]) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "margin" => box4(comps, margin_v).map(|v| {
            named(
                &["margin-top", "margin-right", "margin-bottom", "margin-left"],
                v,
            )
        }),
        "padding" => box4(comps, padding_v).map(|v| {
            named(
                &[
                    "padding-top",
                    "padding-right",
                    "padding-bottom",
                    "padding-left",
                ],
                v,
            )
        }),
        "inset" => box4(comps, margin_v).map(|v| named(&["top", "right", "bottom", "left"], v)),
        "scroll-margin" => box4(comps, scroll_margin_v).map(|v| {
            named(
                &[
                    "scroll-margin-top",
                    "scroll-margin-right",
                    "scroll-margin-bottom",
                    "scroll-margin-left",
                ],
                v,
            )
        }),
        "scroll-padding" => box4(comps, scroll_padding_v).map(|v| {
            named(
                &[
                    "scroll-padding-top",
                    "scroll-padding-right",
                    "scroll-padding-bottom",
                    "scroll-padding-left",
                ],
                v,
            )
        }),
        "border-width" => box4(comps, line_width).map(|v| {
            named(
                &[
                    "border-top-width",
                    "border-right-width",
                    "border-bottom-width",
                    "border-left-width",
                ],
                v,
            )
        }),
        "border-style" => box4(comps, line_style).map(|v| {
            named(
                &[
                    "border-top-style",
                    "border-right-style",
                    "border-bottom-style",
                    "border-left-style",
                ],
                v,
            )
        }),
        "border-color" => box4(comps, color).map(|v| {
            named(
                &[
                    "border-top-color",
                    "border-right-color",
                    "border-bottom-color",
                    "border-left-color",
                ],
                v,
            )
        }),
        "corner-shape" => box4(comps, corner_shape).map(|v| {
            named(
                &[
                    "corner-top-left-shape",
                    "corner-top-right-shape",
                    "corner-bottom-right-shape",
                    "corner-bottom-left-shape",
                ],
                v,
            )
        }),
        "border-radius" | "-webkit-border-radius" => {
            border_radius(comps, grammar == "-webkit-border-radius")
        }
        _ => None,
    }
}

fn expand_logical_pair_grammars(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "margin-block" => {
            pair(comps, margin_v).map(|v| named(&["margin-block-start", "margin-block-end"], v))
        }
        "margin-inline" => {
            pair(comps, margin_v).map(|v| named(&["margin-inline-start", "margin-inline-end"], v))
        }
        "padding-block" => {
            pair(comps, padding_v).map(|v| named(&["padding-block-start", "padding-block-end"], v))
        }
        "padding-inline" => pair(comps, padding_v)
            .map(|v| named(&["padding-inline-start", "padding-inline-end"], v)),
        "inset-block" => {
            pair(comps, margin_v).map(|v| named(&["inset-block-start", "inset-block-end"], v))
        }
        "inset-inline" => {
            pair(comps, margin_v).map(|v| named(&["inset-inline-start", "inset-inline-end"], v))
        }
        "scroll-margin-block" => pair(comps, scroll_margin_v)
            .map(|v| named(&["scroll-margin-block-start", "scroll-margin-block-end"], v)),
        "scroll-margin-inline" => pair(comps, scroll_margin_v).map(|v| {
            named(
                &["scroll-margin-inline-start", "scroll-margin-inline-end"],
                v,
            )
        }),
        "scroll-padding-block" => pair(comps, scroll_padding_v).map(|v| {
            named(
                &["scroll-padding-block-start", "scroll-padding-block-end"],
                v,
            )
        }),
        "scroll-padding-inline" => pair(comps, scroll_padding_v).map(|v| {
            named(
                &["scroll-padding-inline-start", "scroll-padding-inline-end"],
                v,
            )
        }),
        _ => None,
    }
}

fn expand_logical_border_grammars(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    let values = match grammar {
        "border-block-width" => named(
            &["border-block-start-width", "border-block-end-width"],
            pair(comps, line_width)?,
        ),
        "border-block-style" => named(
            &["border-block-start-style", "border-block-end-style"],
            pair(comps, line_style)?,
        ),
        "border-block-color" => named(
            &["border-block-start-color", "border-block-end-color"],
            pair(comps, color)?,
        ),
        _ => return None,
    };
    Some(values)
}

fn expand_logical_border_grammars_2(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "border-inline-width" => pair(comps, line_width)
            .map(|v| named(&["border-inline-start-width", "border-inline-end-width"], v)),
        "border-inline-style" => pair(comps, line_style)
            .map(|v| named(&["border-inline-start-style", "border-inline-end-style"], v)),
        "border-inline-color" => pair(comps, color)
            .map(|v| named(&["border-inline-start-color", "border-inline-end-color"], v)),
        "gap" => pair(comps, gap_v).map(|v| named(&["row-gap", "column-gap"], v)),
        "overflow" => pair(comps, overflow_v).map(|v| named(&["overflow-x", "overflow-y"], v)),
        "overscroll-behavior" => pair(comps, overscroll_v)
            .map(|v| named(&["overscroll-behavior-x", "overscroll-behavior-y"], v)),
        "border-spacing" => pair(comps, spacing_v).map(|v| {
            named(
                &[
                    "-webkit-border-horizontal-spacing",
                    "-webkit-border-vertical-spacing",
                ],
                v,
            )
        }),
        "interest-delay" => {
            pair(comps, delay_v).map(|v| named(&["interest-delay-start", "interest-delay-end"], v))
        }
        _ => None,
    }
}

fn expand_corner_shape_grammars(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "corner-top-shape" => pair(comps, corner_shape)
            .map(|v| named(&["corner-top-left-shape", "corner-top-right-shape"], v)),
        "corner-right-shape" => pair(comps, corner_shape)
            .map(|v| named(&["corner-top-right-shape", "corner-bottom-right-shape"], v)),
        "corner-bottom-shape" => pair(comps, corner_shape).map(|v| {
            named(
                &["corner-bottom-left-shape", "corner-bottom-right-shape"],
                v,
            )
        }),
        "corner-left-shape" => pair(comps, corner_shape)
            .map(|v| named(&["corner-top-left-shape", "corner-bottom-left-shape"], v)),
        "corner-block-start-shape" => pair(comps, corner_shape)
            .map(|v| named(&["corner-start-start-shape", "corner-start-end-shape"], v)),
        "corner-block-end-shape" => pair(comps, corner_shape)
            .map(|v| named(&["corner-end-start-shape", "corner-end-end-shape"], v)),
        "corner-inline-start-shape" => pair(comps, corner_shape)
            .map(|v| named(&["corner-start-start-shape", "corner-end-start-shape"], v)),
        "corner-inline-end-shape" => pair(comps, corner_shape)
            .map(|v| named(&["corner-start-end-shape", "corner-end-end-shape"], v)),
        _ => None,
    }
}

fn expand_rule_and_corner_grammars(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "column-rule-inset-cap" => pair(comps, rule_inset_v).map(|v| {
            named(
                &["column-rule-inset-cap-start", "column-rule-inset-cap-end"],
                v,
            )
        }),
        "column-rule-inset-junction" => pair(comps, rule_inset_v).map(|v| {
            named(
                &[
                    "column-rule-inset-junction-start",
                    "column-rule-inset-junction-end",
                ],
                v,
            )
        }),
        "row-rule-inset-cap" => pair(comps, rule_inset_v)
            .map(|v| named(&["row-rule-inset-cap-start", "row-rule-inset-cap-end"], v)),
        "row-rule-inset-junction" => pair(comps, rule_inset_v).map(|v| {
            named(
                &[
                    "row-rule-inset-junction-start",
                    "row-rule-inset-junction-end",
                ],
                v,
            )
        }),
        "column-rule-inset-start" => single(comps, rule_inset_v).map(|v| {
            same(
                &[
                    "column-rule-inset-cap-start",
                    "column-rule-inset-junction-start",
                ],
                &v,
            )
        }),
        "column-rule-inset-end" => single(comps, rule_inset_v).map(|v| {
            same(
                &[
                    "column-rule-inset-cap-end",
                    "column-rule-inset-junction-end",
                ],
                &v,
            )
        }),
        "row-rule-inset-start" => single(comps, rule_inset_v).map(|v| {
            same(
                &["row-rule-inset-cap-start", "row-rule-inset-junction-start"],
                &v,
            )
        }),
        "row-rule-inset-end" => single(comps, rule_inset_v).map(|v| {
            same(
                &["row-rule-inset-cap-end", "row-rule-inset-junction-end"],
                &v,
            )
        }),
        _ => None,
    }
}

fn expand_rule_inset_grammars(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    let values = match grammar {
        "column-rule-inset" => rule_inset(comps, "column")?,
        "row-rule-inset" => rule_inset(comps, "row")?,
        "rule-inset" => {
            let mut out = rule_inset(comps, "column")?;
            out.extend(rule_inset(comps, "row")?);
            out
        }
        "rule-inset-cap" => {
            let [start, end] = pair(comps, rule_inset_v)?;
            vec![
                ("row-rule-inset-cap-start", start.clone()),
                ("row-rule-inset-cap-end", end.clone()),
                ("column-rule-inset-cap-start", start),
                ("column-rule-inset-cap-end", end),
            ]
        }
        "rule-inset-junction" => {
            let [start, end] = pair(comps, rule_inset_v)?;
            vec![
                ("row-rule-inset-junction-start", start.clone()),
                ("row-rule-inset-junction-end", end.clone()),
                ("column-rule-inset-junction-start", start),
                ("column-rule-inset-junction-end", end),
            ]
        }
        _ => return None,
    };
    Some(values)
}

fn expand_rule_inset_grammars_2(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "rule-inset-start" => single(comps, rule_inset_v).map(|v| {
            same(
                &[
                    "column-rule-inset-cap-start",
                    "column-rule-inset-junction-start",
                    "row-rule-inset-cap-start",
                    "row-rule-inset-junction-start",
                ],
                &v,
            )
        }),
        "rule-inset-end" => single(comps, rule_inset_v).map(|v| {
            same(
                &[
                    "column-rule-inset-cap-end",
                    "column-rule-inset-junction-end",
                    "row-rule-inset-cap-end",
                    "row-rule-inset-junction-end",
                ],
                &v,
            )
        }),
        "rule-break" => {
            single(comps, rule_break_v).map(|v| same(&["column-rule-break", "row-rule-break"], &v))
        }
        "rule-color" => {
            single(comps, color).map(|v| same(&["column-rule-color", "row-rule-color"], &v))
        }
        "rule-style" => {
            single(comps, line_style).map(|v| same(&["column-rule-style", "row-rule-style"], &v))
        }
        "rule-width" => {
            single(comps, line_width).map(|v| same(&["column-rule-width", "row-rule-width"], &v))
        }
        "rule-visibility-items" => single(comps, rule_visibility_v).map(|v| {
            same(
                &["column-rule-visibility-items", "row-rule-visibility-items"],
                &v,
            )
        }),
        "marker" => {
            single(comps, marker_v).map(|v| same(&["marker-start", "marker-mid", "marker-end"], &v))
        }
        _ => None,
    }
}

fn expand_composite_grammars(grammar: &str, comps: &[Comp]) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "contain-intrinsic-size" => contain_intrinsic_size(comps),
        "place-content" => place_content(comps),
        "place-items" => place_items(comps),
        "place-self" => place_self(comps),
        "background-position" => positions(comps, true)
            .map(|(x, y)| vec![("background-position-x", x), ("background-position-y", y)]),
        "mask-position" | "-webkit-mask-position" => {
            // `-webkit-mask-position` keeps the background syntax's three-value form.
            positions(comps, grammar == "-webkit-mask-position").map(|(x, y)| {
                vec![
                    ("-webkit-mask-position-x", x),
                    ("-webkit-mask-position-y", y),
                ]
            })
        }
        "animation-range" => range_pair(
            comps,
            "animation-range-start",
            "animation-range-end",
            "normal",
        ),
        "timeline-trigger-activation-range" => range_pair(
            comps,
            "timeline-trigger-activation-range-start",
            "timeline-trigger-activation-range-end",
            "normal",
        ),
        "timeline-trigger-active-range" => range_pair(
            comps,
            "timeline-trigger-active-range-start",
            "timeline-trigger-active-range-end",
            "auto",
        ),
        "border-top" | "border-right" | "border-bottom" | "border-left" => {
            side(comps, grammar, ["medium", "none", "currentcolor"])
        }
        "border-block-start" | "border-block-end" | "border-inline-start" | "border-inline-end" => {
            side(comps, grammar, [INITIAL, INITIAL, INITIAL])
        }
        "column-rule" | "row-rule" => side(comps, grammar, ["medium", "none", "currentcolor"]),
        _ => None,
    }
}

fn expand_composite_grammars_2(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    let values = match grammar {
        "border-block" | "border-inline" => {
            let [width, style, color] = line(comps, ["medium", "none", "currentcolor"])?;
            let start = format!("{grammar}-start");
            let end = format!("{grammar}-end");
            let name = |side: &str, part: &str| leak(&format!("{side}-{part}"));
            vec![
                (name(&start, "width"), width.clone()),
                (name(&end, "width"), width),
                (name(&start, "style"), style.clone()),
                (name(&end, "style"), style),
                (name(&start, "color"), color.clone()),
                (name(&end, "color"), color),
            ]
        }
        "rule" => {
            let [width, style, color] = line(comps, ["medium", "none", "currentcolor"])?;
            vec![
                ("column-rule-width", width.clone()),
                ("column-rule-style", style.clone()),
                ("column-rule-color", color.clone()),
                ("row-rule-width", width),
                ("row-rule-style", style),
                ("row-rule-color", color),
            ]
        }
        "border" => {
            let [width, style, color] = line(comps, ["medium", "none", "currentcolor"])?;
            let mut out = Vec::with_capacity(17);
            for (part, value) in [("width", &width), ("style", &style), ("color", &color)] {
                for side in ["top", "right", "bottom", "left"] {
                    out.push((leak(&format!("border-{side}-{part}")), value.clone()));
                }
            }
            for (name, value) in [
                "border-image-source",
                "border-image-slice",
                "border-image-width",
                "border-image-outset",
                "border-image-repeat",
            ]
            .into_iter()
            .zip(BORDER_IMAGE_INITIAL)
            {
                out.push((name, value.to_string()));
            }
            out
        }
        _ => return None,
    };
    Some(values)
}

fn expand_composite_grammars_2b(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "outline" => {
            any_order(comps, &[&one(color), &one(outline_style), &one(line_width)]).map(|parsed| {
                names_or_initial(&["outline-color", "outline-style", "outline-width"], parsed)
            })
        }
        "-webkit-text-stroke" => any_order(comps, &[&one(line_width), &one(color)]).map(|parsed| {
            names_or_initial(
                &["-webkit-text-stroke-width", "-webkit-text-stroke-color"],
                parsed,
            )
        }),
        "text-decoration" => text_decoration(comps),
        "text-emphasis" => text_emphasis(comps),
        "flex-flow" => any_order(
            comps,
            &[
                &one(|c| kw(c, &["row", "row-reverse", "column", "column-reverse"])),
                &one(|c| kw(c, &["nowrap", "wrap", "wrap-reverse"])),
            ],
        )
        .map(|parsed| {
            let mut parsed = parsed.into_iter();
            vec![
                (
                    "flex-direction",
                    parsed.next().flatten().unwrap_or_else(|| "row".into()),
                ),
                (
                    "flex-wrap",
                    parsed.next().flatten().unwrap_or_else(|| "nowrap".into()),
                ),
            ]
        }),
        "list-style" => list_style(comps),
        "columns" => columns(comps),
        "container" => container(comps),
        "text-wrap" => any_order(
            comps,
            &[
                &one(|c| kw(c, &["wrap", "nowrap"])),
                &one(|c| kw(c, &["auto", "balance", "stable", "pretty", "avoid-orphans"])),
            ],
        )
        .map(|parsed| names_or_initial(&["text-wrap-mode", "text-wrap-style"], parsed)),
        "white-space" => white_space(comps),
        _ => None,
    }
}

fn expand_composite_grammars_3(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "font-synthesis" => font_synthesis(comps),
        "text-box" => text_box(comps),
        "position-try" => position_try(comps),
        "scroll-timeline" => scroll_timeline(comps),
        "view-timeline" => view_timeline(comps),
        "font-variant" => font_variant(comps),
        "flex" => flex(comps),
        "grid-area" => grid_area(comps),
        "grid-row" => grid_lines(comps, "grid-row-start", "grid-row-end"),
        "grid-column" => grid_lines(comps, "grid-column-start", "grid-column-end"),
        "grid-template" => grid_template(comps).map(|(rows, columns, areas)| {
            vec![
                ("grid-template-rows", rows),
                ("grid-template-columns", columns),
                ("grid-template-areas", areas),
            ]
        }),
        _ => None,
    }
}

fn expand_composite_grammars_3b(
    grammar: &str,
    comps: &[Comp],
) -> Option<Vec<(&'static str, String)>> {
    match grammar {
        "grid" => grid(comps),
        "border-image" => {
            border_image(comps, false).map(|[source, slice, width, outset, repeat]| {
                let pick = |value: Option<String>, index: usize| {
                    value.unwrap_or_else(|| BORDER_IMAGE_INITIAL[index].to_string())
                };
                vec![
                    ("border-image-source", pick(source, 0)),
                    ("border-image-slice", pick(slice, 1)),
                    ("border-image-width", pick(width, 2)),
                    ("border-image-outset", pick(outset, 3)),
                    ("border-image-repeat", pick(repeat, 4)),
                ]
            })
        }
        "-webkit-mask-box-image" => border_image(comps, true).map(|parts| {
            let names = [
                "-webkit-mask-box-image-source",
                "-webkit-mask-box-image-slice",
                "-webkit-mask-box-image-width",
                "-webkit-mask-box-image-outset",
                "-webkit-mask-box-image-repeat",
            ];
            names_or_initial(&names, parts.to_vec())
        }),
        "offset" => offset(comps),
        "background" => background(comps),
        "mask" | "-webkit-mask" => mask(comps),
        "transition" | "-webkit-transition" => transition(comps),
        "animation" | "-webkit-animation" => animation(comps),
        "timeline-trigger" => timeline_trigger(comps),
        _ => None,
    }
}

/// Interned longhand names built from parts (`border-top-width`, ...).
fn leak(name: &str) -> &'static str {
    super::table::SHORTHANDS
        .iter()
        .flat_map(|entry| entry.longhands.iter())
        .find(|longhand| **longhand == name)
        .copied()
        .unwrap_or("")
}

fn names_or_initial(names: &[&'static str], parsed: Vec<Option<String>>) -> Out {
    names
        .iter()
        .copied()
        .zip(parsed)
        .map(|(name, value)| (name, value.unwrap_or_else(|| INITIAL.into())))
        .collect()
}

pub(super) fn outline_style(c: &Comp) -> Option<String> {
    kw(c, &["auto"]).or_else(|| line_style(c))
}

/// `<line-width> || <line-style> || <color>`, omitted parts at `defaults`.
fn line(comps: &[Comp], defaults: [&str; 3]) -> Option<[String; 3]> {
    let parsed = any_order(comps, &[&one(line_width), &one(line_style), &one(color)])?;
    let mut out = defaults.map(str::to_string);
    for (index, value) in parsed.into_iter().enumerate() {
        if let Some(value) = value {
            out[index] = value;
        }
    }
    Some(out)
}
fn side(comps: &[Comp], name: &str, defaults: [&str; 3]) -> Option<Out> {
    let [width, style, color] = line(comps, defaults)?;
    Some(vec![
        (leak(&format!("{name}-width")), width),
        (leak(&format!("{name}-style")), style),
        (leak(&format!("{name}-color")), color),
    ])
}

fn border_radius(comps: &[Comp], legacy: bool) -> Option<Out> {
    let parts = slashes(comps);
    let (horizontal, vertical) = match parts.as_slice() {
        [h] if legacy && h.len() == 2 => {
            let a = radius(&h[0])?;
            let b = radius(&h[1])?;
            (
                [a.clone(), a.clone(), a.clone(), a],
                [b.clone(), b.clone(), b.clone(), b],
            )
        }
        [h] => {
            let h = box4(h, radius)?;
            (h.clone(), h)
        }
        [h, v] => (box4(h, radius)?, box4(v, radius)?),
        _ => return None,
    };
    let names = [
        "border-top-left-radius",
        "border-top-right-radius",
        "border-bottom-right-radius",
        "border-bottom-left-radius",
    ];
    Some(
        names
            .iter()
            .zip(horizontal.iter().zip(vertical.iter()))
            .map(|(&name, (h, v))| {
                (
                    name,
                    if h == v {
                        h.clone()
                    } else {
                        format!("{h} {v}")
                    },
                )
            })
            .collect(),
    )
}

fn rule_inset(comps: &[Comp], kind: &str) -> Option<Out> {
    let parts = slashes(comps);
    let (cap, junction) = match parts.as_slice() {
        [cap] => {
            let cap = pair(cap, rule_inset_v)?;
            (cap.clone(), cap)
        }
        [cap, junction] => (pair(cap, rule_inset_v)?, pair(junction, rule_inset_v)?),
        _ => return None,
    };
    let [cap_start, cap_end] = cap;
    let [junction_start, junction_end] = junction;
    Some(vec![
        (leak(&format!("{kind}-rule-inset-cap-start")), cap_start),
        (leak(&format!("{kind}-rule-inset-cap-end")), cap_end),
        (
            leak(&format!("{kind}-rule-inset-junction-start")),
            junction_start,
        ),
        (
            leak(&format!("{kind}-rule-inset-junction-end")),
            junction_end,
        ),
    ])
}

fn contain_intrinsic_size(comps: &[Comp]) -> Option<Out> {
    // Called with the whole (non-empty) value, then with a non-empty rest.
    let axis = |comps: &[Comp]| -> Option<(usize, String)> {
        let first = &comps[0];
        match comps.get(1) {
            Some(second) if first.is_ident(&["auto"]) => {
                let value = second.length(false).or_else(|| kw(second, &["none"]))?;
                Some((2, format!("auto {value}")))
            }
            _ => first
                .length(false)
                .or_else(|| kw(first, &["none"]))
                .map(|value| (1, value)),
        }
    };
    let (used, width) = axis(comps)?;
    let rest = &comps[used..];
    let height = if rest.is_empty()
        || (rest.len() == 1 && rest[0].is_ident(&["auto"]) && width.starts_with("auto "))
    {
        // A trailing lone `auto` after `auto <length>` repeats the width (Chrome).
        width.clone()
    } else {
        let (more, height) = axis(rest)?;
        if used + more != comps.len() {
            return None;
        }
        height
    };
    Some(vec![
        ("contain-intrinsic-width", width),
        ("contain-intrinsic-height", height),
    ])
}

/// `[first | last]? baseline` from the front: its canonical text and the components used.
fn baseline(comps: &[Comp]) -> Option<(usize, String)> {
    match comps {
        [first, second, ..] if first.is_ident(&["first"]) && second.is_ident(&["baseline"]) => {
            Some((2, "baseline".into()))
        }
        [first, second, ..] if first.is_ident(&["last"]) && second.is_ident(&["baseline"]) => {
            Some((2, "last baseline".into()))
        }
        [first, ..] if first.is_ident(&["baseline"]) => Some((1, "baseline".into())),
        _ => None,
    }
}
/// `[unsafe | safe]? <position>` from the front.
fn overflow_position(comps: &[Comp], positions: &[&str]) -> Option<(usize, String)> {
    let first = comps.first()?;
    match comps.get(1) {
        Some(second) if first.is_ident(&["safe", "unsafe"]) => {
            let position = kw(second, positions)?;
            Some((2, format!("{} {position}", first.ident()?)))
        }
        _ => kw(first, positions).map(|value| (1, value)),
    }
}
const CONTENT_POSITIONS: &[&str] = &["center", "start", "end", "flex-start", "flex-end"];
const SELF_POSITIONS: &[&str] = &[
    "center",
    "start",
    "end",
    "self-start",
    "self-end",
    "flex-start",
    "flex-end",
];
const DISTRIBUTIONS: &[&str] = &["space-between", "space-around", "space-evenly", "stretch"];

fn place_content(comps: &[Comp]) -> Option<Out> {
    let align = |comps: &[Comp]| -> Option<(usize, String)> {
        baseline(comps)
            .or_else(|| {
                comps
                    .first()
                    .and_then(|c| kw(c, &["normal"]).or_else(|| kw(c, DISTRIBUTIONS)))
                    .map(|v| (1, v))
            })
            .or_else(|| overflow_position(comps, CONTENT_POSITIONS))
    };
    let justify = |comps: &[Comp]| -> Option<(usize, String)> {
        comps
            .first()
            .and_then(|c| kw(c, &["normal", "left", "right"]).or_else(|| kw(c, DISTRIBUTIONS)))
            .map(|v| (1, v))
            .or_else(|| {
                overflow_position(
                    comps,
                    &[
                        "center",
                        "start",
                        "end",
                        "flex-start",
                        "flex-end",
                        "left",
                        "right",
                    ],
                )
            })
    };
    let (used, a) = align(comps)?;
    // `[first] baseline` takes a justify value (`start` when there is none); Chrome 156
    // rejects `last baseline` here.
    if a == "last baseline" {
        return None;
    }
    let j = if used == comps.len() {
        if a == "baseline" {
            "start".to_string()
        } else {
            a.clone()
        }
    } else {
        let (more, j) = justify(&comps[used..])?;
        if used + more != comps.len() {
            return None;
        }
        j
    };
    Some(vec![("align-content", a), ("justify-content", j)])
}

fn self_alignment(comps: &[Comp], extra: &[&str]) -> Option<(usize, String)> {
    baseline(comps)
        .or_else(|| comps.first().and_then(|c| kw(c, extra)).map(|v| (1, v)))
        .or_else(|| overflow_position(comps, SELF_POSITIONS))
}

/// A `justify-items` value from the front of `comps`: `(used, text)`.
pub(super) fn justify_items(comps: &[Comp]) -> Option<(usize, String)> {
    let legacy = match comps {
        [first] if first.is_ident(&["legacy"]) => Some((1, "legacy".to_string())),
        [first, second] if first.is_ident(&["legacy"]) => {
            kw(second, &["left", "right", "center"]).map(|v| (2, format!("legacy {v}")))
        }
        [first, second] if second.is_ident(&["legacy"]) => {
            kw(first, &["left", "right", "center"]).map(|v| (2, format!("legacy {v}")))
        }
        _ => None,
    };
    legacy
        .or_else(|| {
            self_alignment(
                comps,
                &["normal", "stretch", "left", "right", "anchor-center"],
            )
        })
        .or_else(|| overflow_position(comps, &["left", "right"]))
}

fn place_items(comps: &[Comp]) -> Option<Out> {
    let (used, align) = self_alignment(comps, &["normal", "stretch"])?;
    let justify = if used == comps.len() {
        align.clone()
    } else {
        let rest = &comps[used..];
        let (more, justify) = justify_items(rest)?;
        if used + more != comps.len() {
            return None;
        }
        justify
    };
    Some(vec![("align-items", align), ("justify-items", justify)])
}

fn place_self(comps: &[Comp]) -> Option<Out> {
    let extra = &["auto", "normal", "stretch", "anchor-center"];
    let (used, align) = self_alignment(comps, extra)?;
    let justify = if used == comps.len() {
        align.clone()
    } else {
        let rest = &comps[used..];
        let (more, justify) = self_alignment(
            rest,
            &[
                "auto",
                "normal",
                "stretch",
                "anchor-center",
                "left",
                "right",
            ],
        )
        .or_else(|| overflow_position(rest, &["left", "right"]))?;
        if used + more != comps.len() {
            return None;
        }
        justify
    };
    Some(vec![("align-self", align), ("justify-self", justify)])
}

/// One `<bg-position>`: its x and y specified values.
pub(super) fn position(comps: &[Comp]) -> Option<(String, String)> {
    let lp = |c: &Comp| c.length_percentage(true);
    let horizontal = |c: &Comp| kw(c, &["left", "right"]);
    let vertical = |c: &Comp| kw(c, &["top", "bottom"]);
    let center = |c: &Comp| kw(c, &["center"]);
    match comps {
        [a] => {
            if let Some(v) = vertical(a) {
                return Some(("center".into(), v));
            }
            let x = horizontal(a).or_else(|| center(a)).or_else(|| lp(a))?;
            Some((x, "center".into()))
        }
        [a, b] => {
            let a_x = horizontal(a).or_else(|| center(a)).or_else(|| lp(a));
            let b_y = vertical(b).or_else(|| center(b)).or_else(|| lp(b));
            if let (Some(x), Some(y)) = (a_x, b_y) {
                return Some((x, y));
            }
            // A vertical keyword first: `top left`, `top center`.
            let a_y = vertical(a).or_else(|| center(a))?;
            let b_x = horizontal(b).or_else(|| center(b))?;
            Some((b_x, a_y))
        }
        [_, _, _] | [_, _, _, _] => position_keyword_offset_pairs(comps),
        _ => None,
    }
}

/// Keyword + offset pairs (`left 10px top`, `center bottom 2em`). `center` takes the axis
/// the other keyword leaves; a lone keyword takes no offset.
fn position_keyword_offset_pairs(comps: &[Comp]) -> Option<(String, String)> {
    let lp = |c: &Comp| c.length_percentage(true);
    let mut at = 0;
    let mut x = None;
    let mut y = None;
    let mut center = None;
    while at < comps.len() {
        let keyword = comps[at].keyword(&["left", "right", "top", "bottom", "center"])?;
        let offset = comps.get(at + 1).and_then(lp);
        let used = if offset.is_some() && keyword != "center" {
            2
        } else {
            1
        };
        let text = match offset.filter(|_| used == 2) {
            Some(offset) => format!("{keyword} {offset}"),
            None => keyword.clone(),
        };
        let slot = match keyword.as_str() {
            "left" | "right" => &mut x,
            "top" | "bottom" => &mut y,
            _ => &mut center,
        };
        if slot.is_some() {
            return None;
        }
        *slot = Some(text);
        at += used;
    }
    match (x, y, center) {
        (Some(x), Some(y), None) => Some((x, y)),
        (Some(x), None, Some(center)) => Some((x, center)),
        (None, Some(y), Some(center)) => Some((center, y)),
        _ => None,
    }
}

/// A comma list of positions; `three`: three-value positions too (background only).
fn positions(comps: &[Comp], three: bool) -> Option<(String, String)> {
    let mut xs = Vec::new();
    let mut ys = Vec::new();
    for layer in commas(comps)? {
        if !three && layer.len() == 3 {
            return None;
        }
        let (x, y) = position(layer)?;
        xs.push(x);
        ys.push(y);
    }
    Some((xs.join(", "), ys.join(", ")))
}

pub(super) const RANGE_NAMES: &[&str] = &[
    "cover",
    "contain",
    "entry",
    "exit",
    "entry-crossing",
    "exit-crossing",
    "scroll",
];

/// `normal | <length-percentage> | <timeline-range-name> <length-percentage>?` from the front.
pub(super) fn range_value(
    comps: &[Comp],
    initial: &str,
    end: bool,
) -> Option<(usize, String, Option<String>)> {
    let first = comps.first()?;
    if let Some(keyword) = kw(first, &[initial]) {
        return Some((1, keyword, None));
    }
    if let Some(name) = kw(first, RANGE_NAMES) {
        if let Some(offset) = comps.get(1).and_then(|c| c.length_percentage(true)) {
            let default = if end { "100%" } else { "0%" };
            let text = if offset == default {
                name.clone()
            } else {
                format!("{name} {offset}")
            };
            return Some((2, text, Some(name)));
        }
        return Some((1, name.clone(), Some(name)));
    }
    first.length_percentage(true).map(|value| (1, value, None))
}

fn range_pair(
    comps: &[Comp],
    start: &'static str,
    end: &'static str,
    initial: &str,
) -> Option<Out> {
    let (used, start_value, name) = range_value(
        comps,
        if initial == "auto" { "normal" } else { initial },
        false,
    )
    .or_else(|| range_value(comps, initial, false))?;
    let end_value = if used == comps.len() {
        name.unwrap_or_else(|| initial.to_string())
    } else {
        let (more, value, _) = range_value(&comps[used..], initial, true)?;
        if used + more != comps.len() {
            return None;
        }
        value
    };
    Some(vec![(start, start_value), (end, end_value)])
}

pub(super) fn text_decoration(comps: &[Comp]) -> Option<Out> {
    let lines = |comps: &[Comp]| -> Option<(usize, String)> {
        if comps.first()?.is_ident(&["none"]) {
            return Some((1, "none".into()));
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
                _ => break,
            }
        }
        if seen.is_empty() {
            return None;
        }
        let used = seen.len();
        let text: Vec<&str> = order
            .iter()
            .copied()
            .filter(|name| seen.iter().any(|seen| seen == name))
            .collect();
        Some((used, text.join(" ")))
    };
    let thickness = |c: &Comp| kw(c, &["auto", "from-font"]).or_else(|| c.length_percentage(true));
    let style = |c: &Comp| kw(c, &["solid", "double", "dotted", "dashed", "wavy"]);
    let parsed = any_order(comps, &[&lines, &one(thickness), &one(style), &one(color)])?;
    Some(names_or_initial(
        &[
            "text-decoration-line",
            "text-decoration-thickness",
            "text-decoration-style",
            "text-decoration-color",
        ],
        parsed,
    ))
}

fn text_emphasis(comps: &[Comp]) -> Option<Out> {
    let style = |comps: &[Comp]| -> Option<(usize, String)> {
        let first = comps.first()?;
        if let Some(text) = first.string() {
            return Some((1, text));
        }
        if first.is_ident(&["none"]) {
            return Some((1, "none".into()));
        }
        let fills = ["filled", "open"];
        let shapes = ["dot", "circle", "double-circle", "triangle", "sesame"];
        let mut fill = None;
        let mut shape = None;
        let mut used = 0;
        for comp in comps.iter().take(2) {
            if let Some(value) = comp.keyword(&fills).filter(|_| fill.is_none()) {
                fill = Some(value);
                used += 1;
                continue;
            }
            if let Some(value) = comp.keyword(&shapes).filter(|_| shape.is_none()) {
                shape = Some(value);
                used += 1;
                continue;
            }
            break;
        }
        if used == 0 {
            return None;
        }
        Some((
            used,
            [fill, shape]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" "),
        ))
    };
    let parsed = any_order(comps, &[&style, &one(color)])?;
    Some(names_or_initial(
        &["text-emphasis-style", "text-emphasis-color"],
        parsed,
    ))
}

fn list_style(comps: &[Comp]) -> Option<Out> {
    let position = |c: &Comp| kw(c, &["inside", "outside"]);
    let image = |c: &Comp| c.image();
    let kind = |c: &Comp| {
        c.string()
            .or_else(|| c.custom_ident(&["none"]).map(|v| v.to_ascii_lowercase()))
    };
    let mut nones = 0;
    let rest: Vec<Comp> = comps
        .iter()
        .filter(|c| {
            if c.is_ident(&["none"]) {
                nones += 1;
                false
            } else {
                true
            }
        })
        .cloned()
        .collect();
    let mut parsed = any_order(&rest, &[&one(position), &one(image), &one(kind)])?;
    match nones {
        0 => {}
        1 if parsed[2].is_none() => parsed[2] = Some("none".into()),
        1 if parsed[1].is_none() => parsed[1] = Some("none".into()),
        2 if parsed[1].is_none() && parsed[2].is_none() => {
            parsed[1] = Some("none".into());
            parsed[2] = Some("none".into());
        }
        _ => return None,
    }
    Some(names_or_initial(
        &["list-style-position", "list-style-image", "list-style-type"],
        parsed,
    ))
}

fn columns(comps: &[Comp]) -> Option<Out> {
    let parts = slashes(comps);
    let (main, height) = match parts.as_slice() {
        [main] => (*main, None),
        [main, [height]] => (
            *main,
            Some(height.length(false).or_else(|| kw(height, &["auto"]))?),
        ),
        _ => return None,
    };
    if main.is_empty() || main.len() > 2 {
        return None;
    }
    let mut width = None;
    let mut count = None;
    for comp in main {
        if comp.is_ident(&["auto"]) {
            // `auto` leaves either part at its initial `auto`.
        } else if let Some(value) = comp.length(false).filter(|_| width.is_none()) {
            width = Some(value);
        } else {
            let value = comp.integer(1).filter(|_| count.is_none())?;
            count = Some(value);
        }
    }
    Some(vec![
        ("column-width", width.unwrap_or_else(|| "auto".into())),
        ("column-count", count.unwrap_or_else(|| "auto".into())),
        ("column-height", height.unwrap_or_else(|| "auto".into())),
        ("column-wrap", "auto".into()),
    ])
}

fn container_name(names: &[Comp]) -> Option<String> {
    let name = if let [only] = names {
        if only.is_ident(&["none"]) {
            "none".to_string()
        } else {
            only.custom_ident(&["none", "and", "or", "not"])?
        }
    } else {
        names
            .iter()
            .map(|c| c.custom_ident(&["none", "and", "or", "not"]))
            .collect::<Option<Vec<_>>>()?
            .join(" ")
    };
    (!name.is_empty()).then_some(name)
}

fn container_kind(kind: Option<&[Comp]>) -> Option<String> {
    match kind {
        None => Some("normal".to_string()),
        Some([only]) => kw(
            only,
            &["normal", "size", "inline-size", "scroll-state", "anchored"],
        ),
        Some(list) => {
            let kinds: Vec<String> = list
                .iter()
                .map(|c| kw(c, &["size", "inline-size", "scroll-state", "anchored"]))
                .collect::<Option<_>>()?;
            let sizes = kinds.iter().filter(|kind| kind.ends_with("size")).count();
            let has_dup = kinds
                .iter()
                .enumerate()
                .any(|(index, kind)| kinds[..index].contains(kind));
            if sizes > 1 || has_dup {
                return None;
            }
            Some(kinds.join(" "))
        }
    }
}

fn container(comps: &[Comp]) -> Option<Out> {
    let parts = slashes(comps);
    let (names, kind) = match parts.as_slice() {
        [names] => (*names, None),
        [names, kind] if !kind.is_empty() => (*names, Some(*kind)),
        _ => return None,
    };
    let name = container_name(names)?;
    let kind = container_kind(kind)?;
    Some(vec![("container-name", name), ("container-type", kind)])
}

fn white_space(comps: &[Comp]) -> Option<Out> {
    if let [only] = comps {
        let mapped = match only.ident().as_deref() {
            Some("normal") => Some(("collapse", "wrap")),
            Some("pre") => Some(("preserve", "nowrap")),
            Some("nowrap") => Some(("collapse", "nowrap")),
            Some("pre-wrap") => Some(("preserve", "wrap")),
            Some("pre-line") => Some(("preserve-breaks", "wrap")),
            Some("break-spaces") => Some(("break-spaces", "wrap")),
            _ => None,
        };
        if let Some((collapse, mode)) = mapped {
            return Some(vec![
                ("white-space-collapse", collapse.into()),
                ("text-wrap-mode", mode.into()),
            ]);
        }
    }
    let parsed = any_order(
        comps,
        &[
            &one(|c| {
                kw(
                    c,
                    &["collapse", "preserve", "preserve-breaks", "break-spaces"],
                )
            }),
            &one(|c| kw(c, &["wrap", "nowrap"])),
        ],
    )?;
    Some(names_or_initial(
        &["white-space-collapse", "text-wrap-mode"],
        parsed,
    ))
}

fn font_synthesis(comps: &[Comp]) -> Option<Out> {
    let names = [
        "font-synthesis-weight",
        "font-synthesis-style",
        "font-synthesis-small-caps",
    ];
    if let [only] = comps {
        if only.is_ident(&["none"]) {
            return Some(same(&names, "none"));
        }
    }
    let parsed = any_order(
        comps,
        &[
            &one(|c| kw(c, &["weight"])),
            &one(|c| kw(c, &["style"])),
            &one(|c| kw(c, &["small-caps"])),
        ],
    )?;
    Some(
        names
            .iter()
            .copied()
            .zip(parsed)
            .map(|(name, value)| {
                (
                    name,
                    if value.is_some() { "auto" } else { "none" }.to_string(),
                )
            })
            .collect(),
    )
}

fn text_box(comps: &[Comp]) -> Option<Out> {
    if let [only] = comps {
        if only.is_ident(&["normal"]) {
            return Some(vec![
                ("text-box-trim", "none".into()),
                ("text-box-edge", "auto".into()),
            ]);
        }
    }
    let trim = |c: &Comp| kw(c, &["none", "trim-start", "trim-end", "trim-both"]);
    let edge = |comps: &[Comp]| -> Option<(usize, String)> {
        let first = comps.first()?;
        let over = ["text", "cap", "ex", "ideographic", "ideographic-ink"];
        let under = ["text", "alphabetic", "ideographic", "ideographic-ink"];
        if first.is_ident(&["auto"]) {
            return Some((1, "auto".into()));
        }
        let a = first.keyword(&over)?;
        if let Some(b) = comps.get(1).and_then(|c| c.keyword(&under)) {
            return Some((2, if a == b { a } else { format!("{a} {b}") }));
        }
        matches!(a.as_str(), "text" | "ideographic" | "ideographic-ink").then_some((1, a))
    };
    let parsed = any_order(comps, &[&one(trim), &edge])?;
    let mut parsed = parsed.into_iter();
    let trim = parsed.next().flatten();
    let edge = parsed.next().flatten();
    Some(vec![
        ("text-box-trim", trim.unwrap_or_else(|| "trim-both".into())),
        ("text-box-edge", edge.unwrap_or_else(|| "auto".into())),
    ])
}

pub(super) const TRY_TACTICS: &[&str] = &[
    "flip-block",
    "flip-inline",
    "flip-start",
    "flip-x",
    "flip-y",
];

fn position_try(comps: &[Comp]) -> Option<Out> {
    let orders = [
        "normal",
        "most-width",
        "most-height",
        "most-block-size",
        "most-inline-size",
    ];
    let (order, rest) = match comps.split_first() {
        Some((first, rest)) if first.is_ident(&orders) && !rest.is_empty() => {
            (first.ident()?, rest)
        }
        _ => ("normal".to_string(), comps),
    };
    let fallbacks = if let [only] = rest {
        if only.is_ident(&["none"]) {
            "none".to_string()
        } else {
            try_fallbacks(rest)?
        }
    } else {
        try_fallbacks(rest)?
    };
    Some(vec![
        ("position-try-order", order),
        ("position-try-fallbacks", fallbacks),
    ])
}
pub(super) fn try_fallbacks(comps: &[Comp]) -> Option<String> {
    let mut out = Vec::new();
    for item in commas(comps)? {
        let mut ident = None;
        let mut tactics = Vec::new();
        for comp in item {
            if let Some(name) = comp.dashed_ident().filter(|_| ident.is_none()) {
                ident = Some(name);
            } else {
                let tactic = comp.keyword(TRY_TACTICS)?;
                if tactics.contains(&tactic) {
                    return None;
                }
                tactics.push(tactic);
            }
        }
        out.push(
            [ident.into_iter().collect::<Vec<_>>(), tactics]
                .concat()
                .join(" "),
        );
    }
    Some(out.join(", "))
}

fn scroll_timeline(comps: &[Comp]) -> Option<Out> {
    let mut name_list = Vec::new();
    let mut axis_list = Vec::new();
    for layer in commas(comps)? {
        let (name, axis) = match layer {
            [name] => (name, None),
            [name, axis] => (name, Some(axis)),
            _ => return None,
        };
        name_list.push(kw(name, &["none"]).or_else(|| name.dashed_ident())?);
        axis_list.push(match axis {
            Some(axis) => kw(axis, &["block", "inline", "x", "y"])?,
            None => "block".into(),
        });
    }
    Some(vec![
        ("scroll-timeline-name", name_list.join(", ")),
        ("scroll-timeline-axis", axis_list.join(", ")),
    ])
}

fn view_timeline(comps: &[Comp]) -> Option<Out> {
    let mut name_list = Vec::new();
    let mut axis_list = Vec::new();
    let mut inset_list = Vec::new();
    for layer in commas(comps)? {
        let (name, rest) = layer.split_first()?;
        name_list.push(kw(name, &["none"]).or_else(|| name.dashed_ident())?);
        let axis = one(|c| kw(c, &["block", "inline", "x", "y"]));
        let inset = |comps: &[Comp]| -> Option<(usize, String)> {
            let value = |c: &Comp| kw(c, &["auto"]).or_else(|| c.length_percentage(true));
            let a = value(comps.first()?)?;
            match comps.get(1).and_then(value) {
                Some(b) => Some((2, if a == b { a } else { format!("{a} {b}") })),
                None => Some((1, a)),
            }
        };
        let parsed = any_order(rest, &[&axis, &inset])?;
        axis_list.push(parsed[0].clone().unwrap_or_else(|| "block".into()));
        inset_list.push(parsed[1].clone().unwrap_or_else(|| "auto".into()));
    }
    Some(vec![
        ("view-timeline-name", name_list.join(", ")),
        ("view-timeline-axis", axis_list.join(", ")),
        ("view-timeline-inset", inset_list.join(", ")),
    ])
}

pub(super) const LIGATURES: &[&[&str]] = &[
    &["common-ligatures", "no-common-ligatures"],
    &["discretionary-ligatures", "no-discretionary-ligatures"],
    &["historical-ligatures", "no-historical-ligatures"],
    &["contextual", "no-contextual"],
];
pub(super) const NUMERIC: &[&[&str]] = &[
    &["lining-nums", "oldstyle-nums"],
    &["proportional-nums", "tabular-nums"],
    &["diagonal-fractions", "stacked-fractions"],
    &["ordinal"],
    &["slashed-zero"],
];
pub(super) const EAST_ASIAN: &[&[&str]] = &[
    &[
        "jis78",
        "jis83",
        "jis90",
        "jis04",
        "simplified",
        "traditional",
    ],
    &["full-width", "proportional-width"],
    &["ruby"],
];
pub(super) const CAPS: &[&str] = &[
    "small-caps",
    "all-small-caps",
    "petite-caps",
    "all-petite-caps",
    "unicase",
    "titling-caps",
];

/// Keywords of one `font-variant-*` group set: at most one per group, canonical group order.
pub(super) fn group_set(comps: &[Comp], groups: &[&[&str]]) -> Option<(usize, String)> {
    let mut picked: Vec<Option<String>> = vec![None; groups.len()];
    let mut used = 0;
    for comp in comps {
        let Some(name) = comp.ident() else { break };
        let Some(group) = groups
            .iter()
            .position(|group| group.contains(&name.as_str()))
        else {
            break;
        };
        if picked[group].is_some() {
            return None;
        }
        picked[group] = Some(name);
        used += 1;
    }
    (used > 0).then(|| {
        (
            used,
            picked.into_iter().flatten().collect::<Vec<_>>().join(" "),
        )
    })
}

fn font_variant(comps: &[Comp]) -> Option<Out> {
    let order = [
        "font-variant-ligatures",
        "font-variant-caps",
        "font-variant-numeric",
        "font-variant-east-asian",
        "font-variant-alternates",
        "font-variant-position",
        "font-variant-emoji",
    ];
    if let [only] = comps {
        if only.is_ident(&["normal"]) {
            return Some(same(&order, "normal"));
        }
        if only.is_ident(&["none"]) {
            let mut out = same(&order, "normal");
            out[0].1 = "none".into();
            return Some(out);
        }
    }
    let ligatures = |comps: &[Comp]| group_set(comps, LIGATURES);
    let numeric = |comps: &[Comp]| group_set(comps, NUMERIC);
    let east_asian = |comps: &[Comp]| group_set(comps, EAST_ASIAN);
    // The alternates values may sit anywhere among the others.
    let alternate = |comp: &Comp| {
        comp.is_ident(&["historical-forms"])
            || matches!(&comp.kind, Kind::Function(name) if matches!(name.as_str(),
                "stylistic" | "styleset" | "character-variant" | "swash" | "ornaments" | "annotation"))
    };
    let (alternate_comps, others): (Vec<Comp>, Vec<Comp>) =
        comps.iter().cloned().partition(|comp| alternate(comp));
    let alternates_value = if alternate_comps.is_empty() {
        None
    } else {
        // Every partitioned component is one `alternates` takes, so it uses them all (or
        // rejects a repeated feature).
        let (_, value) = alternates(&alternate_comps)?;
        Some(value)
    };
    let mut parsed = if others.is_empty() {
        vec![None; 7]
    } else {
        any_order(
            &others,
            &[
                &ligatures,
                &numeric,
                &east_asian,
                &one(|c| kw(c, CAPS)),
                &|_: &[Comp]| None,
                &one(|c| kw(c, &["sub", "super"])),
                &one(|c| kw(c, &["text", "emoji", "unicode"])),
            ],
        )?
    };
    parsed[4] = alternates_value;
    let names = [
        "font-variant-ligatures",
        "font-variant-numeric",
        "font-variant-east-asian",
        "font-variant-caps",
        "font-variant-alternates",
        "font-variant-position",
        "font-variant-emoji",
    ];
    Some(
        names
            .iter()
            .copied()
            .zip(parsed)
            .map(|(name, value)| (name, value.unwrap_or_else(|| "normal".into())))
            .collect(),
    )
}

fn flex(comps: &[Comp]) -> Option<Out> {
    let names = ["flex-grow", "flex-shrink", "flex-basis"];
    if let [only] = comps {
        if only.is_ident(&["none"]) {
            return Some(named(&names, ["0".into(), "0".into(), "auto".into()]));
        }
        if only.is_ident(&["auto"]) {
            return Some(named(&names, ["1".into(), "1".into(), "auto".into()]));
        }
    }
    let basis = |c: &Comp| {
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
    };
    let mut grow = None;
    let mut shrink = None;
    let mut basis_value = None;
    let mut at = 0;
    while at < comps.len() {
        let comp = &comps[at];
        if let Some(number) = comp.number(false).filter(|_| grow.is_none()) {
            grow = Some(number);
            if let Some(next) = comps.get(at + 1).and_then(|c| c.number(false)) {
                shrink = Some(next);
                at += 1;
            }
            at += 1;
            continue;
        }
        if let Some(value) = basis(comp).filter(|_| basis_value.is_none()) {
            basis_value = Some(value);
            at += 1;
            continue;
        }
        return None;
    }
    // Each (of at least one) component set the grow factor or the basis, or returned.
    Some(named(
        &names,
        [
            grow.unwrap_or_else(|| "1".into()),
            shrink.unwrap_or_else(|| "1".into()),
            basis_value.unwrap_or_else(|| "0%".into()),
        ],
    ))
}

const SYSTEM_FONTS: &[&str] = &[
    "caption",
    "icon",
    "menu",
    "message-box",
    "small-caption",
    "status-bar",
];
pub(super) fn is_system_font(text: &str) -> bool {
    SYSTEM_FONTS.contains(&text)
}
pub(super) const FONT_SIZES: &[&str] = &[
    "xx-small",
    "x-small",
    "small",
    "medium",
    "large",
    "x-large",
    "xx-large",
    "xxx-large",
    "larger",
    "smaller",
    "-webkit-xxx-large",
];
pub(super) const STRETCHES: &[&str] = &[
    "ultra-condensed",
    "extra-condensed",
    "condensed",
    "semi-condensed",
    "semi-expanded",
    "expanded",
    "extra-expanded",
    "ultra-expanded",
];

pub(super) const GENERIC_FAMILIES: &[&str] = &[
    "serif",
    "sans-serif",
    "cursive",
    "fantasy",
    "monospace",
    "system-ui",
    "math",
    "emoji",
    "fangsong",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "-webkit-body",
    "-webkit-pictograph",
];
/// A family name as Chrome serializes it: unquoted when it is one identifier (an optional
/// `-`, a name-start character, name characters; no escapes) Chrome would not read as a
/// keyword (a generic family, a CSS-wide keyword, `default`), a string otherwise.
fn family_text(name: &str) -> String {
    let mut chars = name.chars();
    let start = |c: char| c.is_ascii_alphabetic() || c == '_' || !c.is_ascii();
    let identifier = match chars.next() {
        Some('-') => chars.next().is_some_and(start),
        Some(first) => start(first),
        None => false,
    } && name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || !c.is_ascii());
    if identifier && !reserved(name, GENERIC_FAMILIES) {
        name.to_string()
    } else {
        super::components::quoted(name)
    }
}
/// CSSOM "serialize an identifier".
pub(super) fn serialize_identifier(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    for (index, &c) in chars.iter().enumerate() {
        serialize_identifier_char(&chars, index, c, &mut out);
    }
    out
}

fn serialize_identifier_char(chars: &[char], index: usize, c: char, out: &mut String) {
    let code = u32::from(c);
    if c == '\0' {
        unreachable!("cssparser reads U+0000 in a string as U+FFFD");
    } else if needs_hex_escape(chars, index, c, code) {
        let _ = write!(out, "\\{code:x} ");
    } else if matches!((index, c, chars.len()), (0, '-', 1)) {
        out.push_str("\\-");
    } else if code >= 0x80 || c == '-' || c == '_' || c.is_ascii_alphanumeric() {
        out.push(c);
    } else {
        out.push('\\');
        out.push(c);
    }
}

fn needs_hex_escape(chars: &[char], index: usize, c: char, code: u32) -> bool {
    (0x1..=0x1f).contains(&code)
        || code == 0x7f
        || (index == 0 && c.is_ascii_digit())
        || (index == 1 && c.is_ascii_digit() && chars[0] == '-')
}
/// A quoted animation name: an identifier unless it is empty (invalid) or reads as `none`,
/// a CSS-wide keyword or `default` (kept quoted).
pub(super) fn animation_name_string(comp: &Comp) -> Option<String> {
    let Kind::Str(text) = &comp.kind else {
        unreachable!("callers pass string components");
    };
    if text.is_empty() {
        None
    } else if reserved(text, &["none"]) {
        Some(comp.text.clone())
    } else {
        Some(serialize_identifier(text))
    }
}
pub(super) fn reserved(name: &str, extra: &[&str]) -> bool {
    let lower = name.to_ascii_lowercase();
    super::components::CSS_WIDE.contains(&lower.as_str())
        || lower == "default"
        || extra.contains(&lower.as_str())
}

/// `oblique <angle>`: Chrome checks a literal angle's number, in its own unit, against
/// [-90, 90]; a zero angle is `normal`.
pub(super) fn oblique(angle: &Comp) -> Option<String> {
    // A unitless zero is not an angle here.
    if matches!(angle.kind, Kind::Number { .. }) {
        return None;
    }
    let text = angle.angle()?;
    let Kind::Dimension { value, .. } = angle.kind else {
        // A math function: its angle is checked when the value is used.
        return Some(format!("oblique {text}"));
    };
    if !(-90.0..=90.0).contains(&value) {
        None
    } else if value == 0.0 {
        Some("normal".into())
    } else {
        Some(format!("oblique {text}"))
    }
}

/// `font-variant-alternates` values: `historical-forms` and the feature functions, each at
/// most once, in Chrome's order; `(used, text)` from the front of `comps`.
pub(super) fn alternates(comps: &[Comp]) -> Option<(usize, String)> {
    const ORDER: &[&str] = &[
        "stylistic",
        "historical-forms",
        "styleset",
        "character-variant",
        "swash",
        "ornaments",
        "annotation",
    ];
    let mut found: Vec<(usize, String)> = Vec::new();
    for comp in comps {
        let (key, text) = if let Some(value) = comp.keyword(&["historical-forms"]) {
            ("historical-forms", value)
        } else if let Kind::Function(name) = &comp.kind {
            match ORDER.iter().find(|candidate| *candidate == name) {
                Some(&key) if key != "historical-forms" => (key, comp.text.clone()),
                _ => break,
            }
        } else {
            break;
        };
        let rank = ORDER.iter().position(|candidate| *candidate == key)?;
        if found.iter().any(|(seen, _)| *seen == rank) {
            return None;
        }
        found.push((rank, text));
    }
    if found.is_empty() {
        return None;
    }
    let used = found.len();
    found.sort_by_key(|(rank, _)| *rank);
    Some((
        used,
        found
            .into_iter()
            .map(|(_, text)| text)
            .collect::<Vec<_>>()
            .join(" "),
    ))
}

/// `font-family`: a comma list of strings and identifier sequences.
pub(super) fn font_family(comps: &[Comp]) -> Option<String> {
    let mut families = Vec::new();
    for family in commas(comps)? {
        match family {
            [Comp {
                kind: Kind::Str(name),
                ..
            }] => families.push(family_text(name)),
            idents => {
                let words: Option<Vec<String>> = idents
                    .iter()
                    .map(|c| match &c.kind {
                        Kind::Ident(name) => Some(name.clone()),
                        _ => None,
                    })
                    .collect();
                let words = words?;
                if words.len() == 1
                    && super::components::CSS_WIDE.contains(&words[0].to_ascii_lowercase().as_str())
                {
                    return None;
                }
                // Chrome quotes a family name of several identifiers.
                let name = words.join(" ");
                let lower = name.to_ascii_lowercase();
                families.push(if words.len() > 1 {
                    super::components::quoted(&name)
                } else if GENERIC_FAMILIES.contains(&lower.as_str()) {
                    // A generic family is a keyword: lowercase.
                    lower
                } else {
                    family_text(&name)
                });
            }
        }
    }
    Some(families.join(", "))
}

/// What a single parse step did with the components at its position.
#[derive(Clone, Copy)]
enum Step {
    /// Nothing there for this step.
    Skip,
    /// Took this many components.
    Took(usize),
}

#[allow(clippy::type_complexity)]
fn parse_font_prefix(
    comps: &[Comp],
) -> Option<(
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    usize,
)> {
    let mut style = None;
    let mut caps = None;
    let mut weight = None;
    let mut stretch = None;
    let mut at = 0;
    while at < comps.len() && at < 4 {
        let comp = &comps[at];
        if comp.is_ident(&["normal"]) {
            at += 1;
            continue;
        }
        if let Step::Took(advance) = try_font_style(comps, at, &mut style)? {
            at += advance;
            continue;
        }
        if try_font_caps(comp, &mut caps) {
            at += 1;
            continue;
        }
        if try_font_weight(comp, &mut weight) {
            at += 1;
            continue;
        }
        if try_font_stretch(comp, &mut stretch) {
            at += 1;
            continue;
        }
        break;
    }
    Some((style, caps, weight, stretch, at))
}

/// `None` on an invalid oblique angle, else whether the style was set and how many
/// components it took (1, or 2 with an angle).
fn try_font_style(comps: &[Comp], at: usize, style: &mut Option<String>) -> Option<Step> {
    if style.is_some() {
        return Some(Step::Skip);
    }
    let comp = &comps[at];
    let Some(value) = comp.keyword(&["italic", "oblique"]) else {
        return Some(Step::Skip);
    };
    if value == "oblique" {
        if let Some(angle) = comps
            .get(at + 1)
            .filter(|c| matches!(c.kind, Kind::Dimension { .. }) && c.angle().is_some())
        {
            *style = Some(oblique(angle)?);
            return Some(Step::Took(2));
        }
    }
    *style = Some(value);
    Some(Step::Took(1))
}

fn try_font_caps(comp: &Comp, caps: &mut Option<String>) -> bool {
    if caps.is_some() {
        return false;
    }
    if let Some(value) = comp.keyword(&["small-caps"]) {
        *caps = Some(value);
        return true;
    }
    false
}

fn try_font_weight(comp: &Comp, weight: &mut Option<String>) -> bool {
    if weight.is_some() {
        return false;
    }
    if let Some(value) = comp.keyword(&["bold", "bolder", "lighter"]).or_else(|| {
        comp.number(false).filter(
            |_| matches!(comp.kind, Kind::Number { value, .. } if (1.0..=1000.0).contains(&value)),
        )
    }) {
        *weight = Some(value);
        return true;
    }
    false
}

fn try_font_stretch(comp: &Comp, stretch: &mut Option<String>) -> bool {
    if stretch.is_some() {
        return false;
    }
    if let Some(value) = comp.keyword(STRETCHES) {
        *stretch = Some(value);
        return true;
    }
    false
}

fn font(comps: &[Comp]) -> Option<Parsed> {
    if let Some(name) = comps
        .first()
        .filter(|_| comps.len() == 1)
        .and_then(|only| only.keyword(SYSTEM_FONTS))
    {
        return Some(Parsed::Pending(name));
    }
    let (style, caps, weight, stretch, at) = parse_font_prefix(comps)?;
    let mut at = at;
    let size_comp = comps.get(at)?;
    let size = size_comp
        .keyword(FONT_SIZES)
        .or_else(|| size_comp.length_percentage(false))?;
    at += 1;
    let mut line_height = "normal".to_string();
    if comps.get(at).is_some_and(Comp::is_slash) {
        let value = comps.get(at + 1)?;
        line_height = value
            .keyword(&["normal"])
            .or_else(|| value.number(false))
            .or_else(|| value.length_percentage(false))?;
        at += 2;
    }
    let family = comps
        .get(at..)
        .filter(|rest| !rest.is_empty())
        .and_then(font_family)?;
    Some(Parsed::Values(vec![
        ("font-style", style.unwrap_or_else(|| "normal".into())),
        ("font-variant-caps", caps.unwrap_or_else(|| "normal".into())),
        ("font-variant-ligatures", "normal".into()),
        ("font-variant-numeric", "normal".into()),
        ("font-variant-east-asian", "normal".into()),
        ("font-variant-alternates", "normal".into()),
        ("font-size-adjust", "none".into()),
        ("font-language-override", "normal".into()),
        ("font-kerning", "auto".into()),
        ("font-optical-sizing", "auto".into()),
        ("font-feature-settings", "normal".into()),
        ("font-variation-settings", "normal".into()),
        ("font-variant-position", "normal".into()),
        ("font-variant-emoji", "normal".into()),
        ("font-weight", weight.unwrap_or_else(|| "normal".into())),
        ("font-stretch", stretch.unwrap_or_else(|| "normal".into())),
        ("font-size", size),
        ("line-height", line_height),
        ("font-family", family),
    ]))
}

fn grid_line_parts(comps: &[Comp]) -> Option<(bool, Option<String>, Option<String>)> {
    let mut span = false;
    let mut integer = None;
    let mut name = None;
    for comp in comps {
        if comp.is_ident(&["span"]) && !span {
            span = true;
        } else if let Some(value) = comp.integer(i64::MIN).filter(|_| integer.is_none()) {
            if value == "0" {
                return None;
            }
            integer = Some(value);
        } else {
            let value = comp
                .custom_ident(&["auto", "span"])
                .filter(|_| name.is_none())?;
            name = Some(value);
        }
    }
    Some((span, integer, name))
}

/// `<grid-line>` with Chrome's canonical part order (`span`, integer, name).
pub(super) fn grid_line(comps: &[Comp]) -> Option<String> {
    match comps {
        [only] if only.is_ident(&["auto"]) => return Some("auto".into()),
        [] => return None,
        _ => {}
    }
    let (span, integer, name) = grid_line_parts(comps)?;
    if matches!((&integer, &name), (None, None)) {
        return None;
    }
    if span
        && integer
            .as_deref()
            .is_some_and(|value| value.starts_with('-'))
    {
        return None;
    }
    Some(
        [span.then(|| "span".to_string()), integer, name]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" "),
    )
}
/// A line's default end / omitted value: a lone custom ident repeats, else `auto`.
pub(super) fn line_default(start: &str) -> String {
    let lone_ident = !start.is_empty()
        && !start.contains(' ')
        && start != "auto"
        && (start.starts_with("--")
            || !start.starts_with(|c: char| c.is_ascii_digit() || c == '-' || c == '+'));
    if lone_ident {
        start.to_string()
    } else {
        "auto".into()
    }
}

fn grid_lines(comps: &[Comp], start: &'static str, end: &'static str) -> Option<Out> {
    let parts = slashes(comps);
    let (a, b) = match parts.as_slice() {
        [a] => {
            let a = grid_line(a)?;
            let b = line_default(&a);
            (a, b)
        }
        [a, b] => (grid_line(a)?, grid_line(b)?),
        _ => return None,
    };
    Some(vec![(start, a), (end, b)])
}

fn grid_area(comps: &[Comp]) -> Option<Out> {
    let parts = slashes(comps);
    if parts.is_empty() || parts.len() > 4 {
        return None;
    }
    let lines: Vec<String> = parts
        .iter()
        .map(|part| grid_line(part))
        .collect::<Option<_>>()?;
    let row_start = lines[0].clone();
    let column_start = lines
        .get(1)
        .cloned()
        .unwrap_or_else(|| line_default(&row_start));
    let row_end = lines
        .get(2)
        .cloned()
        .unwrap_or_else(|| line_default(&row_start));
    let column_end = lines
        .get(3)
        .cloned()
        .unwrap_or_else(|| line_default(&column_start));
    Some(vec![
        ("grid-row-start", row_start),
        ("grid-column-start", column_start),
        ("grid-row-end", row_end),
        ("grid-column-end", column_end),
    ])
}

fn track_list_valid(comps: &[Comp], subgrid: bool) -> bool {
    for (index, comp) in comps.iter().enumerate() {
        let ok = match &comp.kind {
            Kind::Ident(_) => {
                (index == 0 && subgrid)
                    || comp.is_ident(&["auto", "min-content", "max-content", "masonry"])
            }
            _ => track_ok(comp, true),
        };
        if !ok {
            return false;
        }
    }
    subgrid || tracks_valid(comps)
}

/// A `<track-list>` / `<auto-track-list>` (loosely: track sizes, `repeat()`, line names).
pub(super) fn track_list(comps: &[Comp]) -> Option<String> {
    match comps {
        [] => return None,
        [only] if only.is_ident(&["none"]) => return Some("none".into()),
        _ => {}
    }
    let subgrid = comps[0].is_ident(&["subgrid"]);
    if !track_list_valid(comps, subgrid) {
        return None;
    }
    let spelled: Vec<Comp> = comps
        .iter()
        .map(|comp| Comp {
            kind: comp.kind.clone(),
            text: track_text(comp, false),
        })
        .collect();
    Some(join(&spelled))
}

/// A track breadth: a non-negative `<length-percentage>`, a sizing keyword, or (where `flex`)
/// a non-negative `fr`.
fn track_breadth(comp: &Comp, flex: bool) -> bool {
    match &comp.kind {
        Kind::Dimension { unit, value } if unit == "fr" => flex && *value >= 0.0,
        Kind::Ident(_) => comp.is_ident(&["auto", "min-content", "max-content"]),
        // Line names (`[a]`) are no length-percentage.
        _ => comp.length_percentage(false).is_some(),
    }
}
/// At least one track, and no two line-name blocks side by side.
fn tracks_valid(comps: &[Comp]) -> bool {
    let names = |comp: &Comp| matches!(&comp.kind, Kind::Function(name) if name == "[");
    comps.iter().any(|comp| !names(comp))
        && !comps
            .windows(2)
            .any(|pair| names(&pair[0]) && names(&pair[1]))
}
/// An auto-repeated track: line names or a fixed size (a `<length-percentage>`, or a
/// `minmax()` with a fixed bound and no flexible minimum).
fn track_fixed(comp: &Comp) -> bool {
    let fixed =
        |c: &Comp| !matches!(c.kind, Kind::Ident(_)) && c.length_percentage(false).is_some();
    match &comp.kind {
        Kind::Function(name) if name == "[" => true,
        // `track_ok` admitted it: `minmax(<low>, <high>)`.
        Kind::Function(name) if name == "minmax" => components(&comp.text[7..comp.text.len() - 1])
            .is_some_and(|inner| {
                inner.first().is_some_and(fixed) || inner.last().is_some_and(fixed)
            }),
        // `fit-content()` is no length-percentage.
        _ => fixed(comp),
    }
}
/// A track component spelled like Chrome: a unitless zero track size as `0px`, keywords
/// lowercase, inside `minmax()` / `fit-content()` / `repeat()` too.
fn track_text(comp: &Comp, repeat_count: bool) -> String {
    match &comp.kind {
        Kind::Number { .. } if !repeat_count => "0px".into(),
        Kind::Ident(name) => name.to_ascii_lowercase(),
        Kind::Function(name) if matches!(name.as_str(), "minmax" | "fit-content" | "repeat") => {
            let Some(inner) = components(&comp.text[name.len() + 1..comp.text.len() - 1]) else {
                unreachable!("track_ok tokenized the arguments of every track it admitted");
            };
            let mut seen_comma = false;
            let spelled: Vec<Comp> = inner
                .iter()
                .map(|part| {
                    let count = name == "repeat" && !seen_comma;
                    seen_comma |= part.is_comma();
                    Comp {
                        kind: part.kind.clone(),
                        text: track_text(part, count),
                    }
                })
                .collect();
            format!("{name}({})", join(&spelled))
        }
        _ => comp.text.clone(),
    }
}
/// One track-list component: line names, a track size, or (at the top level) `repeat()`.
fn track_ok(comp: &Comp, repeat_allowed: bool) -> bool {
    let Kind::Function(name) = &comp.kind else {
        return track_breadth(comp, true);
    };
    let inner = || components(&comp.text[name.len() + 1..comp.text.len() - 1]);
    match name.as_str() {
        "[" => true,
        "minmax" => inner().is_some_and(|inner| match inner.as_slice() {
            [low, comma, high] if comma.is_comma() => {
                track_breadth(low, false) && track_breadth(high, true)
            }
            _ => false,
        }),
        "fit-content" => inner().is_some_and(
            |inner| matches!(inner.as_slice(), [only] if only.length_percentage(false).is_some()),
        ),
        "repeat" if repeat_allowed => inner().is_some_and(|inner| {
            let Some(comma) = inner.iter().position(Comp::is_comma) else {
                return false;
            };
            let (count, auto) = match &inner[..comma] {
                [Comp {
                    kind:
                        Kind::Number {
                            value,
                            integer: true,
                        },
                    ..
                }] => (*value >= 1.0, false),
                [only] => (only.is_ident(&["auto-fill", "auto-fit"]), true),
                _ => (false, false),
            };
            let tracks = &inner[comma + 1..];
            count
                && tracks_valid(tracks)
                && tracks
                    .iter()
                    .all(|track| track_ok(track, false) && (!auto || track_fixed(track)))
        }),
        // A nested `repeat()` is no length-percentage.
        _ => comp.length_percentage(false).is_some(),
    }
}

/// A `grid-template-areas` string's cell tokens: runs of name code points, a run of `.` one
/// null cell `.`; `None` for a row without cells or with any other character.
pub(super) fn area_row(comp: &Comp) -> Option<Vec<String>> {
    let Kind::Str(text) = &comp.kind else {
        return None;
    };
    let name = |c: &char| c.is_ascii_alphanumeric() || matches!(c, '_' | '-') || *c >= '\u{80}';
    let mut cells = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(&c) = chars.peek() {
        if matches!(c, ' ' | '\t' | '\n' | '\r' | '\x0c') {
            chars.next();
        } else if c == '.' {
            while chars.next_if_eq(&'.').is_some() {}
            cells.push(".".to_string());
        } else if name(&c) {
            let mut cell = String::new();
            while let Some(c) = chars.next_if(name) {
                cell.push(c);
            }
            cells.push(cell);
        } else {
            // A trash token.
            return None;
        }
    }
    (!cells.is_empty()).then_some(cells)
}

/// `grid-template-areas` rows Chrome accepts (as many cells each, every named area a filled
/// rectangle) as quoted rows.
pub(super) fn areas_text(rows: &[Vec<String>]) -> Option<String> {
    let width = rows.first()?.len();
    if rows.iter().any(|row| row.len() != width) {
        return None;
    }
    let cells = || {
        rows.iter().enumerate().flat_map(|(y, row)| {
            row.iter()
                .enumerate()
                .filter(|(_, cell)| *cell != ".")
                .map(move |(x, cell)| (cell, x, y))
        })
    };
    for (name, _, _) in cells() {
        let own: Vec<(usize, usize)> = cells()
            .filter(|(cell, _, _)| *cell == name)
            .map(|(_, x, y)| (x, y))
            .collect();
        let span = |pick: fn(&(usize, usize)) -> usize| {
            let values = own.iter().map(pick);
            values.clone().max().unwrap_or(0) - values.min().unwrap_or(0) + 1
        };
        if span(|cell| cell.0) * span(|cell| cell.1) != own.len() {
            return None;
        }
    }
    Some(
        rows.iter()
            .map(|row| format!("\"{}\"", row.join(" ")))
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn parse_grid_template_rows(rows: &[Comp]) -> Option<(Vec<Vec<String>>, Vec<String>)> {
    let mut areas = Vec::new();
    let mut tracks = Vec::new();
    let mut at = 0;
    let names = |at: &mut usize, tracks: &mut Vec<String>| {
        if let Some(comp) = rows.get(*at) {
            if comp.kind == Kind::Function("[".into()) {
                tracks.push(comp.text.clone());
                *at += 1;
            }
        }
    };
    while at < rows.len() {
        names(&mut at, &mut tracks);
        areas.push(area_row(rows.get(at)?)?);
        at += 1;
        let size = rows.get(at).and_then(|c| {
            (c.string().is_none() && c.kind != Kind::Function("[".into()))
                .then(|| {
                    c.length_percentage(false)
                        .or_else(|| kw(c, &["auto", "min-content", "max-content"]))
                        .or_else(|| c.function_named(&["minmax", "fit-content"]))
                        .or_else(|| match &c.kind {
                            Kind::Dimension { unit, .. } if unit == "fr" => Some(c.text.clone()),
                            _ => None,
                        })
                })
                .flatten()
        });
        if let Some(size) = size {
            tracks.push(size);
            at += 1;
        } else {
            tracks.push("auto".into());
        }
        names(&mut at, &mut tracks);
    }
    Some((areas, tracks))
}

/// `grid-template`: rows, columns, areas.
fn grid_template(comps: &[Comp]) -> Option<(String, String, String)> {
    if matches!(comps, [only] if only.is_ident(&["none"])) {
        return Some(("none".into(), "none".into(), "none".into()));
    }
    let has_strings = comps.iter().any(|c| c.string().is_some());
    let parts = slashes(comps);
    if !has_strings {
        let [rows, columns] = parts.as_slice() else {
            return None;
        };
        return Some((track_list(rows)?, track_list(columns)?, "none".into()));
    }
    let (rows, columns) = match parts.as_slice() {
        [rows] => (*rows, None),
        // The explicit columns of the areas form take no `repeat()`.
        [rows, columns]
            if !columns
                .iter()
                .any(|c| c.function_named(&["repeat"]).is_some()) =>
        {
            (*rows, Some(track_list(columns)?))
        }
        _ => return None,
    };
    let (areas, tracks) = parse_grid_template_rows(rows)?;
    let merged = merge_adjacent_line_names(tracks);
    Some((
        merged.join(" "),
        columns.unwrap_or_else(|| "none".into()),
        areas_text(&areas)?,
    ))
}

/// Merge adjacent line-name blocks (`[a] [b]` -> `[a b]`).
fn merge_adjacent_line_names(tracks: Vec<String>) -> Vec<String> {
    let mut merged: Vec<String> = Vec::new();
    for track in tracks {
        if let (Some(last), true) = (merged.last_mut(), track.starts_with('[')) {
            if last.starts_with('[') {
                *last = format!("{} {}", &last[..last.len() - 1], &track[1..]);
                continue;
            }
        }
        merged.push(track);
    }
    merged
}

fn auto_flow(side: &[Comp]) -> Option<(bool, Vec<Comp>)> {
    let mut flow = false;
    let mut dense = false;
    let mut rest = Vec::new();
    for comp in side {
        if comp.is_ident(&["auto-flow"]) && !flow {
            flow = true;
        } else if comp.is_ident(&["dense"]) && !dense {
            dense = true;
        } else {
            rest.push(comp.clone());
        }
    }
    flow.then_some((dense, rest))
}

fn auto_track(auto: &[Comp]) -> Option<String> {
    if auto.is_empty() {
        Some("auto".to_string())
    } else {
        track_list(auto)
    }
}

fn grid(comps: &[Comp]) -> Option<Out> {
    let parts = slashes(comps);
    if let [rows, columns] = parts.as_slice() {
        if let Some((dense, auto)) = auto_flow(rows) {
            return Some(vec![
                ("grid-template-columns", track_list(columns)?),
                ("grid-template-rows", "none".into()),
                ("grid-template-areas", "none".into()),
                ("grid-auto-flow", if dense { "dense" } else { "row" }.into()),
                ("grid-auto-columns", "auto".into()),
                ("grid-auto-rows", auto_track(&auto)?),
            ]);
        }
        if let Some((dense, auto)) = auto_flow(columns) {
            return Some(vec![
                ("grid-template-columns", "none".into()),
                ("grid-template-rows", track_list(rows)?),
                ("grid-template-areas", "none".into()),
                (
                    "grid-auto-flow",
                    if dense { "column dense" } else { "column" }.into(),
                ),
                ("grid-auto-columns", auto_track(&auto)?),
                ("grid-auto-rows", "auto".into()),
            ]);
        }
    }
    if comps.iter().any(|c| c.is_ident(&["auto-flow", "dense"])) {
        return None;
    }
    let (rows, columns, areas) = grid_template(comps)?;
    Some(vec![
        ("grid-template-rows", rows),
        ("grid-template-columns", columns),
        ("grid-template-areas", areas),
        ("grid-auto-flow", "row".into()),
        ("grid-auto-columns", "auto".into()),
        ("grid-auto-rows", "auto".into()),
    ])
}

/// Collapse a one-to-four value side list the `margin` way.
pub(super) fn collapse4(values: &[String]) -> String {
    let full: [&str; 4] = match values {
        [a] => [a, a, a, a],
        [a, b] => [a, b, a, b],
        [a, b, c] => [a, b, c, b],
        [a, b, c, d] => [a, b, c, d],
        _ => unreachable!("every caller passes one to four values"),
    };
    super::serialize::box_text(full)
}

/// The `<slice> [/ <width> [/ <outset>]]` run starting at `at`: the slice text, the
/// index after the run, and the optional width / outset.
#[allow(clippy::type_complexity)]
fn parse_slice_width_outset(
    comps: &[Comp],
    at: usize,
    webkit: bool,
) -> Option<(String, usize, Option<String>, Option<String>)> {
    let mut at = at;
    let (values, fill) = parse_slice_values(comps, &mut at);
    if values.is_empty() {
        return None;
    }
    let mut text = collapse4(&values);
    if fill || webkit {
        text.push_str(" fill");
    }
    let mut width = None;
    let mut outset = None;
    if comps.get(at).is_some_and(Comp::is_slash) {
        at += 1;
        let w = border_image_quad(comps, &mut at, |c| {
            c.number(false)
                .or_else(|| c.length_percentage(false))
                .or_else(|| kw(c, &["auto"]))
        });
        let mut o = None;
        if comps.get(at).is_some_and(Comp::is_slash) {
            at += 1;
            o = border_image_quad(comps, &mut at, |c| {
                c.number(false).or_else(|| c.length(false))
            });
            o.as_ref()?;
        } else if w.is_none() {
            return None;
        }
        width = w;
        outset = o;
    }
    Some((text, at, width, outset))
}

fn parse_slice_values(comps: &[Comp], at: &mut usize) -> (Vec<String>, bool) {
    let mut values = Vec::new();
    let mut fill = false;
    while let Some(comp) = comps.get(*at) {
        if comp.is_ident(&["fill"]) && !fill {
            fill = true;
        } else if fill && !values.is_empty() {
            // `fill` goes before or after the numbers, not between them.
            break;
        } else if let Some(value) = comp
            .number(false)
            .or_else(|| comp.percentage(false))
            .filter(|_| values.len() < 4)
        {
            values.push(value);
        } else {
            break;
        }
        *at += 1;
    }
    (values, fill)
}

/// Up to four `ty` components starting at `at`, collapsed; `None` when there are none.
fn border_image_quad(comps: &[Comp], at: &mut usize, ty: Ty) -> Option<String> {
    let mut values = Vec::new();
    while let Some(value) = comps.get(*at).and_then(ty).filter(|_| values.len() < 4) {
        values.push(value);
        *at += 1;
    }
    (!values.is_empty()).then(|| collapse4(&values))
}

/// `border-image` / `-webkit-mask-box-image`: source, slice, width, outset, repeat
/// (`None` = omitted).
fn border_image(comps: &[Comp], webkit: bool) -> Option<[Option<String>; 5]> {
    let mut source = None;
    let mut slice = None;
    let mut width = None;
    let mut outset = None;
    let mut repeat = None;
    let mut at = 0;
    while at < comps.len() {
        let comp = &comps[at];
        if let Some(value) = comp
            .image()
            .or_else(|| kw(comp, &["none"]))
            .filter(|_| source.is_none())
        {
            source = Some(value);
            at += 1;
            continue;
        }
        if repeat.is_none() {
            let keyword = |c: &Comp| kw(c, &["stretch", "repeat", "round", "space"]);
            if let Some(first) = keyword(comp) {
                let second = comps.get(at + 1).and_then(keyword);
                at += if second.is_some() { 2 } else { 1 };
                repeat = Some(match second {
                    Some(second) if second != first => format!("{first} {second}"),
                    _ => first,
                });
                continue;
            }
        }
        if slice.is_none() {
            let (text, next_at, w, o) = parse_slice_width_outset(comps, at, webkit)?;
            slice = Some(text);
            at = next_at;
            width = w;
            outset = o;
            continue;
        }
        return None;
    }
    // Each (of at least one) component set a part, or returned.
    Some([source, slice, width, outset, repeat])
}

/// `path()` data with Chrome's spacing (commands and numbers separated by one space).
pub(super) fn path_text(text: &str) -> String {
    let Some(start) = text.find('"') else {
        unreachable!("path_data_valid found the quoted data")
    };
    let inner = &text[start + 1..text.rfind('"').unwrap_or(text.len())];
    let mut tokens = Vec::new();
    let mut current = String::new();
    for character in inner.chars() {
        path_tokenize_char(character, &mut current, &mut tokens);
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    format!("{}\"{}\")", &text[..start], tokens.join(" "))
}

/// Advance the SVG-path token state for one character: emit the pending token on a
/// command letter, whitespace or `,`; emit then start fresh on a non-exponent `-`.
fn is_path_command(c: char) -> bool {
    c.is_ascii_alphabetic() && !matches!(c, 'e' | 'E')
}

fn path_tokenize_char(character: char, current: &mut String, tokens: &mut Vec<String>) {
    if is_path_command(character) {
        if !current.is_empty() {
            tokens.push(std::mem::take(current));
        }
        tokens.push(character.to_string());
    } else if character.is_whitespace() || character == ',' {
        if !current.is_empty() {
            tokens.push(std::mem::take(current));
        }
    } else if character == '-' && !current.is_empty() && !current.ends_with(['e', 'E']) {
        tokens.push(std::mem::take(current));
        current.push(character);
    } else {
        current.push(character);
    }
}

/// `offset-anchor` from the part after the slash (`None` = invalid).
fn offset_anchor(anchor: Option<&[Comp]>) -> Option<String> {
    match anchor {
        None => Some("auto".to_string()),
        Some([only]) if only.is_ident(&["auto"]) => Some("auto".into()),
        // Three-value positions are background-only.
        Some([_, _, _]) => None,
        Some(anchor) => {
            let (x, y) = position(anchor)?;
            Some(format!("{x} {y}"))
        }
    }
}

/// The leading `offset-position` of `main` and the index after it (`None` = invalid).
fn offset_leading_position(main: &[Comp]) -> Option<(String, usize)> {
    // An empty `main` (`offset: / <anchor>`) finds no position below: `normal`, at 0.
    if let Some(first) = main
        .first()
        .filter(|first| first.is_ident(&["auto", "normal"]))
    {
        return Some((first.ident()?, 1));
    }
    let part = |c: &Comp| {
        c.keyword(&["left", "right", "top", "bottom", "center"])
            .is_some()
            || c.length_percentage(true).is_some()
    };
    for len in (1..=4).rev() {
        let Some(slice) = main.get(..len).filter(|slice| slice.iter().all(part)) else {
            continue;
        };
        if let Some((x, y)) = position(slice) {
            if len == 3 {
                return None;
            }
            return Some((format!("{x} {y}"), len));
        }
    }
    Some(("normal".to_string(), 0))
}

/// The `offset-path` at `at` and the distance / rotate after it: `Some(None)` when no
/// path starts there, `None` when it is invalid.
#[allow(clippy::type_complexity)]
fn offset_path_tail(
    main: &[Comp],
    at: usize,
) -> Option<Option<(String, Option<String>, Option<String>)>> {
    let Some(comp) = main.get(at) else {
        return Some(None);
    };
    let found = if comp.is_ident(&["none"]) {
        Some("none".to_string())
    } else {
        comp.function_named(&[
            "path", "ray", "url", "circle", "ellipse", "inset", "polygon", "xywh", "rect", "shape",
        ])
        .or_else(|| comp.url())
    };
    let Some(value) = found else {
        return Some(None);
    };
    let path = if value.starts_with("path(") {
        if !path_data_valid(&value) {
            return None;
        }
        path_text(&value)
    } else {
        value
    };
    let parsed = any_order(
        &main[at + 1..],
        &[&one(|c| c.length_percentage(true)), &rotate_part],
    )?;
    Some(Some((path, parsed[0].clone(), parsed[1].clone())))
}

fn offset(comps: &[Comp]) -> Option<Out> {
    let parts = slashes(comps);
    let (main, anchor) = match parts.as_slice() {
        [main] => (*main, None),
        [main, anchor] => (*main, Some(*anchor)),
        _ => return None,
    };
    let anchor = offset_anchor(anchor)?;
    let (position_value, mut at) = offset_leading_position(main)?;
    let mut path = "none".to_string();
    let mut distance = "0px".to_string();
    let mut rotate = "auto".to_string();
    if let Some((p, d, r)) = offset_path_tail(main, at)? {
        path = p;
        at = main.len();
        distance = d.unwrap_or(distance);
        rotate = r.unwrap_or(rotate);
    }
    // The `[/ <offset-anchor>]?` tail needs a leading position-or-path group: `offset: /
    // center` and `offset: / auto` are rejected like `offset:` alone (turbo-dom#391).
    if at != main.len() || main.is_empty() {
        return None;
    }
    Some(vec![
        ("offset-position", position_value),
        ("offset-path", path),
        ("offset-distance", distance),
        ("offset-rotate", rotate),
        ("offset-anchor", anchor),
    ])
}

/// `<offset-rotate>` from the front: `[auto | reverse] || <angle>` (an angle has a unit).
pub(super) fn rotate_part(comps: &[Comp]) -> Option<(usize, String)> {
    let first = comps.first()?;
    if let Some(keyword) = first.keyword(&["auto", "reverse"]) {
        if let Some(angle) = comps.get(1).and_then(Comp::angle_strict) {
            return Some((2, format!("{keyword} {angle}")));
        }
        return Some((1, keyword));
    }
    let angle = first.angle_strict()?;
    if let Some(keyword) = comps.get(1).and_then(|c| c.keyword(&["auto", "reverse"])) {
        return Some((2, format!("{keyword} {angle}")));
    }
    Some((1, angle))
}

/// `path()`'s string holds path data: at least one command, only path data characters.
pub(super) fn path_data_valid(text: &str) -> bool {
    let (Some(start), Some(end)) = (text.find('"'), text.rfind('"')) else {
        return false;
    };
    let data = &text[(start + 1).min(end)..end];
    !data.trim().is_empty()
        && data
            .chars()
            .all(|c| c.is_ascii_whitespace() || "MmLlHhVvCcSsQqTtAaZz0123456789.,+-eE".contains(c))
}

/// `<repeat-style>`: Chrome's canonical spelling.
pub(super) fn repeat_style(comps: &[Comp]) -> Option<(usize, String)> {
    let first = comps.first()?;
    if let Some(value) = first.keyword(&["repeat-x", "repeat-y"]) {
        return Some((1, value));
    }
    let values = ["repeat", "space", "round", "no-repeat"];
    let a = first.keyword(&values)?;
    let Some(b) = comps.get(1).and_then(|c| c.keyword(&values)) else {
        return Some((1, a));
    };
    let text = match (a.as_str(), b.as_str()) {
        (x, y) if x == y => a.clone(),
        ("repeat", "no-repeat") => "repeat-x".into(),
        ("no-repeat", "repeat") => "repeat-y".into(),
        _ => format!("{a} {b}"),
    };
    Some((2, text))
}

/// The leading `<bg-position>` of `comps` (1-4 components) and whether a size follows.
fn layer_position(comps: &[Comp]) -> Option<(usize, (String, String))> {
    let part = |c: &Comp| {
        c.keyword(&["left", "right", "top", "bottom", "center"])
            .is_some()
            || c.length_percentage(true).is_some()
    };
    let available = comps.iter().take_while(|c| part(c)).count().min(4);
    (1..=available)
        .rev()
        .find_map(|len| position(&comps[..len]).map(|value| (len, value)))
}
pub(super) fn bg_size(comps: &[Comp]) -> Option<(usize, String)> {
    let first = comps.first()?;
    if let Some(value) = first.keyword(&["cover", "contain"]) {
        return Some((1, value));
    }
    let size = |c: &Comp| c.length_percentage(false).or_else(|| kw(c, &["auto"]));
    let a = size(first)?;
    match comps.get(1).and_then(size) {
        Some(b) => Some((2, format!("{a} {b}"))),
        // A single width other than `auto` spells its height `auto`.
        None if a == "auto" => Some((1, a)),
        None => Some((1, format!("{a} auto"))),
    }
}

struct Layer {
    image: Option<String>,
    position: Option<(String, String)>,
    size: Option<String>,
    repeat: Option<String>,
    attachment: Option<String>,
    origin: Option<String>,
    clip: Option<String>,
    color: Option<String>,
    composite: Option<String>,
    mode: Option<String>,
}

/// One component (or run) of a background / mask layer at `at`: how many components it
/// consumed, or `None` when it fits no part (the layer is invalid).
fn layer_step(
    comps: &[Comp],
    at: usize,
    out: &mut Layer,
    boxes: &[&str],
    mask: bool,
    last: bool,
) -> Option<usize> {
    let comp = &comps[at];
    if let Some(used) = layer_image_step(comp, out) {
        return Some(used);
    }
    if let Step::Took(used) = layer_position_step(comps, at, out)? {
        return Some(used);
    }
    if let Some(used) = layer_repeat_step(&comps[at..], out) {
        return Some(used);
    }
    if let Some(used) = layer_attachment_step(comp, out, mask) {
        return Some(used);
    }
    if let Step::Took(used) = layer_box_step(comp, out, boxes)? {
        return Some(used);
    }
    if mask {
        layer_mask_step(comp, out)
    } else {
        layer_color_step(comp, out, last)
    }
}

/// `<bg-image>` (or `none`): records `out.image` and consumes one component.
fn layer_image_step(comp: &Comp, out: &mut Layer) -> Option<usize> {
    if out.image.is_some() {
        return None;
    }
    let value = comp.image().or_else(|| kw(comp, &["none"]))?;
    out.image = Some(value);
    Some(1)
}

/// `<repeat-style>` (one or two keywords): records `out.repeat` and reports how many
/// components it consumed.
fn layer_repeat_step(tail: &[Comp], out: &mut Layer) -> Option<usize> {
    if out.repeat.is_some() {
        return None;
    }
    let (used, value) = repeat_style(tail)?;
    out.repeat = Some(value);
    Some(used)
}

/// `<attachment>` keyword (`scroll` / `fixed` / `local`, background only): records
/// `out.attachment` and consumes one component.
fn layer_attachment_step(comp: &Comp, out: &mut Layer, mask: bool) -> Option<usize> {
    if mask || out.attachment.is_some() {
        return None;
    }
    let value = kw(comp, &["scroll", "fixed", "local"])?;
    out.attachment = Some(value);
    Some(1)
}

/// `<bg-position> [/ <bg-size>]`: `Skip` when no position starts at `at`.
fn layer_position_step(comps: &[Comp], at: usize, out: &mut Layer) -> Option<Step> {
    if out.position.is_some() {
        return Some(Step::Skip);
    }
    let Some((used, value)) = layer_position(&comps[at..]) else {
        return Some(Step::Skip);
    };
    out.position = Some(value);
    let mut consumed = used;
    if comps.get(at + used).is_some_and(Comp::is_slash) {
        let (more, size) = bg_size(&comps[at + used + 1..])?;
        out.size = Some(size);
        consumed += 1 + more;
    }
    Some(Step::Took(consumed))
}

/// An origin / clip box keyword: `Skip` when `comp` is not one, `None` when both
/// are already set.
fn layer_box_step(comp: &Comp, out: &mut Layer, boxes: &[&str]) -> Option<Step> {
    if out.clip.is_some() && out.origin.is_some() {
        return Some(Step::Skip);
    }
    let Some(value) = kw(comp, boxes) else {
        return Some(Step::Skip);
    };
    let clip_only = value == "text" || value == "no-clip";
    if out.origin.is_none() && !clip_only {
        out.origin = Some(value);
    } else if out.clip.is_none() {
        out.clip = Some(value);
    } else {
        return None;
    }
    Some(Step::Took(1))
}

fn layer_mask_step(comp: &Comp, out: &mut Layer) -> Option<usize> {
    if out.composite.is_none() {
        if let Some(value) = kw(comp, &["add", "subtract", "intersect", "exclude"]) {
            out.composite = Some(value);
            return Some(1);
        }
    }
    if out.mode.is_none() {
        if let Some(value) = kw(comp, &["alpha", "luminance", "match-source"]) {
            out.mode = Some(value);
            return Some(1);
        }
    }
    None
}

fn layer_color_step(comp: &Comp, out: &mut Layer, last: bool) -> Option<usize> {
    if !last || out.color.is_some() {
        return None;
    }
    out.color = Some(comp.color()?);
    Some(1)
}

fn layer(comps: &[Comp], mask: bool, last: bool) -> Option<Layer> {
    let mut out = Layer {
        image: None,
        position: None,
        size: None,
        repeat: None,
        attachment: None,
        origin: None,
        clip: None,
        color: None,
        composite: None,
        mode: None,
    };
    let boxes: &[&str] = if mask {
        &[
            "border-box",
            "padding-box",
            "content-box",
            "fill-box",
            "stroke-box",
            "view-box",
            "no-clip",
        ]
    } else {
        &[
            "border-box",
            "padding-box",
            "content-box",
            "text",
            "border-area",
        ]
    };
    let mut at = 0;
    while at < comps.len() {
        // Each step consumes at least one component, or the layer is invalid.
        at += layer_step(comps, at, &mut out, boxes, mask, last)?;
    }
    if out.origin.is_some() && out.clip.is_none() {
        out.clip.clone_from(&out.origin);
    }
    Some(out)
}

fn background(comps: &[Comp]) -> Option<Out> {
    let items = commas(comps)?;
    let count = items.len();
    let layers: Vec<Layer> = items
        .iter()
        .enumerate()
        .map(|(index, item)| layer(item, false, index + 1 == count))
        .collect::<Option<_>>()?;
    let column = |pick: &dyn Fn(&Layer) -> Option<String>| -> String {
        layers
            .iter()
            .map(|layer| pick(layer).unwrap_or_else(|| INITIAL.into()))
            .collect::<Vec<_>>()
            .join(", ")
    };
    Some(vec![
        ("background-image", column(&|l| l.image.clone())),
        (
            "background-position-x",
            column(&|l| l.position.as_ref().map(|p| p.0.clone())),
        ),
        (
            "background-position-y",
            column(&|l| l.position.as_ref().map(|p| p.1.clone())),
        ),
        ("background-size", column(&|l| l.size.clone())),
        ("background-repeat", column(&|l| l.repeat.clone())),
        ("background-attachment", column(&|l| l.attachment.clone())),
        ("background-origin", column(&|l| l.origin.clone())),
        ("background-clip", column(&|l| l.clip.clone())),
        (
            "background-color",
            layers
                .last()?
                .color
                .clone()
                .unwrap_or_else(|| INITIAL.into()),
        ),
    ])
}

fn mask(comps: &[Comp]) -> Option<Out> {
    let items = commas(comps)?;
    let layers: Vec<Layer> = items
        .iter()
        .map(|item| layer(item, true, false))
        .collect::<Option<_>>()?;
    let column = |pick: &dyn Fn(&Layer) -> Option<String>, initial: &str| -> String {
        layers
            .iter()
            .map(|layer| pick(layer).unwrap_or_else(|| initial.into()))
            .collect::<Vec<_>>()
            .join(", ")
    };
    Some(vec![
        ("mask-image", column(&|l| l.image.clone(), "none")),
        (
            "-webkit-mask-position-x",
            column(&|l| l.position.as_ref().map(|p| p.0.clone()), "0%"),
        ),
        (
            "-webkit-mask-position-y",
            column(&|l| l.position.as_ref().map(|p| p.1.clone()), "0%"),
        ),
        ("mask-size", column(&|l| l.size.clone(), "auto")),
        ("mask-repeat", column(&|l| l.repeat.clone(), "repeat")),
        ("mask-origin", column(&|l| l.origin.clone(), "border-box")),
        ("mask-clip", column(&|l| l.clip.clone(), "border-box")),
        ("mask-composite", column(&|l| l.composite.clone(), "add")),
        ("mask-mode", column(&|l| l.mode.clone(), "match-source")),
    ])
}

pub(super) const EASINGS: &[&str] = &[
    "linear",
    "ease",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "step-start",
    "step-end",
];
pub(super) fn easing(c: &Comp) -> Option<String> {
    kw(c, EASINGS).or_else(|| c.function_named(&["cubic-bezier", "steps", "linear"]))
}

fn transition(comps: &[Comp]) -> Option<Out> {
    let items = commas(comps)?;
    let count = items.len();
    let mut columns: [Vec<String>; 5] = Default::default();
    for item in &items {
        let property = |c: &Comp| {
            if c.is_ident(&["none"]) {
                return Some("none".to_string());
            }
            if c.is_ident(&["all"]) {
                return Some("all".to_string());
            }
            c.custom_ident(&["none", "initial"]).map(|value| {
                if value.starts_with("--") {
                    value
                } else {
                    value.to_ascii_lowercase()
                }
            })
        };
        let parsed = any_order(
            item,
            &[
                &one(|c| c.time(false)),
                &one(easing),
                &one(|c| c.time(true)),
                &one(|c| kw(c, &["normal", "allow-discrete"])),
                &one(property),
            ],
        )?;
        let parsed = [
            parsed[4].clone(),
            parsed[0].clone(),
            parsed[1].clone(),
            parsed[2].clone(),
            parsed[3].clone(),
        ];
        let property = parsed[0].clone().unwrap_or_else(|| "all".into());
        if property == "none" && count > 1 {
            return None;
        }
        columns[0].push(parsed[4].clone().unwrap_or_else(|| "normal".into()));
        columns[1].push(parsed[1].clone().unwrap_or_else(|| "0s".into()));
        columns[2].push(parsed[2].clone().unwrap_or_else(|| "ease".into()));
        columns[3].push(parsed[3].clone().unwrap_or_else(|| "0s".into()));
        columns[4].push(property);
    }
    let [behavior, duration, timing, delay, property] = columns.map(|column| column.join(", "));
    Some(vec![
        ("transition-behavior", behavior),
        ("transition-duration", duration),
        ("transition-timing-function", timing),
        ("transition-delay", delay),
        ("transition-property", property),
    ])
}

fn animation(comps: &[Comp]) -> Option<Out> {
    let items = commas(comps)?;
    let mut columns: [Vec<String>; 8] = Default::default();
    for item in items {
        let name = |c: &Comp| {
            if c.is_ident(&["none"]) {
                return Some("none".to_string());
            }
            // A quoted name serializes as an identifier.
            if matches!(c.kind, Kind::Str(_)) {
                return animation_name_string(c);
            }
            c.custom_ident(&["none"])
        };
        let duration = |c: &Comp| c.time(false).or_else(|| kw(c, &["auto"]));
        let parsed = any_order(
            item,
            &[
                &one(duration),
                &one(easing),
                &one(|c| c.time(true)),
                &one(|c| kw(c, &["infinite"]).or_else(|| c.number(false))),
                &one(|c| kw(c, &["normal", "reverse", "alternate", "alternate-reverse"])),
                &one(|c| kw(c, &["none", "forwards", "backwards", "both"])),
                &one(|c| kw(c, &["running", "paused"])),
                &one(name),
            ],
        )?;
        for (index, initial) in [
            "auto", "ease", "0s", "1", "normal", "none", "running", "none",
        ]
        .iter()
        .enumerate()
        {
            columns[index].push(
                parsed[index]
                    .clone()
                    .unwrap_or_else(|| (*initial).to_string()),
            );
        }
    }
    let names = [
        "animation-duration",
        "animation-timing-function",
        "animation-delay",
        "animation-iteration-count",
        "animation-direction",
        "animation-fill-mode",
        "animation-play-state",
        "animation-name",
    ];
    let mut out: Out = names
        .iter()
        .copied()
        .zip(columns.map(|column| column.join(", ")))
        .collect();
    out.push(("animation-timeline", "auto".into()));
    out.push(("animation-range-start", "normal".into()));
    out.push(("animation-range-end", "normal".into()));
    Some(out)
}

fn timeline_trigger(comps: &[Comp]) -> Option<Out> {
    let defaults = || {
        vec![
            ("timeline-trigger-source", "auto".to_string()),
            (
                "timeline-trigger-activation-range-start",
                "normal".to_string(),
            ),
            (
                "timeline-trigger-activation-range-end",
                "normal".to_string(),
            ),
            ("timeline-trigger-active-range-start", "auto".to_string()),
            ("timeline-trigger-active-range-end", "auto".to_string()),
        ]
    };
    if let [only] = comps {
        if only.is_ident(&["none"]) {
            let mut out = vec![("timeline-trigger-name", "none".to_string())];
            out.extend(defaults());
            return Some(out);
        }
    }
    // A comma list of triggers: each longhand lists its value per trigger.
    let items = commas(comps)?;
    if items.len() > 1 {
        let mut columns: Vec<(&'static str, Vec<String>)> = Vec::new();
        for item in items {
            for (index, (name, value)) in timeline_trigger_item(item)?.into_iter().enumerate() {
                if columns.len() <= index {
                    columns.push((name, Vec::new()));
                }
                columns[index].1.push(value);
            }
        }
        return Some(
            columns
                .into_iter()
                .map(|(name, values)| (name, values.join(", ")))
                .collect(),
        );
    }
    timeline_trigger_item(comps)
}

fn timeline_trigger_ranges(rest: &[Comp], more: &mut [(&str, String)]) -> Option<()> {
    let parts = slashes(rest);
    if !(parts[0].is_empty() && parts.len() == 2) {
        let activation = range_pair(
            parts[0],
            "timeline-trigger-activation-range-start",
            "timeline-trigger-activation-range-end",
            "normal",
        )?;
        more[0].1.clone_from(&activation[0].1);
        more[1].1.clone_from(&activation[1].1);
    }
    if let Some(active) = parts.get(1) {
        let active = range_pair(
            active,
            "timeline-trigger-active-range-start",
            "timeline-trigger-active-range-end",
            "auto",
        )?;
        more[2].1.clone_from(&active[0].1);
        more[3].1.clone_from(&active[1].1);
    }
    (parts.len() <= 2).then_some(())
}

fn timeline_trigger_item(comps: &[Comp]) -> Option<Out> {
    let defaults = || {
        vec![
            ("timeline-trigger-source", "auto".to_string()),
            (
                "timeline-trigger-activation-range-start",
                "normal".to_string(),
            ),
            (
                "timeline-trigger-activation-range-end",
                "normal".to_string(),
            ),
            ("timeline-trigger-active-range-start", "auto".to_string()),
            ("timeline-trigger-active-range-end", "auto".to_string()),
        ]
    };
    let (name, rest) = match comps.split_first() {
        Some((first, rest)) if first.dashed_ident().is_some() => (first.dashed_ident()?, rest),
        _ => ("none".to_string(), comps),
    };
    let source_of = |c: &Comp| {
        c.function_named(&["view", "scroll"])
            .or_else(|| kw(c, &["auto", "none"]))
    };
    let (source, rest) = match rest.split_first() {
        Some((first, rest)) if source_of(first).is_some() => (source_of(first)?, rest),
        _ => ("auto".to_string(), rest),
    };
    let mut out = vec![
        ("timeline-trigger-name", name),
        ("timeline-trigger-source", source),
    ];
    let mut more = defaults().split_off(1);
    if !rest.is_empty() {
        timeline_trigger_ranges(rest, &mut more)?;
    }
    out.extend(more);
    Some(out)
}

#[cfg(test)]
mod offset_slash_strict_tests {
    use super::super::components::components;
    use super::expand;

    /// turbo-dom#391: the `offset` shorthand's `[/ <offset-anchor>]?` tail needs a leading
    /// position or path; Chrome 156 rejects `offset: / center` and `offset: / auto`
    /// (oracle `CSS.supports('offset', '/ center') === false`, headless-shell 156.0.8078.47).
    #[test]
    fn offset_rejects_bare_slash_anchor() {
        for value in ["/ center", "/ auto", "/ left top", "/ 10px"] {
            let comps = components(value).expect("tokenizes");
            assert!(
                expand("offset", &comps).is_none(),
                "offset: {value} must not be accepted (Chrome 156 rejects)"
            );
        }
    }
}
