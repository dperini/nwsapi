//! Shorthand serialization from longhand values (`getPropertyValue(shorthand)`), per Chrome
//! 156. `value` receives the longhands in table order; an empty result means the values have
//! no shorthand spelling.
use super::grammar::line_default;
use super::table;

const INITIAL: &str = "initial";

/// Side values collapsed the `margin` way.
pub(super) fn box_text(v: [&str; 4]) -> String {
    let [top, right, bottom, left] = v;
    if left != right {
        format!("{top} {right} {bottom} {left}")
    } else if bottom != top {
        format!("{top} {right} {bottom}")
    } else if right != top {
        format!("{top} {right}")
    } else {
        top.to_string()
    }
}
fn pair_text(a: &str, b: &str) -> String {
    if a == b {
        a.to_string()
    } else {
        format!("{a} {b}")
    }
}
fn all_same(values: &[&str]) -> String {
    if values.iter().all(|value| *value == values[0]) {
        values[0].to_string()
    } else {
        String::new()
    }
}
fn joined(parts: &[&str]) -> String {
    parts
        .iter()
        .filter(|part| !part.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(" ")
}
/// A comma-separated list's items (commas inside functions do not split).
fn layers(value: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut depth = 0usize;
    let mut start = 0;
    for (index, character) in value.char_indices() {
        match character {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => {
                out.push(value[start..index].trim());
                start = index + 1;
            }
            _ => {}
        }
    }
    out.push(value[start..].trim());
    out
}

struct Values<'a> {
    names: &'static [&'static str],
    texts: &'a [&'a str],
}
impl<'a> Values<'a> {
    fn get(&self, name: &str) -> &'a str {
        self.names
            .iter()
            .position(|candidate| *candidate == name)
            .map_or("", |index| self.texts[index])
    }
    fn many<const N: usize>(&self, names: [&str; N]) -> [&'a str; N] {
        names.map(|name| self.get(name))
    }
}

/// `<line-width> <line-style> <color>` without their initial values; `""` if all are.
fn line(width: &str, style: &str, color: &str) -> String {
    joined(&[
        if width == "medium" || width == INITIAL {
            ""
        } else {
            width
        },
        if style == "none" || style == INITIAL {
            ""
        } else {
            style
        },
        if color == "currentcolor" || color == INITIAL {
            ""
        } else {
            color
        },
    ])
}

fn omit(value: &str, initial: &str) -> bool {
    value == INITIAL || value == initial
}

fn ser_margin(v: &Values<'_>) -> String {
    box_text(v.many(["margin-top", "margin-right", "margin-bottom", "margin-left"]))
}

fn ser_border_radius(v: &Values<'_>) -> String {
    let corners = v.many([
        "border-top-left-radius",
        "border-top-right-radius",
        "border-bottom-right-radius",
        "border-bottom-left-radius",
    ]);
    let mut horizontal = [""; 4];
    let mut vertical = [""; 4];
    for (index, corner) in corners.iter().enumerate() {
        let mut parts = corner.splitn(2, ' ');
        let h = parts.next().unwrap_or("");
        horizontal[index] = h;
        vertical[index] = parts.next().unwrap_or(h);
    }
    let h = box_text(horizontal);
    let vertical_text = box_text(vertical);
    if horizontal == vertical {
        h
    } else {
        format!("{h} / {vertical_text}")
    }
}

fn ser_column_rule_inset(v: &Values<'_>, grammar: &str) -> String {
    let kind = if grammar == "column-rule-inset" {
        "column"
    } else {
        "row"
    };
    rule_inset(v, kind)
}

fn ser_rule_inset(v: &Values<'_>) -> String {
    let column = rule_inset(v, "column");
    if column == rule_inset(v, "row") {
        column
    } else {
        String::new()
    }
}

fn ser_rule_inset_cap(v: &Values<'_>, grammar: &str) -> String {
    let part = if grammar == "rule-inset-cap" {
        "cap"
    } else {
        "junction"
    };
    let get = |kind: &str, side: &str| v.get(&format!("{kind}-rule-inset-{part}-{side}"));
    let row = pair_text(get("row", "start"), get("row", "end"));
    if row == pair_text(get("column", "start"), get("column", "end")) {
        row
    } else {
        String::new()
    }
}

fn ser_background_position(texts: &[&str]) -> String {
    let (x, y) = (texts[0], texts[1]);
    let (xs, ys) = (layers(x), layers(y));
    if xs.len() != ys.len() {
        // Uneven lists: each layer's set parts; layers with none drop out.
        let count = xs.len().max(ys.len());
        return (0..count)
            .map(|index| joined(&[list_part(&xs, index), list_part(&ys, index)]))
            .filter(|layer| !layer.is_empty())
            .collect::<Vec<_>>()
            .join(", ");
    }
    if xs.iter().chain(&ys).any(|item| *item == INITIAL) {
        return String::new();
    }
    xs.iter()
        .zip(ys)
        .map(|(x, y)| format!("{x} {y}"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn ser_border_top(v: &Values<'_>, grammar: &str) -> String {
    let [width, style, color] =
        v.many(["width", "style", "color"].map(|part| leak_part(grammar, part)));
    line(width, style, color)
}

fn ser_border_block_start(v: &Values<'_>, grammar: &str) -> String {
    let parts = v.many(["width", "style", "color"].map(|part| leak_part(grammar, part)));
    joined(&parts.map(|value| if value == INITIAL { "" } else { value }))
}

fn ser_border_block(v: &Values<'_>, grammar: &str) -> String {
    let (start, end) = match grammar {
        "border-block" => ("border-block-start", "border-block-end"),
        "border-inline" => ("border-inline-start", "border-inline-end"),
        _ => ("column-rule", "row-rule"),
    };
    let a = ["width", "style", "color"].map(|part| v.get(leak_part(start, part)));
    let b = ["width", "style", "color"].map(|part| v.get(leak_part(end, part)));
    if a == b {
        line(a[0], a[1], a[2])
    } else {
        String::new()
    }
}

fn ser_border(v: &Values<'_>) -> String {
    let image = v.many([
        "border-image-source",
        "border-image-slice",
        "border-image-width",
        "border-image-outset",
        "border-image-repeat",
    ]);
    if image != ["none", "100%", "1", "0", "stretch"] {
        return String::new();
    }
    let mut parts = [""; 3];
    for (index, part) in ["width", "style", "color"].iter().enumerate() {
        let sides = ["top", "right", "bottom", "left"]
            .map(|side| v.get(leak_part(&format!("border-{side}"), part)));
        if sides.iter().any(|value| *value != sides[0]) {
            return String::new();
        }
        parts[index] = sides[0];
    }
    line(parts[0], parts[1], parts[2])
}

fn ser_text_decoration(v: &Values<'_>) -> String {
    let [line, thickness, style, color] = v.many([
        "text-decoration-line",
        "text-decoration-thickness",
        "text-decoration-style",
        "text-decoration-color",
    ]);
    let text = joined(&[
        if omit(line, "none") { "" } else { line },
        if omit(thickness, "auto") {
            ""
        } else {
            thickness
        },
        if omit(style, "solid") { "" } else { style },
        if omit(color, "currentcolor") {
            ""
        } else {
            color
        },
    ]);
    if text.is_empty() {
        if line == INITIAL {
            "none".into()
        } else {
            line.to_string()
        }
    } else {
        text
    }
}

fn ser_text_emphasis(v: &Values<'_>) -> String {
    let [style, color] = v.many(["text-emphasis-style", "text-emphasis-color"]);
    let text = joined(&[
        if omit(style, "none") { "" } else { style },
        if omit(color, "currentcolor") {
            ""
        } else {
            color
        },
    ]);
    if text.is_empty() {
        "none".into()
    } else {
        text
    }
}

fn ser_flex_flow(v: &Values<'_>) -> String {
    let [direction, wrap] = v.many(["flex-direction", "flex-wrap"]);
    if wrap == "nowrap" {
        direction.to_string()
    } else if direction == "row" {
        wrap.to_string()
    } else {
        format!("{direction} {wrap}")
    }
}

fn ser_columns(v: &Values<'_>) -> String {
    // Chrome 156 leaves `column-wrap` out of the spelling, whatever its value.
    let [width, count, height] = v.many(["column-width", "column-count", "column-height"]);
    let main = match (width, count) {
        ("auto", "auto") => "auto".to_string(),
        ("auto", count) => count.to_string(),
        (width, "auto") => width.to_string(),
        (width, count) => format!("{width} {count}"),
    };
    if height == "auto" {
        main
    } else {
        format!("{main} / {height}")
    }
}

fn ser_container(v: &Values<'_>) -> String {
    let [name, kind] = v.many(["container-name", "container-type"]);
    if kind == "normal" {
        name.to_string()
    } else {
        format!("{name} / {kind}")
    }
}

fn ser_text_wrap(v: &Values<'_>) -> String {
    let [mode, style] = v.many(["text-wrap-mode", "text-wrap-style"]);
    let mode = if mode == INITIAL { "wrap" } else { mode };
    let style = if style == INITIAL { "auto" } else { style };
    if style == "auto" {
        mode.to_string()
    } else if mode == "wrap" {
        style.to_string()
    } else {
        format!("{mode} {style}")
    }
}

fn ser_white_space(v: &Values<'_>) -> String {
    let [collapse, mode] = v.many(["white-space-collapse", "text-wrap-mode"]);
    let collapse = if collapse == INITIAL {
        "collapse"
    } else {
        collapse
    };
    let mode = if mode == INITIAL { "wrap" } else { mode };
    match (collapse, mode) {
        ("collapse", "wrap") => "normal".into(),
        ("preserve", "nowrap") => "pre".into(),
        ("collapse", "nowrap") => "nowrap".into(),
        ("preserve", "wrap") => "pre-wrap".into(),
        ("preserve-breaks", "wrap") => "pre-line".into(),
        ("break-spaces", "wrap") => "break-spaces".into(),
        (collapse, mode) => format!("{collapse} {mode}"),
    }
}

fn ser_font_synthesis(v: &Values<'_>) -> String {
    let values = v.many([
        "font-synthesis-weight",
        "font-synthesis-style",
        "font-synthesis-small-caps",
    ]);
    let mut parts = Vec::new();
    for (value, name) in values.iter().zip(["weight", "style", "small-caps"]) {
        match *value {
            "auto" => parts.push(name),
            "none" => {}
            _ => return String::new(),
        }
    }
    if parts.is_empty() {
        "none".into()
    } else {
        parts.join(" ")
    }
}

fn ser_text_box(v: &Values<'_>) -> String {
    let [trim, edge] = v.many(["text-box-trim", "text-box-edge"]);
    match (trim, edge) {
        ("none", "auto") => "normal".into(),
        ("trim-both", "auto") => "trim-both".into(),
        ("trim-both", edge) => edge.to_string(),
        (trim, "auto") => trim.to_string(),
        (trim, edge) => format!("{trim} {edge}"),
    }
}

fn ser_position_try(v: &Values<'_>) -> String {
    let [order, fallbacks] = v.many(["position-try-order", "position-try-fallbacks"]);
    if order == "normal" {
        fallbacks.to_string()
    } else {
        format!("{order} {fallbacks}")
    }
}

fn ser_scroll_timeline(v: &Values<'_>) -> String {
    let [names, axes] = v.many(["scroll-timeline-name", "scroll-timeline-axis"]);
    let (names, axes) = (layers(names), layers(axes));
    if names.len() != axes.len() {
        return String::new();
    }
    names
        .iter()
        .zip(axes)
        .map(|(name, axis)| {
            if axis == "block" {
                (*name).to_string()
            } else {
                format!("{name} {axis}")
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn ser_view_timeline(v: &Values<'_>) -> String {
    let [names, axes, insets] = v.many([
        "view-timeline-name",
        "view-timeline-axis",
        "view-timeline-inset",
    ]);
    let (names, axes, insets) = (layers(names), layers(axes), layers(insets));
    if names.len() != axes.len() || names.len() != insets.len() {
        return String::new();
    }
    (0..names.len())
        .map(|index| {
            joined(&[
                names[index],
                if axes[index] == "block" {
                    ""
                } else {
                    axes[index]
                },
                if insets[index] == "auto" {
                    ""
                } else {
                    insets[index]
                },
            ])
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn ser_font_variant(v: &Values<'_>) -> String {
    let values = v.many([
        "font-variant-ligatures",
        "font-variant-caps",
        "font-variant-alternates",
        "font-variant-numeric",
        "font-variant-east-asian",
        "font-variant-position",
        "font-variant-emoji",
    ]);
    if values.iter().all(|value| *value == "normal") {
        return "normal".into();
    }
    if values[0] == "none" {
        return if values[1..].iter().all(|value| *value == "normal") {
            "none".into()
        } else {
            String::new()
        };
    }
    joined(&values.map(|value| if value == "normal" { "" } else { value }))
}

fn ser_flex(v: &Values<'_>) -> String {
    let [grow, shrink, basis] = v.many(["flex-grow", "flex-shrink", "flex-basis"]);
    format!("{grow} {shrink} {basis}")
}

fn ser_grid_area(v: &Values<'_>) -> String {
    let [row_start, column_start, row_end, column_end] = v.many([
        "grid-row-start",
        "grid-column-start",
        "grid-row-end",
        "grid-column-end",
    ]);
    let mut parts = vec![row_start, column_start, row_end, column_end];
    if column_end == line_default(column_start) {
        parts.pop();
        if row_end == line_default(row_start) {
            parts.pop();
            if column_start == line_default(row_start) {
                parts.pop();
            }
        }
    }
    parts.join(" / ")
}

fn ser_grid_row(texts: &[&str]) -> String {
    let (start, end) = (texts[0], texts[1]);
    if end == line_default(start) {
        start.to_string()
    } else {
        format!("{start} / {end}")
    }
}

fn ser_grid_template(v: &Values<'_>) -> String {
    let [rows, columns, areas] = v.many([
        "grid-template-rows",
        "grid-template-columns",
        "grid-template-areas",
    ]);
    grid_template(rows, columns, areas)
}

fn ser_grid(v: &Values<'_>) -> String {
    let [rows, columns, areas, flow, auto_columns, auto_rows] = v.many([
        "grid-template-rows",
        "grid-template-columns",
        "grid-template-areas",
        "grid-auto-flow",
        "grid-auto-columns",
        "grid-auto-rows",
    ]);
    if flow == "row" && auto_rows == "auto" && auto_columns == "auto" {
        return grid_template(rows, columns, areas);
    }
    if areas != "none" {
        return String::new();
    }
    grid_auto_flow_text(rows, columns, flow, auto_columns, auto_rows)
}

/// `grid` with an `auto-flow` side: `auto-flow [dense] [<auto-rows>] / <columns>` or
/// `<rows> / auto-flow [dense] [<auto-columns>]`; `""` when neither form fits.
fn grid_auto_flow_text(
    rows: &str,
    columns: &str,
    flow: &str,
    auto_columns: &str,
    auto_rows: &str,
) -> String {
    let dense = if flow.ends_with("dense") { "dense" } else { "" };
    let unless_auto = |value: &str| {
        if value == "auto" {
            String::new()
        } else {
            value.to_string()
        }
    };
    if (flow.starts_with("row") || flow == "dense") && rows == "none" && auto_columns == "auto" {
        let head = joined(&["auto-flow", dense, &unless_auto(auto_rows)]);
        return format!("{head} / {columns}");
    }
    if flow.starts_with("column") && columns == "none" && auto_rows == "auto" {
        let tail = joined(&["auto-flow", dense, &unless_auto(auto_columns)]);
        return format!("{rows} / {tail}");
    }
    String::new()
}

fn ser_border_image(v: &Values<'_>) -> String {
    let [source, slice, width, outset, repeat] = v.many([
        "border-image-source",
        "border-image-slice",
        "border-image-width",
        "border-image-outset",
        "border-image-repeat",
    ]);
    if [slice, width, outset, repeat] == ["100%", "1", "0", "stretch"] {
        return source.to_string();
    }
    format!("{source} {slice} / {width} / {outset} {repeat}")
}

fn ser_offset(v: &Values<'_>) -> String {
    let [position, path, distance, rotate, anchor] = v.many([
        "offset-position",
        "offset-path",
        "offset-distance",
        "offset-rotate",
        "offset-anchor",
    ]);
    let moved = distance != "0px" || rotate != "auto";
    let main = joined(&[
        if position == "normal" { "" } else { position },
        if path == "none" && !moved { "" } else { path },
        if distance == "0px" { "" } else { distance },
        if rotate == "auto" { "" } else { rotate },
    ]);
    let main = if main.is_empty() {
        "normal".to_string()
    } else {
        main
    };
    if anchor == "auto" {
        main
    } else {
        format!("{main} / {anchor}")
    }
}

fn ser_timeline_trigger(v: &Values<'_>) -> String {
    let columns = [
        "timeline-trigger-name",
        "timeline-trigger-source",
        "timeline-trigger-activation-range-start",
        "timeline-trigger-activation-range-end",
        "timeline-trigger-active-range-start",
        "timeline-trigger-active-range-end",
    ]
    .map(|name| layers(v.get(name)));
    // Lists of different lengths have no shorthand spelling.
    let count = columns[0].len();
    if columns.iter().any(|column| column.len() != count) {
        return String::new();
    }
    (0..count)
        .map(|index| {
            let [name, source, a_start, a_end, b_start, b_end] =
                [0, 1, 2, 3, 4, 5].map(|column| columns[column][index]);
            trigger(name, source, [a_start, a_end], [b_start, b_end])
        })
        .collect::<Vec<_>>()
        .join(", ")
}

pub(super) fn value(grammar: &str, texts: &[&str]) -> String {
    let Some(entry) = table::entry(grammar) else {
        unreachable!("every table entry's grammar names a table entry (table::tests)");
    };
    let v = Values {
        names: entry.longhands,
        texts,
    };
    match grammar {
        "margin" => ser_margin(&v),
        "padding" => box_text(v.many([
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
        ])),
        "inset" => box_text(v.many(["top", "right", "bottom", "left"])),
        "scroll-margin" => box_text(v.many([
            "scroll-margin-top",
            "scroll-margin-right",
            "scroll-margin-bottom",
            "scroll-margin-left",
        ])),
        "scroll-padding" => box_text(v.many([
            "scroll-padding-top",
            "scroll-padding-right",
            "scroll-padding-bottom",
            "scroll-padding-left",
        ])),
        "border-width" => box_text(v.many([
            "border-top-width",
            "border-right-width",
            "border-bottom-width",
            "border-left-width",
        ])),
        "border-style" => box_text(v.many([
            "border-top-style",
            "border-right-style",
            "border-bottom-style",
            "border-left-style",
        ])),
        "border-color" => box_text(v.many([
            "border-top-color",
            "border-right-color",
            "border-bottom-color",
            "border-left-color",
        ])),
        "corner-shape" => box_text(v.many([
            "corner-top-left-shape",
            "corner-top-right-shape",
            "corner-bottom-right-shape",
            "corner-bottom-left-shape",
        ])),
        "border-radius" | "-webkit-border-radius" => ser_border_radius(&v),
        "column-rule-inset" | "row-rule-inset" => ser_column_rule_inset(&v, grammar),
        "rule-inset" => ser_rule_inset(&v),
        "rule-inset-cap" | "rule-inset-junction" => ser_rule_inset_cap(&v, grammar),
        "contain-intrinsic-size"
        | "margin-block"
        | "margin-inline"
        | "padding-block"
        | "padding-inline"
        | "inset-block"
        | "inset-inline"
        | "scroll-margin-block"
        | "scroll-margin-inline"
        | "scroll-padding-block"
        | "scroll-padding-inline"
        | "border-block-width"
        | "border-block-style"
        | "border-block-color"
        | "border-inline-width"
        | "border-inline-style"
        | "border-inline-color"
        | "gap"
        | "overflow"
        | "overscroll-behavior"
        | "border-spacing"
        | "interest-delay"
        | "column-rule-inset-cap"
        | "column-rule-inset-junction"
        | "row-rule-inset-cap"
        | "row-rule-inset-junction"
        | "corner-top-shape"
        | "corner-right-shape"
        | "corner-bottom-shape"
        | "corner-left-shape"
        | "corner-block-start-shape"
        | "corner-block-end-shape"
        | "corner-inline-start-shape"
        | "corner-inline-end-shape" => pair_text(texts[0], texts[1]),
        "place-items" => pair_text(v.get("align-items"), v.get("justify-items")),
        "place-self" => pair_text(v.get("align-self"), v.get("justify-self")),
        "place-content" => pair_text(v.get("align-content"), v.get("justify-content")),
        "background-position" | "mask-position" | "-webkit-mask-position" => {
            ser_background_position(texts)
        }
        "marker"
        | "rule-break"
        | "rule-color"
        | "rule-style"
        | "rule-width"
        | "rule-visibility-items"
        | "column-rule-inset-start"
        | "column-rule-inset-end"
        | "row-rule-inset-start"
        | "row-rule-inset-end"
        | "rule-inset-start"
        | "rule-inset-end" => all_same(texts),
        "animation-range" => range(
            v.get("animation-range-start"),
            v.get("animation-range-end"),
            "normal",
        ),
        "timeline-trigger-activation-range" => ranges(
            v.get("timeline-trigger-activation-range-start"),
            v.get("timeline-trigger-activation-range-end"),
            "normal",
        ),
        "timeline-trigger-active-range" => ranges(
            v.get("timeline-trigger-active-range-start"),
            v.get("timeline-trigger-active-range-end"),
            "auto",
        ),
        "border-top" | "border-right" | "border-bottom" | "border-left" | "column-rule"
        | "row-rule" => ser_border_top(&v, grammar),
        // The logical sides leave omitted parts `initial` and keep every other value.
        "border-block-start" | "border-block-end" | "border-inline-start" | "border-inline-end" => {
            ser_border_block_start(&v, grammar)
        }
        "border-block" | "border-inline" | "rule" => ser_border_block(&v, grammar),
        "border" => ser_border(&v),
        "outline" => joined(
            &v.many(["outline-color", "outline-style", "outline-width"])
                .map(|value| if value == INITIAL { "" } else { value }),
        ),
        "-webkit-text-stroke" => joined(
            &v.many(["-webkit-text-stroke-width", "-webkit-text-stroke-color"])
                .map(|value| if value == INITIAL { "" } else { value }),
        ),
        "text-decoration" => ser_text_decoration(&v),
        "text-emphasis" | "-webkit-text-emphasis" => ser_text_emphasis(&v),
        "flex-flow" | "-webkit-flex-flow" => ser_flex_flow(&v),
        "list-style" => joined(
            &v.many(["list-style-position", "list-style-image", "list-style-type"])
                .map(|value| if value == INITIAL { "" } else { value }),
        ),
        "columns" | "-webkit-columns" => ser_columns(&v),
        "container" => ser_container(&v),
        "text-wrap" => ser_text_wrap(&v),
        "white-space" => ser_white_space(&v),
        "font-synthesis" => ser_font_synthesis(&v),
        "text-box" => ser_text_box(&v),
        "position-try" => ser_position_try(&v),
        "scroll-timeline" => ser_scroll_timeline(&v),
        "view-timeline" => ser_view_timeline(&v),
        "font-variant" => ser_font_variant(&v),
        "flex" | "-webkit-flex" => ser_flex(&v),
        "font" => font(&v),
        "grid-area" => ser_grid_area(&v),
        "grid-row" | "grid-column" => ser_grid_row(texts),
        "grid-template" => ser_grid_template(&v),
        "grid" => ser_grid(&v),
        "border-image" => ser_border_image(&v),
        "offset" => ser_offset(&v),
        "background" => background(&v),
        "mask" | "-webkit-mask" => mask(&v),
        "transition" | "-webkit-transition" => transition(&v),
        "animation" | "-webkit-animation" => animation(&v),
        "timeline-trigger" => ser_timeline_trigger(&v),
        _ => String::new(),
    }
}

fn leak_part(prefix: &str, part: &str) -> &'static str {
    let name = format!("{prefix}-{part}");
    table::SHORTHANDS
        .iter()
        .flat_map(|entry| entry.longhands.iter())
        .find(|longhand| **longhand == name)
        .copied()
        .unwrap_or("")
}

fn rule_inset(v: &Values<'_>, kind: &str) -> String {
    let get = |part: &str| v.get(&format!("{kind}-rule-inset-{part}"));
    let [cap_start, cap_end, junction_start, junction_end] =
        ["cap-start", "cap-end", "junction-start", "junction-end"].map(get);
    if [cap_end, junction_start, junction_end]
        .iter()
        .all(|value| *value == cap_start)
    {
        return cap_start.to_string();
    }
    format!("{cap_start} {cap_end} / {junction_start} {junction_end}")
}

const RANGE_NAMES: &[&str] = &[
    "cover",
    "contain",
    "entry",
    "exit",
    "entry-crossing",
    "exit-crossing",
    "scroll",
];
/// The `index`th item of a comma list, `""` past its end or for an implicit initial value.
fn list_part<'a>(list: &[&'a str], index: usize) -> &'a str {
    match list.get(index) {
        Some(&value) if value != INITIAL => value,
        _ => "",
    }
}
/// One timeline trigger: Chrome writes each part that differs from its initial value; the
/// active range follows a slash when its start is set, even after nothing.
fn trigger(name: &str, source: &str, activation: [&str; 2], active: [&str; 2]) -> String {
    let activation = trigger_parts(activation[0], activation[1], "normal");
    let mut text = joined(&[
        if name == "none" { "" } else { name },
        if source == "auto" { "" } else { source },
        &activation,
    ]);
    if !active[0].is_empty() && active[0] != "auto" {
        text = format!("{text} / {}", trigger_parts(active[0], active[1], "auto"));
    } else if !active[1].is_empty() && active[1] != "auto" {
        text = joined(&[&text, active[1]]);
    }
    if text.is_empty() {
        "none".into()
    } else {
        text
    }
}
/// A trigger range's parts that differ from `initial` (the end only when it is not its
/// start's default).
fn trigger_parts(start: &str, end: &str, initial: &str) -> String {
    let name = start.split(' ').next().unwrap_or("");
    let mut parts = Vec::new();
    if start != initial {
        parts.push(start);
    }
    if end != initial && end != name {
        parts.push(end);
    }
    parts.join(" ")
}
/// [`range`] per item of comma lists (a timeline trigger list).
fn ranges(start: &str, end: &str, initial: &str) -> String {
    let (starts, ends) = (layers(start), layers(end));
    if starts.len() != ends.len() {
        return String::new();
    }
    starts
        .iter()
        .zip(ends)
        .map(|(start, end)| range(start, end, initial))
        .collect::<Vec<_>>()
        .join(", ")
}
fn range(start: &str, end: &str, initial: &str) -> String {
    let name = start.split(' ').next().unwrap_or("");
    let default = if RANGE_NAMES.contains(&name) {
        name
    } else if initial == "auto" && start == "normal" {
        "auto"
    } else {
        initial
    };
    // An active range's `auto` end is left out too.
    if end == default || (initial == "auto" && end == "auto") {
        start.to_string()
    } else {
        format!("{start} {end}")
    }
}

const STRETCH_KEYWORDS: &[(&str, &str)] = &[
    ("50%", "ultra-condensed"),
    ("62.5%", "extra-condensed"),
    ("75%", "condensed"),
    ("87.5%", "semi-condensed"),
    ("100%", "normal"),
    ("112.5%", "semi-expanded"),
    ("125%", "expanded"),
    ("150%", "extra-expanded"),
    ("200%", "ultra-expanded"),
];

fn font_prefix_ok(v: &Values<'_>) -> bool {
    [
        ("font-variant-ligatures", "normal"),
        ("font-variant-numeric", "normal"),
        ("font-variant-east-asian", "normal"),
        ("font-variant-alternates", "normal"),
        ("font-variant-position", "normal"),
        ("font-variant-emoji", "normal"),
        ("font-size-adjust", "none"),
        ("font-kerning", "auto"),
        ("font-optical-sizing", "auto"),
        ("font-feature-settings", "normal"),
        ("font-variation-settings", "normal"),
        ("font-language-override", "normal"),
    ]
    .iter()
    .all(|(name, initial)| v.get(name) == *initial)
}

fn non_normal(value: &str) -> &str {
    if value == "normal" {
        ""
    } else {
        value
    }
}

fn font(v: &Values<'_>) -> String {
    if !font_prefix_ok(v) {
        return String::new();
    }
    let caps = v.get("font-variant-caps");
    if !matches!(caps, "normal" | "small-caps") {
        return String::new();
    }
    let mut stretch = v.get("font-stretch");
    if stretch.ends_with('%') {
        match STRETCH_KEYWORDS
            .iter()
            .find(|(percent, _)| *percent == stretch)
        {
            Some((_, keyword)) => stretch = keyword,
            None => return String::new(),
        }
    }
    let style = v.get("font-style");
    let weight = v.get("font-weight");
    let size = v.get("font-size");
    let line_height = v.get("line-height");
    let family = v.get("font-family");
    let size = if line_height == "normal" {
        size.to_string()
    } else {
        format!("{size} / {line_height}")
    };
    joined(&[
        non_normal(style),
        non_normal(caps),
        non_normal(weight),
        non_normal(stretch),
        &size,
        family,
    ])
}

/// Split a track list into its line-name blocks (`[...]`) and track sizes.
fn tracks(rows: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut depth = 0;
    for character in rows.chars() {
        match character {
            '[' | '(' => {
                depth += 1;
                current.push(character);
            }
            ']' | ')' => {
                depth -= 1;
                current.push(character);
            }
            ' ' if depth == 0 => {
                if !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

fn grid_template(rows: &str, columns: &str, areas: &str) -> String {
    if areas == "none" {
        if rows == "none" && columns == "none" {
            return "none".into();
        }
        return format!("{rows} / {columns}");
    }
    let strings = quoted_strings(areas);
    let mut parts = Vec::new();
    let mut index = 0;
    let row_tracks = tracks(rows);
    let sizes = row_tracks
        .iter()
        .filter(|track| !track.starts_with('['))
        .count();
    if sizes != strings.len() {
        return String::new();
    }
    for track in row_tracks {
        if track.starts_with('[') {
            parts.push(track);
        } else {
            parts.push(strings[index].clone());
            index += 1;
            if track != "auto" {
                parts.push(track);
            }
        }
    }
    let text = parts.join(" ");
    if columns == "none" {
        text
    } else {
        format!("{text} / {columns}")
    }
}

/// The quoted rows of a `grid-template-areas` value as `grammar::areas_text` spells them
/// (`"cells" "cells"`, no escapes), quotes included.
fn quoted_strings(text: &str) -> Vec<String> {
    text.split('"')
        .skip(1)
        .step_by(2)
        .map(|row| format!("\"{row}\""))
        .collect()
}

// Each layer reads the same index of every column.
#[allow(clippy::needless_range_loop)]
fn background(v: &Values<'_>) -> String {
    let names = [
        "background-image",
        "background-position-x",
        "background-position-y",
        "background-size",
        "background-repeat",
        "background-attachment",
        "background-origin",
        "background-clip",
    ];
    let columns = names.map(|name| layers(v.get(name)));
    // As many layers as the longest list; a shorter list leaves its value out of the later
    // layers, and an empty layer past the images is dropped.
    let count = columns.iter().map(Vec::len).max().unwrap_or(0);
    let color = v.get("background-color");
    let mut out = Vec::new();
    for index in 0..count {
        let item = |column: usize| match columns[column].get(index) {
            Some(&value) if value != INITIAL => value,
            _ => "",
        };
        let (x, y, size) = (item(1), item(2), item(3));
        // Blink writes the position's parts it has; a size needs a position, and with
        // neither part set that is `0% 0%` (` 0% 0%` when it starts the layer).
        let mut position = joined(&[x, y]);
        if !size.is_empty() {
            if position.is_empty() {
                position = if item(0).is_empty() {
                    " 0% 0%"
                } else {
                    "0% 0%"
                }
                .into();
            }
            position = format!("{position} / {size}");
        }
        let last = index + 1 == count;
        let parts = [
            item(0),
            &position,
            item(4),
            item(5),
            item(6),
            item(7),
            if last && color != INITIAL { color } else { "" },
        ];
        let layer = joined(&parts);
        if layer.is_empty() {
            if index < columns[0].len() {
                out.push("none".to_string());
            }
        } else {
            out.push(layer);
        }
    }
    out.join(", ")
}

// Each layer reads the same index of every column.
#[allow(clippy::needless_range_loop)]
fn mask(v: &Values<'_>) -> String {
    let names = [
        ("mask-image", "none"),
        ("-webkit-mask-position-x", "0%"),
        ("-webkit-mask-position-y", "0%"),
        ("mask-size", "auto"),
        ("mask-repeat", "repeat"),
        ("mask-origin", "border-box"),
        ("mask-clip", "border-box"),
        ("mask-composite", "add"),
        ("mask-mode", "match-source"),
    ];
    let columns = names.map(|(name, _)| layers(v.get(name)));
    // As many layers as the longest list; a shorter list leaves its value out of the later
    // layers.
    let count = columns.iter().map(Vec::len).max().unwrap_or(0);
    let mut out = Vec::new();
    for index in 0..count {
        let raw = |column: usize| columns[column].get(index).copied().unwrap_or(INITIAL);
        let item = |column: usize| {
            let value = raw(column);
            if value == names[column].1 || value == INITIAL {
                ""
            } else {
                value
            }
        };
        let size = item(3);
        let position_part = |column: usize| match raw(column) {
            INITIAL => "0%",
            value => value,
        };
        let (x, y) = (position_part(1), position_part(2));
        let position = mask_position_string(item(0), item(1), item(2), x, y, size);
        let box_part = |column: usize| match raw(column) {
            INITIAL => "border-box",
            value => value,
        };
        let (origin, clip) = (box_part(5), box_part(6));
        let boxes = mask_boxes_string(origin, clip);
        let layer = joined(&[item(0), &position, item(4), &boxes, item(7), item(8)]);
        out.push(if layer.is_empty() {
            "none".to_string()
        } else {
            layer
        });
    }
    out.join(", ")
}

/// Serialize a mask layer's `<bg-position> [/ <bg-size>]` section from the already
/// trimmed image/position fields and the raw `x`/`y`/`size` strings.
fn mask_position_string(image: &str, xi: &str, yi: &str, x: &str, y: &str, size: &str) -> String {
    if xi.is_empty() && yi.is_empty() && size.is_empty() {
        String::new()
    } else if xi.is_empty() && yi.is_empty() && image.is_empty() {
        // Blink's position before a size starts its layer with a space.
        format!(" {x} {y} / {size}")
    } else if size.is_empty() {
        format!("{x} {y}")
    } else {
        format!("{x} {y} / {size}")
    }
}

/// Serialize a mask layer's `<origin> <clip>` keywords, folding `border-box` / `border-box`
/// and equal pairs, with `no-clip` kept as the sole keyword.
fn mask_boxes_string(origin: &str, clip: &str) -> String {
    if origin == "border-box" && clip == "border-box" {
        String::new()
    } else if origin == clip {
        origin.to_string()
    } else if origin == "border-box" && clip == "no-clip" {
        // `no-clip` is a clip-only keyword: it reads back without the default origin.
        clip.to_string()
    } else {
        format!("{origin} {clip}")
    }
}

fn transition(v: &Values<'_>) -> String {
    let properties = layers(v.get("transition-property"));
    let durations = layers(v.get("transition-duration"));
    let timings = layers(v.get("transition-timing-function"));
    let delays = layers(v.get("transition-delay"));
    let behaviors = layers(v.get("transition-behavior"));
    // As many layers as the longest list; a shorter list leaves its value out.
    let count = [&properties, &durations, &timings, &delays, &behaviors]
        .iter()
        .map(|list| list.len())
        .max()
        .unwrap_or(0);
    let mut out = Vec::new();
    for index in 0..count {
        let property = properties.get(index).copied().unwrap_or("all");
        let duration = durations.get(index).copied().unwrap_or("0s");
        let timing = timings.get(index).copied().unwrap_or("ease");
        let delay = delays.get(index).copied().unwrap_or("0s");
        let behavior = behaviors.get(index).copied().unwrap_or("normal");
        let zero = |time: &str| time == "0s" || time == "0ms";
        let mut parts = Vec::new();
        if property != "all" {
            parts.push(property);
        }
        if !zero(duration) {
            parts.push(duration);
        }
        if timing != "ease" {
            parts.push(timing);
        }
        if !zero(delay) {
            parts.push(delay);
        }
        if behavior != "normal" {
            parts.push(behavior);
        }
        out.push(if parts.is_empty() {
            "all".to_string()
        } else {
            parts.join(" ")
        });
    }
    out.join(", ")
}

fn animation(v: &Values<'_>) -> String {
    if v.get("animation-timeline") != "auto"
        || v.get("animation-range-start") != "normal"
        || v.get("animation-range-end") != "normal"
    {
        return String::new();
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
    let columns = names.map(|name| layers(v.get(name)));
    // As many layers as the longest list; a shorter list leaves its value out.
    let count = columns.iter().map(Vec::len).max().unwrap_or(0);
    (0..count)
        .map(|index| {
            columns
                .iter()
                .filter_map(|column| column.get(index).copied())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>()
        .join(", ")
}
