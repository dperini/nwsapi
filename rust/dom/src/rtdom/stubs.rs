//! Pure-Rust ports of the standalone, host-free stub surfaces from
//! `src/runtime/stubs.mjs`. These are window-level helpers — they do NOT touch
//! the COW Tree. No wasm / napi, no external crates: plain `std` value types.
//!
//! Ported:
//!   * `Storage` — Web Storage model (localStorage/sessionStorage).
//!   * `eval_media_query` + `Viewport` — matchMedia feature evaluation.
//!   * observer entry value structs (`ResizeObserverEntry`,
//!     `IntersectionObserverEntry`) + `*_entry(target)` "fire-once" helpers.
//!
//! Skipped (inherently JS-host / DOM-bound, no clean pure-Rust value API):
//!   * `FileReader` — async `Promise`/event-driven Blob reading.
//!   * `makeCanvasStub` — a JS `Proxy` no-op 2D context.
//!   * `makeCustomElements` (now `custom-elements.mjs`) — registry returning JS constructors +
//!     Promises (the name map is `rtdom::custom_elements`).
//!   * `MutationObserver` — queue keyed to live DOM mutations.
//!   * `makeLocation` / `makeHistory` — `URL`-backed navigation models.
//!
//! The observer *callbacks* are async/JS in the source; here only the single
//! initial entry value is modeled (the "fire once with one entry" contract).

use std::collections::HashMap;

/// Web Storage (`localStorage` / `sessionStorage`) model. Insertion-ordered:
/// `key(i)` returns the i-th key by insertion order. `set_item` overwrites in
/// place (does NOT change a pre-existing key's position), matching the spec /
/// the JS `Map`-backed `Storage`.
#[derive(Debug, Default, Clone)]
pub struct Storage {
    order: Vec<String>,
    map: HashMap<String, String>,
}

impl Storage {
    #[must_use]
    pub fn new() -> Self {
        Storage {
            order: Vec::new(),
            map: HashMap::new(),
        }
    }

    #[must_use]
    pub fn get_item(&self, k: &str) -> Option<String> {
        self.map.get(k).cloned()
    }

    pub fn set_item(&mut self, k: &str, v: &str) {
        if !self.map.contains_key(k) {
            self.order.push(k.to_string());
        }
        self.map.insert(k.to_string(), v.to_string());
    }

    pub fn remove_item(&mut self, k: &str) {
        if self.map.remove(k).is_some() {
            if let Some(pos) = self.order.iter().position(|x| x == k) {
                self.order.remove(pos);
            }
        }
    }

    pub fn clear(&mut self) {
        self.order.clear();
        self.map.clear();
    }

    #[must_use]
    pub fn length(&self) -> usize {
        self.order.len()
    }

    /// The i-th key by insertion order (`None` if out of range), mirroring
    /// `Storage.key(i)`.
    #[must_use]
    pub fn key(&self, i: usize) -> Option<String> {
        self.order.get(i).cloned()
    }
}

/// Window viewport for media-query evaluation. Defaults mirror the JS stub's
/// fallback (1024×768).
#[derive(Debug, Clone, Copy)]
pub struct Viewport {
    pub width: f64,
    pub height: f64,
}

impl Default for Viewport {
    fn default() -> Self {
        Viewport {
            width: 1024.0,
            height: 768.0,
        }
    }
}

/// Evaluate a media query string against a viewport, mirroring
/// `evalMediaQuery` / `MQ_FEATURE` in `stubs.mjs`. Recognized features:
/// `min-width`, `max-width`, `min-height`, `max-height`, `orientation`
/// (portrait|landscape). Multiple features AND together. A query with no
/// recognized feature (e.g. `"screen"`) returns `false` — matching the JS,
/// which returns `any && matched` (and `any` is false for feature-less queries).
fn matches_feature(feat: &str, val: &str, w: f64, h: f64) -> bool {
    match feat {
        "min-width" => parse_px(val).is_some_and(|n| w >= n),
        "max-width" => parse_px(val).is_some_and(|n| w <= n),
        "min-height" => parse_px(val).is_some_and(|n| h >= n),
        "max-height" => parse_px(val).is_some_and(|n| h <= n),
        "orientation" => {
            let want = if w > h { "landscape" } else { "portrait" };
            val == want
        }
        _ => false,
    }
}

#[must_use]
pub fn eval_media_query(query: &str, vp: &Viewport) -> bool {
    let w = vp.width;
    let h = vp.height;
    let q = query.to_lowercase();
    let mut matched = true;
    let mut any = false;

    for (feat, val) in scan_features(&q) {
        any = true;
        if !matches_feature(&feat, &val, w, h) {
            matched = false;
        }
    }

    any && matched
}

/// Hand-scan `(feature: value)` groups out of a lowercased query string, only
/// emitting the recognized feature names. Replaces the JS regex (no regex
/// crate). Whitespace around the feature name and value is trimmed.
fn scan_features(q: &str) -> Vec<(String, String)> {
    let bytes = q.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'(' {
            // Find the matching ')'.
            if let Some(rel) = q[i + 1..].find(')') {
                let inner = &q[i + 1..i + 1 + rel];
                if let Some(colon) = inner.find(':') {
                    let feat = inner[..colon].trim();
                    let val = inner[colon + 1..].trim();
                    // Emit ALL `(feature: value)` pairs; `eval_media_query` decides
                    // which are recognized (an unknown feature fails the query).
                    out.push((feat.to_string(), val.to_string()));
                }
                i = i + 1 + rel + 1;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// Parse a `<number>px` (or bare number) length into an `f64`, mirroring the
/// JS `parseFloat` leniency: leading numeric prefix is taken, trailing units
/// (`px`) or junk ignored.
fn parse_px(val: &str) -> Option<f64> {
    let s = val.trim();
    let mut end = 0;
    let bytes = s.as_bytes();
    let mut seen_dot = false;
    while end < bytes.len() {
        let c = bytes[end];
        if c.is_ascii_digit() {
            end += 1;
        } else if c == b'.' && !seen_dot {
            seen_dot = true;
            end += 1;
        } else if (c == b'-' || c == b'+') && end == 0 {
            end += 1;
        } else {
            break;
        }
    }
    if end == 0 {
        return None;
    }
    s[..end].parse::<f64>().ok()
}

/// A box rect, mirroring the shape `rectOf(el)` produces in `stubs.mjs`. The
/// pure-Rust runtime has no `getBoundingClientRect` callback here, so callers
/// supply the synthetic `width`/`height`; positions stay 0 (matching the JS).
#[derive(Debug, Clone, Copy, Default)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub top: f64,
    pub left: f64,
    pub right: f64,
    pub bottom: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    /// Build a rect from a synthetic size, mirroring `rectOf`: positions 0,
    /// right/bottom = width/height.
    #[must_use]
    pub fn from_size(width: f64, height: f64) -> Self {
        Rect {
            x: 0.0,
            y: 0.0,
            top: 0.0,
            left: 0.0,
            right: width,
            bottom: height,
            width,
            height,
        }
    }
}

/// A single `ResizeObserver` entry (the "fire once with one entry" payload).
/// `target` is the caller's opaque handle id — the pure-Rust runtime has no JS
/// element reference, so the consumer threads through its own node handle.
#[derive(Debug, Clone)]
pub struct ResizeObserverEntry<T> {
    pub target: T,
    pub content_rect: Rect,
    pub inline_size: f64,
    pub block_size: f64,
}

/// The single initial entry a `ResizeObserver` fires for `target`, given its
/// synthetic size. Mirrors `ResizeObserver.observe` building one entry.
pub fn resize_observer_entry<T>(target: T, width: f64, height: f64) -> ResizeObserverEntry<T> {
    ResizeObserverEntry {
        target,
        content_rect: Rect::from_size(width, height),
        inline_size: width,
        block_size: height,
    }
}

/// A single `IntersectionObserver` entry. The JS stub always reports the element
/// as fully intersecting (`isIntersecting: true`, `intersectionRatio: 1`).
#[derive(Debug, Clone)]
pub struct IntersectionObserverEntry<T> {
    pub target: T,
    pub is_intersecting: bool,
    pub intersection_ratio: f64,
    pub bounding_client_rect: Rect,
    pub intersection_rect: Rect,
    pub time: f64,
}

/// The single initial entry an `IntersectionObserver` fires for `target`, given
/// its synthetic size. Mirrors `IntersectionObserver.observe`.
pub fn intersection_observer_entry<T>(
    target: T,
    width: f64,
    height: f64,
) -> IntersectionObserverEntry<T> {
    let r = Rect::from_size(width, height);
    IntersectionObserverEntry {
        target,
        is_intersecting: true,
        intersection_ratio: 1.0,
        bounding_client_rect: r,
        intersection_rect: r,
        time: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn storage_set_get_overwrite() {
        let mut s = Storage::new();
        assert_eq!(s.get_item("a"), None);
        s.set_item("a", "1");
        assert_eq!(s.get_item("a"), Some("1".to_string()));
        s.set_item("a", "2");
        assert_eq!(s.get_item("a"), Some("2".to_string()));
        // Overwrite does not grow length.
        assert_eq!(s.length(), 1);
    }

    #[test]
    fn storage_remove_and_length() {
        let mut s = Storage::new();
        s.set_item("a", "1");
        s.set_item("b", "2");
        assert_eq!(s.length(), 2);
        s.remove_item("a");
        assert_eq!(s.length(), 1);
        assert_eq!(s.get_item("a"), None);
        assert_eq!(s.get_item("b"), Some("2".to_string()));
        // Removing a missing key is a no-op.
        s.remove_item("missing");
        assert_eq!(s.length(), 1);
        s.clear();
        assert_eq!(s.length(), 0);
        assert_eq!(s.get_item("b"), None);
    }

    #[test]
    fn storage_key_insertion_order() {
        let mut s = Storage::new();
        s.set_item("first", "1");
        s.set_item("second", "2");
        s.set_item("third", "3");
        assert_eq!(s.key(0), Some("first".to_string()));
        assert_eq!(s.key(1), Some("second".to_string()));
        assert_eq!(s.key(2), Some("third".to_string()));
        assert_eq!(s.key(3), None);
        // Overwrite keeps original position.
        s.set_item("first", "x");
        assert_eq!(s.key(0), Some("first".to_string()));
        // Remove shifts the index.
        s.remove_item("first");
        assert_eq!(s.key(0), Some("second".to_string()));
    }

    #[test]
    fn mq_min_width() {
        let q = "(min-width: 600px)";
        assert!(eval_media_query(
            q,
            &Viewport {
                width: 800.0,
                height: 600.0
            }
        ));
        assert!(!eval_media_query(
            q,
            &Viewport {
                width: 500.0,
                height: 600.0
            }
        ));
    }

    #[test]
    fn mq_max_width() {
        let q = "(max-width: 600px)";
        assert!(eval_media_query(
            q,
            &Viewport {
                width: 500.0,
                height: 600.0
            }
        ));
        assert!(!eval_media_query(
            q,
            &Viewport {
                width: 800.0,
                height: 600.0
            }
        ));
    }

    #[test]
    fn mq_orientation() {
        let portrait = "(orientation: portrait)";
        let landscape = "(orientation: landscape)";
        let tall = Viewport {
            width: 400.0,
            height: 800.0,
        };
        let wide = Viewport {
            width: 800.0,
            height: 400.0,
        };
        assert!(eval_media_query(portrait, &tall));
        assert!(!eval_media_query(portrait, &wide));
        assert!(eval_media_query(landscape, &wide));
        assert!(!eval_media_query(landscape, &tall));
        // Square => portrait: Media Queries 4 / Chrome 156 say `landscape` only when width is
        // greater than height (turbo-dom#138; the npm stubs.mjs matches).
        let square = Viewport {
            width: 500.0,
            height: 500.0,
        };
        assert!(eval_media_query(portrait, &square));
        assert!(!eval_media_query(landscape, &square));
    }

    #[test]
    fn mq_multi_feature_and() {
        let q = "(min-width: 600px) and (max-width: 900px)";
        assert!(eval_media_query(
            q,
            &Viewport {
                width: 800.0,
                height: 600.0
            }
        ));
        assert!(!eval_media_query(
            q,
            &Viewport {
                width: 500.0,
                height: 600.0
            }
        ));
        assert!(!eval_media_query(
            q,
            &Viewport {
                width: 1000.0,
                height: 600.0
            }
        ));
        let q2 = "(min-width: 600px) and (orientation: landscape)";
        assert!(eval_media_query(
            q2,
            &Viewport {
                width: 800.0,
                height: 400.0
            }
        ));
        assert!(!eval_media_query(
            q2,
            &Viewport {
                width: 800.0,
                height: 900.0
            }
        ));
    }

    #[test]
    fn mq_feature_less_matches_js_default() {
        // No recognized feature => false (JS returns `any && matched`).
        assert!(!eval_media_query("screen", &Viewport::default()));
        assert!(!eval_media_query("", &Viewport::default()));
        assert!(!eval_media_query(
            "(unknown-feature: 1)",
            &Viewport::default()
        ));
    }

    #[test]
    fn mq_height_orientation_pxedges_and_unknown() {
        let landscape = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let portrait = Viewport {
            width: 400.0,
            height: 900.0,
        };
        // height features
        assert!(eval_media_query("(min-height: 500px)", &landscape));
        assert!(!eval_media_query("(min-height: 700px)", &landscape));
        assert!(eval_media_query("(max-height: 700px)", &landscape));
        // orientation both ways
        assert!(eval_media_query("(orientation: landscape)", &landscape));
        assert!(eval_media_query("(orientation: portrait)", &portrait));
        assert!(!eval_media_query("(orientation: portrait)", &landscape));
        // parse_px edges: decimal, signed, and non-numeric (→ feature fails)
        assert!(eval_media_query("(min-width: 1.5px)", &landscape)); // decimal path
        assert!(eval_media_query("(min-width: -5px)", &landscape)); // leading-sign path
        assert!(!eval_media_query("(min-width: abc)", &landscape)); // no digits → None → false
                                                                    // unknown feature fails the query (the `_` arm)
        assert!(!eval_media_query(
            "(min-width: 1px) and (foo: bar)",
            &landscape
        ));
    }

    #[test]
    fn observer_entries_fire_once_with_size() {
        let r = resize_observer_entry(42usize, 100.0, 50.0);
        assert_eq!(r.target, 42);
        assert_eq!(r.content_rect.width, 100.0);
        assert_eq!(r.content_rect.right, 100.0);
        assert_eq!(r.content_rect.bottom, 50.0);
        assert_eq!(r.content_rect.left, 0.0);
        assert_eq!(r.inline_size, 100.0);

        let i = intersection_observer_entry(7usize, 100.0, 50.0);
        assert!(i.is_intersecting);
        assert_eq!(i.intersection_ratio, 1.0);
        assert_eq!(i.bounding_client_rect.width, 100.0);
    }
}
