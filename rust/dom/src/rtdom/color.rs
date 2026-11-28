//! Color canonicalization — pure-Rust port of `src/runtime/color.mjs`.
//!
//! Browsers serialize computed/inline `<color>` values to `rgb()`/`rgba()`, never
//! as the authored `#fff`/`white`. testing-library's `toHaveStyle` compares the
//! element's computed value against the expected value AS STRINGS, after each is run
//! through the DOM's own normalization — so both getComputedStyle (the cascade) and
//! inline style read-back must canonicalize. This module is the shared core.
//!
//! Returns `None` when the value isn't a recognized color → the caller keeps the
//! original string (honest passthrough for url()/gradients/var()/keywords).
//!
//! Two modes, matching real browsers:
//!   * `include_named = false` (inline el.style): hex + `rgb()/hsl()` canonicalize;
//!     NAMED keywords (`red`, `transparent`) stay as authored — Chrome keeps them.
//!   * `include_named = true`  (computed getComputedStyle): names resolve to `rgb()`
//!     too.

/// Properties whose value is a `<color>` (longhands + the single-token shorthands
/// we already expand). `background` is included for the bare-color MUI case
/// (`background:#fff`); a non-color background value just fails to parse →
/// passthrough.
pub const COLOR_PROPS: &[&str] = &[
    "color",
    "background-color",
    "background",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "outline-color",
    "text-decoration-color",
    "column-rule-color",
    "caret-color",
    "fill",
    "stroke",
    "stop-color",
    "flood-color",
    "lighting-color",
];

/// Whether `name` (a CSS property name) carries a `<color>` value.
#[must_use]
pub fn is_color_prop(name: &str) -> bool {
    COLOR_PROPS.contains(&name)
}

/// CSS named colors → "rrggbb" (reused through `hex_to_rgb`). `transparent` is
/// special (→ `rgba(0, 0, 0, 0)`) and handled in `canonicalize_color`. Both gate
/// behind `include_named`.
fn named_color_hex(name: &str) -> Option<&'static str> {
    Some(match name {
        "aliceblue" => "f0f8ff",
        "antiquewhite" => "faebd7",
        "aqua" | "cyan" => "00ffff",
        "aquamarine" => "7fffd4",
        "azure" => "f0ffff",
        "beige" => "f5f5dc",
        "bisque" => "ffe4c4",
        "black" => "000000",
        "blanchedalmond" => "ffebcd",
        "blue" => "0000ff",
        "blueviolet" => "8a2be2",
        "brown" => "a52a2a",
        "burlywood" => "deb887",
        "cadetblue" => "5f9ea0",
        "chartreuse" => "7fff00",
        "chocolate" => "d2691e",
        "coral" => "ff7f50",
        "cornflowerblue" => "6495ed",
        "cornsilk" => "fff8dc",
        "crimson" => "dc143c",
        "darkblue" => "00008b",
        "darkcyan" => "008b8b",
        "darkgoldenrod" => "b8860b",
        "darkgray" | "darkgrey" => "a9a9a9",
        "darkgreen" => "006400",
        "darkkhaki" => "bdb76b",
        "darkmagenta" => "8b008b",
        "darkolivegreen" => "556b2f",
        "darkorange" => "ff8c00",
        "darkorchid" => "9932cc",
        "darkred" => "8b0000",
        "darksalmon" => "e9967a",
        "darkseagreen" => "8fbc8f",
        "darkslateblue" => "483d8b",
        "darkslategray" | "darkslategrey" => "2f4f4f",
        "darkturquoise" => "00ced1",
        "darkviolet" => "9400d3",
        "deeppink" => "ff1493",
        "deepskyblue" => "00bfff",
        "dimgray" | "dimgrey" => "696969",
        "dodgerblue" => "1e90ff",
        "firebrick" => "b22222",
        "floralwhite" => "fffaf0",
        "forestgreen" => "228b22",
        "fuchsia" | "magenta" => "ff00ff",
        "gainsboro" => "dcdcdc",
        "ghostwhite" => "f8f8ff",
        "gold" => "ffd700",
        "goldenrod" => "daa520",
        "gray" | "grey" => "808080",
        "green" => "008000",
        "greenyellow" => "adff2f",
        "honeydew" => "f0fff0",
        "hotpink" => "ff69b4",
        "indianred" => "cd5c5c",
        "indigo" => "4b0082",
        "ivory" => "fffff0",
        "khaki" => "f0e68c",
        "lavender" => "e6e6fa",
        "lavenderblush" => "fff0f5",
        "lawngreen" => "7cfc00",
        "lemonchiffon" => "fffacd",
        "lightblue" => "add8e6",
        "lightcoral" => "f08080",
        "lightcyan" => "e0ffff",
        "lightgoldenrodyellow" => "fafad2",
        "lightgray" | "lightgrey" => "d3d3d3",
        "lightgreen" => "90ee90",
        "lightpink" => "ffb6c1",
        "lightsalmon" => "ffa07a",
        "lightseagreen" => "20b2aa",
        "lightskyblue" => "87cefa",
        "lightslategray" | "lightslategrey" => "778899",
        "lightsteelblue" => "b0c4de",
        "lightyellow" => "ffffe0",
        "lime" => "00ff00",
        "limegreen" => "32cd32",
        "linen" => "faf0e6",
        "maroon" => "800000",
        "mediumaquamarine" => "66cdaa",
        "mediumblue" => "0000cd",
        "mediumorchid" => "ba55d3",
        "mediumpurple" => "9370db",
        "mediumseagreen" => "3cb371",
        "mediumslateblue" => "7b68ee",
        "mediumspringgreen" => "00fa9a",
        "mediumturquoise" => "48d1cc",
        "mediumvioletred" => "c71585",
        "midnightblue" => "191970",
        "mintcream" => "f5fffa",
        "mistyrose" => "ffe4e1",
        "moccasin" => "ffe4b5",
        "navajowhite" => "ffdead",
        "navy" => "000080",
        "oldlace" => "fdf5e6",
        "olive" => "808000",
        "olivedrab" => "6b8e23",
        "orange" => "ffa500",
        "orangered" => "ff4500",
        "orchid" => "da70d6",
        "palegoldenrod" => "eee8aa",
        "palegreen" => "98fb98",
        "paleturquoise" => "afeeee",
        "palevioletred" => "db7093",
        "papayawhip" => "ffefd5",
        "peachpuff" => "ffdab9",
        "peru" => "cd853f",
        "pink" => "ffc0cb",
        "plum" => "dda0dd",
        "powderblue" => "b0e0e6",
        "purple" => "800080",
        "rebeccapurple" => "663399",
        "red" => "ff0000",
        "rosybrown" => "bc8f8f",
        "royalblue" => "4169e1",
        "saddlebrown" => "8b4513",
        "salmon" => "fa8072",
        "sandybrown" => "f4a460",
        "seagreen" => "2e8b57",
        "seashell" => "fff5ee",
        "sienna" => "a0522d",
        "silver" => "c0c0c0",
        "skyblue" => "87ceeb",
        "slateblue" => "6a5acd",
        "slategray" | "slategrey" => "708090",
        "snow" => "fffafa",
        "springgreen" => "00ff7f",
        "steelblue" => "4682b4",
        "tan" => "d2b48c",
        "teal" => "008080",
        "thistle" => "d8bfd8",
        "tomato" => "ff6347",
        "turquoise" => "40e0d0",
        "violet" => "ee82ee",
        "wheat" => "f5deb3",
        "white" => "ffffff",
        "whitesmoke" => "f5f5f5",
        "yellow" => "ffff00",
        "yellowgreen" => "9acd32",
        _ => return None,
    })
}

/// JS `clamp255 = (n) => (n < 0 ? 0 : n > 255 ? 255 : n) | 0`.
/// The `| 0` is a truncation-toward-zero to i32 of an already-clamped value.
fn clamp255(n: f64) -> i64 {
    let c = n.clamp(0.0, 255.0);
    // ToInt32 / `| 0` truncates toward zero.
    c.trunc() as i64
}

/// Format a number the way JS `String(x)` does for the small set of values the
/// alpha path produces: `Math.round(a * 1000) / 1000`. We need integers to render
/// with no decimal point ("1", "0") and fractions to drop trailing zeros
/// ("0.5", not "0.50").
fn format_alpha(a: f64) -> String {
    // a is Math.round(x*1000)/1000 — at most 3 decimal places.
    let rounded = (a * 1000.0).round() / 1000.0;
    if rounded == rounded.trunc() {
        // Integer value → no decimal point, matching JS String(0)/String(1).
        return format!("{}", rounded.trunc() as i64);
    }
    // Render with up to 3 decimals, then strip trailing zeros (and a bare trailing
    // dot, though %.3 of a non-integer never produces one) in a single pass.
    let s = format!("{rounded:.3}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

/// Serialize {r, g, b, a}. Browsers emit `rgb(r, g, b)` when fully opaque, else
/// `rgba(r, g, b, a)` with the alpha trimmed (0.5, not 0.50). `a == None` means
/// "no alpha given" (fully opaque).
fn rgb(r: f64, g: f64, b: f64, a: Option<f64>) -> String {
    let r = clamp255(r);
    let g = clamp255(g);
    let b = clamp255(b);
    match a {
        None => format!("rgb({r}, {g}, {b})"),
        Some(av) if av >= 1.0 => format!("rgb({r}, {g}, {b})"),
        Some(av) => {
            let av = if av < 0.0 { 0.0 } else { av };
            format!("rgba({}, {}, {}, {})", r, g, b, format_alpha(av))
        }
    }
}

fn is_hex(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_hexdigit())
}

fn parse_hex_byte(s: &str) -> f64 {
    i64::from_str_radix(s, 16).unwrap_or(0) as f64
}

/// `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`. Returns `None` for any other length
/// or non-hex digits (JS passthrough).
fn hex_to_rgb(v: &str) -> Option<String> {
    let h = &v[1..]; // strip leading '#'
    let c = parse_hex(h)?;
    let alpha = matches!(h.len(), 4 | 8).then_some(c.a);
    Some(rgb(c.r, c.g, c.b, alpha))
}

/// Split the inside of `xxx(...)` on `,` / whitespace / `/`, dropping empties —
/// mirrors JS `.split(/[,\s/]+/).filter(Boolean)`.
fn split_components(inner: &str) -> Vec<&str> {
    inner
        .split(|c: char| c == ',' || c == '/' || c.is_whitespace())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Extract the inner text of `name(...)`. Requires a `(` and a trailing `)`.
fn extract_inner(v: &str) -> Option<&str> {
    let open = v.find('(')?;
    if !v.ends_with(')') {
        return None;
    }
    Some(&v[open + 1..v.len() - 1])
}

/// JS `parseFloat`: leading optional sign, digits, decimal, exponent — stops at
/// the first char it can't consume; returns NaN if no number at the start.
/// Returns `None` to model NaN.
fn parse_float_js(s: &str) -> Option<f64> {
    let bytes = s.as_bytes();
    let mut i = 0;
    let len = bytes.len();
    if i < len && (bytes[i] == b'+' || bytes[i] == b'-') {
        i += 1;
    }
    let mut saw_digit = consume_digits(bytes, &mut i, false);
    if i < len && bytes[i] == b'.' {
        i += 1;
        saw_digit = consume_digits(bytes, &mut i, saw_digit);
    }
    if !saw_digit {
        return None; // NaN
    }
    try_consume_exponent(bytes, &mut i);
    s[..i].parse::<f64>().ok()
}

fn consume_digits(bytes: &[u8], i: &mut usize, mut saw: bool) -> bool {
    while *i < bytes.len() && bytes[*i].is_ascii_digit() {
        *i += 1;
        saw = true;
    }
    saw
}

fn try_consume_exponent(bytes: &[u8], i: &mut usize) {
    let len = bytes.len();
    if *i >= len || (bytes[*i] != b'e' && bytes[*i] != b'E') {
        return;
    }
    let mut j = *i + 1;
    if j < len && (bytes[j] == b'+' || bytes[j] == b'-') {
        j += 1;
    }
    let had_digit = consume_digits(bytes, &mut j, false);
    if had_digit {
        *i = j;
    }
}

/// Re-serialize `rgb()`/`rgba()` to canonical spacing. Percentage components (rare
/// in CSS-in-JS output) → `None` (passthrough) rather than guessing.
fn normalize_rgb(v: &str) -> Option<String> {
    let inner = extract_inner(v)?;
    let parts = split_components(inner);
    if parts.len() < 3 || parts.len() > 4 {
        return None;
    }
    let mut nums: Vec<f64> = Vec::with_capacity(parts.len());
    for p in &parts {
        if p.contains('%') {
            return None;
        }
        let f = parse_float_js(p)?;
        nums.push(f);
    }
    let a = nums.get(3).copied();
    Some(rgb(nums[0], nums[1], nums[2], a))
}

fn hue(p: f64, q: f64, mut t: f64) -> f64 {
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * t;
    }
    if t < 1.0 / 2.0 {
        return q;
    }
    if t < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    }
    p
}

/// HSL (hue in turns, saturation and lightness 0..=1) to RGB channels in 0..=1 (CSS Color 4
/// `hslToRgb`; a zero saturation is grey at the lightness).
fn hsl_unit(h: f64, s: f64, l: f64) -> [f64; 3] {
    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    [h + 1.0 / 3.0, h, h - 1.0 / 3.0].map(|t| hue(p, q, t))
}

fn hsl_to_rgb(v: &str) -> Option<String> {
    let inner = extract_inner(v)?;
    let parts = split_components(inner);
    if parts.len() < 3 || parts.len() > 4 {
        return None;
    }
    let mut h = parse_float_js(parts[0])?;
    // JS: parseFloat(parts[1]) / 100 — if NaN, the / 100 stays NaN, caught below.
    let s = parse_float_js(parts[1])? / 100.0;
    let l = parse_float_js(parts[2])? / 100.0;
    let a = parts.get(3).and_then(|p| parse_float_js(p));

    h = (((h % 360.0) + 360.0) % 360.0) / 360.0;
    let [r, g, b] = hsl_unit(h, s, l);
    Some(rgb(
        (r * 255.0).round(),
        (g * 255.0).round(),
        (b * 255.0).round(),
        a,
    ))
}

/// Canonicalize one color value, or `None` if unrecognized (→ caller passthrough,
/// keeping the original authored string).
///
/// `include_named = false` (inline `el.style`): hex + `rgb()/hsl()` canonicalize;
/// named keywords / `transparent` stay as authored (return `None`).
/// `include_named = true` (computed style): names + `transparent` resolve too.
#[must_use]
pub fn canonicalize_color(value: &str, include_named: bool) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    let v = value.trim();
    if v.is_empty() {
        return None;
    }
    if v.starts_with('#') {
        return hex_to_rgb(v);
    }
    let lower = v.to_ascii_lowercase();
    if lower.starts_with("rgb") {
        return normalize_rgb(v);
    }
    if lower.starts_with("hsl") {
        return hsl_to_rgb(v);
    }
    if include_named {
        if lower == "transparent" {
            return Some("rgba(0, 0, 0, 0)".to_string());
        }
        if let Some(hex) = named_color_hex(&lower) {
            return hex_to_rgb(&format!("#{hex}"));
        }
    }
    None
}

/// A parsed CSS `<color>` for a consumer that paints it: `r`/`g`/`b` channels clamped to
/// 0..=255 and `a` (alpha) to 0..=1, unrounded (the painter rounds to its pixel format).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Color {
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub a: f64,
}

impl Color {
    fn new(r: f64, g: f64, b: f64, a: f64) -> Color {
        Color {
            r: r.clamp(0.0, 255.0),
            g: g.clamp(0.0, 255.0),
            b: b.clamp(0.0, 255.0),
            a: a.clamp(0.0, 1.0),
        }
    }

    /// The colour as a canvas `fillStyle` / `strokeStyle` / `shadowColor` reads it back
    /// (HTML "serialization of a color", Chrome 156): channels and alpha quantized to 8 bits,
    /// `#rrggbb` when opaque, else `rgba(r, g, b, a)` with the alpha in the fewest of two or
    /// three decimals that maps back to the same 8-bit alpha (`0.5`, `0.12`, `0.533`, `0`).
    #[must_use]
    pub fn canvas_serialization(&self) -> String {
        let [r, g, b] = [self.r, self.g, self.b].map(|channel| channel.round() as u8);
        let alpha = (self.a * 255.0).round();
        if alpha >= 255.0 {
            return format!("#{r:02x}{g:02x}{b:02x}");
        }
        let exact = alpha / 255.0;
        let two = (exact * 100.0).round() / 100.0;
        let a = if (two * 255.0).round() == alpha {
            two
        } else {
            (exact * 1000.0).round() / 1000.0
        };
        format!("rgba({r}, {g}, {b}, {a})")
    }
}

/// Parse a CSS `<color>` into numbers, as a canvas `fillStyle` resolves it (Chrome 156;
/// turbo-dom-raster's canvas op log): `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`, every CSS
/// named colour and `transparent` (any case), `rgb()`/`rgba()` with number or percentage
/// channels and alpha, `hsl()`/`hsla()` with a number (or `deg`) hue and percentage or
/// number alpha — comma, space and slash forms. `None` for anything else. The string
/// form for style read-back is [`canonicalize_color`] (the JS runtime's `color.mjs`
/// semantics: there a percentage `rgb()` passes through).
#[must_use]
pub fn parse_color(value: &str) -> Option<Color> {
    let v = value.trim();
    let lower = v.to_ascii_lowercase();
    if let Some(hex) = v.strip_prefix('#') {
        return parse_hex(hex);
    }
    if lower.starts_with("rgb") {
        return parse_rgb(v);
    }
    if lower.starts_with("hsl") {
        return parse_hsl(v);
    }
    if lower == "transparent" {
        return Some(Color::new(0.0, 0.0, 0.0, 0.0));
    }
    parse_hex(named_color_hex(&lower)?)
}

/// The digits of a `#` colour (3, 4, 6 or 8 hex digits).
fn parse_hex(h: &str) -> Option<Color> {
    if !is_hex(h) {
        return None;
    }
    let byte = |s: &str| parse_hex_byte(s);
    let digit = |i: usize| byte(&h[i..=i].repeat(2));
    match h.len() {
        3 => Some(Color::new(digit(0), digit(1), digit(2), 1.0)),
        4 => Some(Color::new(digit(0), digit(1), digit(2), digit(3) / 255.0)),
        6 => Some(Color::new(
            byte(&h[0..2]),
            byte(&h[2..4]),
            byte(&h[4..6]),
            1.0,
        )),
        8 => Some(Color::new(
            byte(&h[0..2]),
            byte(&h[2..4]),
            byte(&h[4..6]),
            byte(&h[6..8]) / 255.0,
        )),
        _ => None,
    }
}

/// A number, or a percentage of `full`.
fn number_or_percent(s: &str, full: f64) -> Option<f64> {
    match s.strip_suffix('%') {
        Some(pct) => Some(parse_float_js(pct)? * full / 100.0),
        None => parse_float_js(s),
    }
}

/// The 3 or 4 components of `name(...)`, the fourth (alpha) defaulting to 1.
fn components(v: &str) -> Option<(Vec<&str>, f64)> {
    let parts = split_components(extract_inner(v)?);
    if !(3..=4).contains(&parts.len()) {
        return None;
    }
    let alpha = match parts.get(3) {
        Some(a) => number_or_percent(a, 1.0)?,
        None => 1.0,
    };
    Some((parts, alpha))
}

fn parse_rgb(v: &str) -> Option<Color> {
    let (parts, a) = components(v)?;
    let channel = |i: usize| number_or_percent(parts[i], 255.0);
    Some(Color::new(channel(0)?, channel(1)?, channel(2)?, a))
}

fn parse_hsl(v: &str) -> Option<Color> {
    let (parts, a) = components(v)?;
    let h = (((parse_float_js(parts[0])? % 360.0) + 360.0) % 360.0) / 360.0;
    let s = parse_float_js(parts[1])?.clamp(0.0, 100.0) / 100.0;
    let l = parse_float_js(parts[2])?.clamp(0.0, 100.0) / 100.0;
    let [r, g, b] = hsl_unit(h, s, l).map(|c| c * 255.0);
    Some(Color::new(r, g, b, a))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn canon(v: &str) -> Option<String> {
        canonicalize_color(v, true)
    }

    #[test]
    fn named_basic() {
        assert_eq!(canon("red").as_deref(), Some("rgb(255, 0, 0)"));
        assert_eq!(canon("black").as_deref(), Some("rgb(0, 0, 0)"));
        assert_eq!(canon("white").as_deref(), Some("rgb(255, 255, 255)"));
        assert_eq!(canon("rebeccapurple").as_deref(), Some("rgb(102, 51, 153)"));
        // case-insensitive
        assert_eq!(canon("RED").as_deref(), Some("rgb(255, 0, 0)"));
    }

    #[test]
    fn transparent_keyword() {
        assert_eq!(canon("transparent").as_deref(), Some("rgba(0, 0, 0, 0)"));
    }

    #[test]
    fn named_not_included() {
        // include_named = false → names stay as authored (None → passthrough).
        assert_eq!(canonicalize_color("red", false), None);
        assert_eq!(canonicalize_color("transparent", false), None);
        // but hex still canonicalizes without names
        assert_eq!(
            canonicalize_color("#fff", false).as_deref(),
            Some("rgb(255, 255, 255)")
        );
    }

    #[test]
    fn hex_three_and_six() {
        assert_eq!(canon("#fff").as_deref(), Some("rgb(255, 255, 255)"));
        assert_eq!(canon("#ffffff").as_deref(), Some("rgb(255, 255, 255)"));
        assert_eq!(canon("#000").as_deref(), Some("rgb(0, 0, 0)"));
        assert_eq!(canon("#ff0000").as_deref(), Some("rgb(255, 0, 0)"));
        // #abc → aa bb cc = 170, 187, 204
        assert_eq!(canon("#abc").as_deref(), Some("rgb(170, 187, 204)"));
    }

    #[test]
    fn hex_four_and_eight_alpha() {
        // #ffff → r=g=b=255, a=ff/255 = 1 → rgb (no alpha)
        assert_eq!(canon("#ffff").as_deref(), Some("rgb(255, 255, 255)"));
        assert_eq!(canon("#ffffffff").as_deref(), Some("rgb(255, 255, 255)"));
        // #00000080 → a = 128/255 = 0.50196... → round(*1000)/1000 = 0.502
        assert_eq!(canon("#00000080").as_deref(), Some("rgba(0, 0, 0, 0.502)"));
        // #0000 → all zero, a=0 → rgba(0,0,0,0)
        assert_eq!(canon("#0000").as_deref(), Some("rgba(0, 0, 0, 0)"));
        // half-alpha shorthand: #f008 → r=255 a=88/255=0.533...→0.533
        assert_eq!(
            canon("#ff000088").as_deref(),
            Some("rgba(255, 0, 0, 0.533)")
        );
    }

    #[test]
    fn hex_invalid() {
        assert_eq!(canon("#xyz"), None);
        assert_eq!(canon("#12345"), None); // length 5 → None
        assert_eq!(canon("#"), None);
    }

    #[test]
    fn rgb_passthrough_and_canon() {
        assert_eq!(canon("rgb(255,0,0)").as_deref(), Some("rgb(255, 0, 0)"));
        assert_eq!(canon("rgb(255, 0, 0)").as_deref(), Some("rgb(255, 0, 0)"));
        // extra whitespace + space-separated
        assert_eq!(
            canon("rgb(  10   20   30 )").as_deref(),
            Some("rgb(10, 20, 30)")
        );
        // clamp over 255
        assert_eq!(
            canon("rgb(300, -5, 128)").as_deref(),
            Some("rgb(255, 0, 128)")
        );
        // float truncation via |0: 12.9 → 12
        assert_eq!(canon("rgb(12.9, 0, 0)").as_deref(), Some("rgb(12, 0, 0)"));
    }

    #[test]
    fn rgba_alpha() {
        assert_eq!(
            canon("rgba(0,0,0,0.5)").as_deref(),
            Some("rgba(0, 0, 0, 0.5)")
        );
        // alpha >= 1 → rgb()
        assert_eq!(canon("rgba(1,2,3,1)").as_deref(), Some("rgb(1, 2, 3)"));
        // alpha trimmed: 0.50 → 0.5
        assert_eq!(
            canon("rgba(10, 20, 30, 0.50)").as_deref(),
            Some("rgba(10, 20, 30, 0.5)")
        );
        // slash syntax: rgb(1 2 3 / 0.25)
        assert_eq!(
            canon("rgb(1 2 3 / 0.25)").as_deref(),
            Some("rgba(1, 2, 3, 0.25)")
        );
        // negative alpha clamps to 0
        assert_eq!(
            canon("rgba(1,2,3,-0.5)").as_deref(),
            Some("rgba(1, 2, 3, 0)")
        );
    }

    #[test]
    fn rgb_percent_passthrough() {
        // percentages → None (passthrough)
        assert_eq!(canon("rgb(50%, 0, 0)"), None);
    }

    #[test]
    fn rgb_arity() {
        assert_eq!(canon("rgb(1,2)"), None);
        assert_eq!(canon("rgb(1,2,3,4,5)"), None);
    }

    #[test]
    fn parse_edges_and_hsl_hue_segments() {
        // exponent inside rgb() — plain and signed (hits the exponent-sign branch)
        assert_eq!(
            canonicalize_color("rgb(1e1, 2, 3)", false).as_deref(),
            Some("rgb(10, 2, 3)")
        );
        assert_eq!(
            canonicalize_color("rgb(2e+1, 0, 0)", false).as_deref(),
            Some("rgb(20, 0, 0)")
        );
        // fractional alpha exercises the decimal trim path (rgba → 0.5)
        assert_eq!(
            canonicalize_color("rgba(0,0,0,0.5)", false).as_deref(),
            Some("rgba(0, 0, 0, 0.5)")
        );
        // missing closing paren → None (passthrough)
        assert_eq!(canonicalize_color("rgb(1 2 3", false), None);
        // non-numeric component → None
        assert_eq!(canonicalize_color("rgb(x, 2, 3)", false), None);
        // hsl arity too few / NaN saturation / NaN lightness → None
        assert_eq!(canonicalize_color("hsl(120, 50%)", false), None);
        assert_eq!(canonicalize_color("hsl(120, x%, 50%)", false), None);
        assert_eq!(canonicalize_color("hsl(120, 50%, y%)", false), None);
        // hsl across every hue segment + l<0.5 and l>=0.5 + t>1 wrap (hue 330)
        for hsl in [
            "hsl(0, 100%, 50%)",
            "hsl(60, 100%, 50%)",
            "hsl(120, 100%, 25%)",
            "hsl(180, 100%, 50%)",
            "hsl(240, 100%, 60%)",
            "hsl(300, 100%, 50%)",
            "hsl(330, 100%, 50%)",
            "hsl(120, 0%, 50%)", // s==0 grey path
        ] {
            assert!(canonicalize_color(hsl, false).is_some(), "{hsl}");
        }
    }

    #[test]
    fn hsl_conversion() {
        // hsl(0, 100%, 50%) → pure red
        assert_eq!(
            canon("hsl(0, 100%, 50%)").as_deref(),
            Some("rgb(255, 0, 0)")
        );
        // hsl(120, 100%, 50%) → pure green
        assert_eq!(
            canon("hsl(120, 100%, 50%)").as_deref(),
            Some("rgb(0, 255, 0)")
        );
        // hsl(240, 100%, 50%) → pure blue
        assert_eq!(
            canon("hsl(240, 100%, 50%)").as_deref(),
            Some("rgb(0, 0, 255)")
        );
        // saturation 0 → gray: hsl(0,0%,50%) → l=0.5 → round(127.5)=128
        assert_eq!(
            canon("hsl(0, 0%, 50%)").as_deref(),
            Some("rgb(128, 128, 128)")
        );
        // black / white via lightness
        assert_eq!(canon("hsl(0,0%,0%)").as_deref(), Some("rgb(0, 0, 0)"));
        assert_eq!(
            canon("hsl(0,0%,100%)").as_deref(),
            Some("rgb(255, 255, 255)")
        );
    }

    #[test]
    fn hsla_alpha() {
        assert_eq!(
            canon("hsla(0, 100%, 50%, 0.5)").as_deref(),
            Some("rgba(255, 0, 0, 0.5)")
        );
        // hue wraps: hsl(360,...) == hsl(0,...)
        assert_eq!(
            canon("hsl(360, 100%, 50%)").as_deref(),
            Some("rgb(255, 0, 0)")
        );
    }

    #[test]
    fn unrecognized_passthrough() {
        assert_eq!(canon(""), None);
        assert_eq!(canon("   "), None);
        assert_eq!(canon("url(foo.png)"), None);
        assert_eq!(canon("var(--x)"), None);
        assert_eq!(canon("not-a-color"), None);
    }

    #[test]
    fn color_props() {
        assert!(is_color_prop("color"));
        assert!(is_color_prop("background-color"));
        assert!(is_color_prop("fill"));
        assert!(!is_color_prop("width"));
        assert!(!is_color_prop("margin"));
        assert_eq!(COLOR_PROPS.len(), 17);
    }
}

#[cfg(test)]
mod parse_color_tests {
    use super::{parse_color, Color};

    fn c(r: f64, g: f64, b: f64, a: f64) -> Color {
        Color { r, g, b, a }
    }

    #[test]
    fn hex_forms() {
        assert_eq!(parse_color("#f0a"), Some(c(255.0, 0.0, 170.0, 1.0)));
        assert_eq!(
            parse_color("#f0a8"),
            Some(c(255.0, 0.0, 170.0, 136.0 / 255.0))
        );
        assert_eq!(parse_color(" #0A0b0C "), Some(c(10.0, 11.0, 12.0, 1.0)));
        assert_eq!(
            parse_color("#0a0b0c80"),
            Some(c(10.0, 11.0, 12.0, 128.0 / 255.0))
        );
        for bad in [
            "#",
            "#12",
            "#12345",
            "#1234567",
            "#123456789",
            "#ggg",
            "#12345g",
        ] {
            assert_eq!(parse_color(bad), None, "{bad}");
        }
    }

    #[test]
    fn rgb_numbers_percentages_and_alpha() {
        assert_eq!(parse_color("rgb(1, 2, 3)"), Some(c(1.0, 2.0, 3.0, 1.0)));
        assert_eq!(
            parse_color("RGBA(12.9, 100.5, 0, 0.25)"),
            Some(c(12.9, 100.5, 0.0, 0.25))
        );
        assert_eq!(
            parse_color("rgb(50%, 0%, 100%)"),
            Some(c(127.5, 0.0, 255.0, 1.0))
        );
        assert_eq!(
            parse_color("rgb(10 20 30 / 40%)"),
            Some(c(10.0, 20.0, 30.0, 0.4))
        );
        // Channels clamp to 0..=255, alpha to 0..=1.
        assert_eq!(
            parse_color("rgb(300, -5, 255.5, 2)"),
            Some(c(255.0, 0.0, 255.0, 1.0))
        );
        assert_eq!(
            parse_color("rgba(0, 0, 0, -1)"),
            Some(c(0.0, 0.0, 0.0, 0.0))
        );
        assert_eq!(
            parse_color("rgb(150%, -10%, 0)"),
            Some(c(255.0, 0.0, 0.0, 1.0))
        );
        for bad in [
            "rgb(1, 2)",
            "rgb(1, 2, 3, 4, 5)",
            "rgb(x, 2, 3)",
            "rgb(1, 2, 3, y)",
            "rgb(1 2 3",
            "rgb(%, 0, 0)",
        ] {
            assert_eq!(parse_color(bad), None, "{bad}");
        }
    }

    #[test]
    fn hsl_hues_saturations_lightnesses() {
        let rgb = |s: &str| parse_color(s).map(|c| [c.r.round(), c.g.round(), c.b.round(), c.a]);
        assert_eq!(rgb("hsl(0, 100%, 50%)"), Some([255.0, 0.0, 0.0, 1.0]));
        assert_eq!(rgb("hsl(120deg 100% 25%)"), Some([0.0, 128.0, 0.0, 1.0]));
        assert_eq!(
            rgb("HSLA(240, 100%, 50%, 0.5)"),
            Some([0.0, 0.0, 255.0, 0.5])
        );
        assert_eq!(
            rgb("hsl(60 100% 50% / 25%)"),
            Some([255.0, 255.0, 0.0, 0.25])
        );
        // Hues wrap both ways; zero saturation is grey; s and l clamp to 0..=100%.
        assert_eq!(rgb("hsl(-120, 100%, 50%)"), Some([0.0, 0.0, 255.0, 1.0]));
        assert_eq!(rgb("hsl(480, 100%, 50%)"), Some([0.0, 255.0, 0.0, 1.0]));
        assert_eq!(rgb("hsl(0, 0%, 75%)"), Some([191.0, 191.0, 191.0, 1.0]));
        assert_eq!(rgb("hsl(200, 60%, 70%)"), Some([133.0, 194.0, 224.0, 1.0]));
        assert_eq!(rgb("hsl(0, 150%, 120%)"), Some([255.0, 255.0, 255.0, 1.0]));
        assert_eq!(rgb("hsl(0, -50%, 50%)"), Some([128.0, 128.0, 128.0, 1.0]));
        for bad in [
            "hsl(0, 100%)",
            "hsl(x, 1%, 1%)",
            "hsl(0, x, 1%)",
            "hsl(0, 1%, x)",
            "hsl(0 1% 1% / z)",
        ] {
            assert_eq!(parse_color(bad), None, "{bad}");
        }
    }

    #[test]
    fn canvas_serialization_like_chrome() {
        let read = |v: &str| parse_color(v).unwrap().canvas_serialization();
        assert_eq!(read("#AbC"), "#aabbcc");
        assert_eq!(read("rgba(1, 2, 3, 1)"), "#010203");
        assert_eq!(read("rgb(12.9, 100.5, 200.4)"), "#0d65c8");
        assert_eq!(read("rgb(300, -5, 128)"), "#ff0080");
        assert_eq!(read("rgb(50%, 0%, 100%)"), "#8000ff");
        assert_eq!(read("hsl(200, 60%, 70%)"), "#85c2e0");
        assert_eq!(read("rgba(0,0,255,2)"), "#0000ff");
        assert_eq!(read("#0f08"), "rgba(0, 255, 0, 0.533)");
        assert_eq!(read("#0000ff80"), "rgba(0, 0, 255, 0.5)");
        assert_eq!(read("rgba(0, 0, 0, 0.123456)"), "rgba(0, 0, 0, 0.12)");
        assert_eq!(read("rgba(0, 0, 0, 0.001)"), "rgba(0, 0, 0, 0)");
        assert_eq!(read("rgb(10% 20% 30% / 50%)"), "rgba(26, 51, 77, 0.5)");
        assert_eq!(read("transparent"), "rgba(0, 0, 0, 0)");
        // 254/255 = 0.99607…: two decimals (1) would read back as 255, so three.
        assert_eq!(
            c(0.0, 0.0, 0.0, 254.0 / 255.0).canvas_serialization(),
            "rgba(0, 0, 0, 0.996)"
        );
        // 0.4 * 255 = 102 exactly: two decimals suffice.
        assert_eq!(
            c(0.0, 0.0, 0.0, 0.4).canvas_serialization(),
            "rgba(0, 0, 0, 0.4)"
        );
        // An alpha just under the opaque rounding boundary stays opaque.
        assert_eq!(
            c(1.0, 2.0, 3.0, 254.6 / 255.0).canvas_serialization(),
            "#010203"
        );
    }

    #[test]
    fn names_and_transparent() {
        assert_eq!(
            parse_color("rebeccapurple"),
            Some(c(102.0, 51.0, 153.0, 1.0))
        );
        assert_eq!(
            parse_color(" CornflowerBlue "),
            Some(c(100.0, 149.0, 237.0, 1.0))
        );
        assert_eq!(parse_color("TRANSPARENT"), Some(c(0.0, 0.0, 0.0, 0.0)));
        assert_eq!(parse_color("notacolour"), None);
        assert_eq!(parse_color(""), None);
    }
}
