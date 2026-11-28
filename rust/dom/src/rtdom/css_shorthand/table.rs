//! Chrome 156's `CSSStyleDeclaration` shorthands (each property set to `initial` lists the
//! longhands it sets, recorded in `tests/fixtures/css_shorthand_chrome156.json`), the alias
//! shorthands that serialize as their canonical name, and which shorthands Blink lets hold
//! `initial` longhands (the ones whose parser leaves omitted longhands at `initial`).
use std::sync::OnceLock;

pub struct Entry {
    pub name: &'static str,
    pub canonical: &'static str,
    /// The grammar / serializer key (an alias with its own parser keeps its name).
    pub grammar: &'static str,
    pub allow_initial: bool,
    pub longhands: &'static [&'static str],
}

/// Every shorthand, sorted by name.
pub const SHORTHANDS: &[Entry] = &[
    Entry {
        name: "-webkit-animation",
        canonical: "animation",
        grammar: "animation",
        allow_initial: false,
        longhands: &[
            "animation-duration",
            "animation-timing-function",
            "animation-delay",
            "animation-iteration-count",
            "animation-direction",
            "animation-fill-mode",
            "animation-play-state",
            "animation-name",
            "animation-timeline",
            "animation-range-start",
            "animation-range-end",
        ],
    },
    Entry {
        name: "-webkit-border-after",
        canonical: "border-block-end",
        grammar: "border-block-end",
        allow_initial: true,
        longhands: &[
            "border-block-end-width",
            "border-block-end-style",
            "border-block-end-color",
        ],
    },
    Entry {
        name: "-webkit-border-before",
        canonical: "border-block-start",
        grammar: "border-block-start",
        allow_initial: true,
        longhands: &[
            "border-block-start-width",
            "border-block-start-style",
            "border-block-start-color",
        ],
    },
    Entry {
        name: "-webkit-border-end",
        canonical: "border-inline-end",
        grammar: "border-inline-end",
        allow_initial: true,
        longhands: &[
            "border-inline-end-width",
            "border-inline-end-style",
            "border-inline-end-color",
        ],
    },
    Entry {
        name: "-webkit-border-radius",
        canonical: "border-radius",
        grammar: "-webkit-border-radius",
        allow_initial: false,
        longhands: &[
            "border-top-left-radius",
            "border-top-right-radius",
            "border-bottom-right-radius",
            "border-bottom-left-radius",
        ],
    },
    Entry {
        name: "-webkit-border-start",
        canonical: "border-inline-start",
        grammar: "border-inline-start",
        allow_initial: true,
        longhands: &[
            "border-inline-start-width",
            "border-inline-start-style",
            "border-inline-start-color",
        ],
    },
    Entry {
        name: "-webkit-column-rule",
        canonical: "column-rule",
        grammar: "column-rule",
        allow_initial: false,
        longhands: &[
            "column-rule-width",
            "column-rule-style",
            "column-rule-color",
        ],
    },
    Entry {
        name: "-webkit-columns",
        canonical: "columns",
        grammar: "columns",
        allow_initial: false,
        longhands: &[
            "column-width",
            "column-count",
            "column-height",
            "column-wrap",
        ],
    },
    Entry {
        name: "-webkit-flex",
        canonical: "flex",
        grammar: "flex",
        allow_initial: false,
        longhands: &["flex-grow", "flex-shrink", "flex-basis"],
    },
    Entry {
        name: "-webkit-flex-flow",
        canonical: "flex-flow",
        grammar: "flex-flow",
        allow_initial: false,
        longhands: &["flex-direction", "flex-wrap"],
    },
    Entry {
        name: "-webkit-mask",
        canonical: "mask",
        grammar: "mask",
        allow_initial: false,
        longhands: &[
            "mask-image",
            "-webkit-mask-position-x",
            "-webkit-mask-position-y",
            "mask-size",
            "mask-repeat",
            "mask-origin",
            "mask-clip",
            "mask-composite",
            "mask-mode",
        ],
    },
    Entry {
        name: "-webkit-mask-box-image",
        canonical: "-webkit-mask-box-image",
        grammar: "-webkit-mask-box-image",
        allow_initial: true,
        longhands: &[
            "-webkit-mask-box-image-source",
            "-webkit-mask-box-image-slice",
            "-webkit-mask-box-image-width",
            "-webkit-mask-box-image-outset",
            "-webkit-mask-box-image-repeat",
        ],
    },
    Entry {
        name: "-webkit-mask-position",
        canonical: "mask-position",
        grammar: "-webkit-mask-position",
        allow_initial: false,
        longhands: &["-webkit-mask-position-x", "-webkit-mask-position-y"],
    },
    Entry {
        name: "-webkit-text-emphasis",
        canonical: "text-emphasis",
        grammar: "text-emphasis",
        allow_initial: true,
        longhands: &["text-emphasis-style", "text-emphasis-color"],
    },
    Entry {
        name: "-webkit-text-stroke",
        canonical: "-webkit-text-stroke",
        grammar: "-webkit-text-stroke",
        allow_initial: true,
        longhands: &["-webkit-text-stroke-width", "-webkit-text-stroke-color"],
    },
    Entry {
        name: "-webkit-transition",
        canonical: "transition",
        grammar: "transition",
        allow_initial: false,
        longhands: &[
            "transition-property",
            "transition-duration",
            "transition-timing-function",
            "transition-delay",
            "transition-behavior",
        ],
    },
    Entry {
        name: "animation",
        canonical: "animation",
        grammar: "animation",
        allow_initial: false,
        longhands: &[
            "animation-duration",
            "animation-timing-function",
            "animation-delay",
            "animation-iteration-count",
            "animation-direction",
            "animation-fill-mode",
            "animation-play-state",
            "animation-name",
            "animation-timeline",
            "animation-range-start",
            "animation-range-end",
        ],
    },
    Entry {
        name: "animation-range",
        canonical: "animation-range",
        grammar: "animation-range",
        allow_initial: false,
        longhands: &["animation-range-start", "animation-range-end"],
    },
    Entry {
        name: "background",
        canonical: "background",
        grammar: "background",
        allow_initial: true,
        longhands: &[
            "background-image",
            "background-position-x",
            "background-position-y",
            "background-size",
            "background-repeat",
            "background-attachment",
            "background-origin",
            "background-clip",
            "background-color",
        ],
    },
    Entry {
        name: "background-position",
        canonical: "background-position",
        grammar: "background-position",
        allow_initial: false,
        longhands: &["background-position-x", "background-position-y"],
    },
    Entry {
        name: "border",
        canonical: "border",
        grammar: "border",
        allow_initial: false,
        longhands: &[
            "border-top-color",
            "border-top-style",
            "border-top-width",
            "border-right-color",
            "border-right-style",
            "border-right-width",
            "border-bottom-color",
            "border-bottom-style",
            "border-bottom-width",
            "border-left-color",
            "border-left-style",
            "border-left-width",
            "border-image-source",
            "border-image-slice",
            "border-image-width",
            "border-image-outset",
            "border-image-repeat",
        ],
    },
    Entry {
        name: "border-block",
        canonical: "border-block",
        grammar: "border-block",
        allow_initial: false,
        longhands: &[
            "border-block-start-color",
            "border-block-start-style",
            "border-block-start-width",
            "border-block-end-color",
            "border-block-end-style",
            "border-block-end-width",
        ],
    },
    Entry {
        name: "border-block-color",
        canonical: "border-block-color",
        grammar: "border-block-color",
        allow_initial: false,
        longhands: &["border-block-start-color", "border-block-end-color"],
    },
    Entry {
        name: "border-block-end",
        canonical: "border-block-end",
        grammar: "border-block-end",
        allow_initial: true,
        longhands: &[
            "border-block-end-width",
            "border-block-end-style",
            "border-block-end-color",
        ],
    },
    Entry {
        name: "border-block-start",
        canonical: "border-block-start",
        grammar: "border-block-start",
        allow_initial: true,
        longhands: &[
            "border-block-start-width",
            "border-block-start-style",
            "border-block-start-color",
        ],
    },
    Entry {
        name: "border-block-style",
        canonical: "border-block-style",
        grammar: "border-block-style",
        allow_initial: false,
        longhands: &["border-block-start-style", "border-block-end-style"],
    },
    Entry {
        name: "border-block-width",
        canonical: "border-block-width",
        grammar: "border-block-width",
        allow_initial: false,
        longhands: &["border-block-start-width", "border-block-end-width"],
    },
    Entry {
        name: "border-bottom",
        canonical: "border-bottom",
        grammar: "border-bottom",
        allow_initial: false,
        longhands: &[
            "border-bottom-width",
            "border-bottom-style",
            "border-bottom-color",
        ],
    },
    Entry {
        name: "border-color",
        canonical: "border-color",
        grammar: "border-color",
        allow_initial: false,
        longhands: &[
            "border-top-color",
            "border-right-color",
            "border-bottom-color",
            "border-left-color",
        ],
    },
    Entry {
        name: "border-image",
        canonical: "border-image",
        grammar: "border-image",
        allow_initial: false,
        longhands: &[
            "border-image-source",
            "border-image-slice",
            "border-image-width",
            "border-image-outset",
            "border-image-repeat",
        ],
    },
    Entry {
        name: "border-inline",
        canonical: "border-inline",
        grammar: "border-inline",
        allow_initial: false,
        longhands: &[
            "border-inline-start-color",
            "border-inline-start-style",
            "border-inline-start-width",
            "border-inline-end-color",
            "border-inline-end-style",
            "border-inline-end-width",
        ],
    },
    Entry {
        name: "border-inline-color",
        canonical: "border-inline-color",
        grammar: "border-inline-color",
        allow_initial: false,
        longhands: &["border-inline-start-color", "border-inline-end-color"],
    },
    Entry {
        name: "border-inline-end",
        canonical: "border-inline-end",
        grammar: "border-inline-end",
        allow_initial: true,
        longhands: &[
            "border-inline-end-width",
            "border-inline-end-style",
            "border-inline-end-color",
        ],
    },
    Entry {
        name: "border-inline-start",
        canonical: "border-inline-start",
        grammar: "border-inline-start",
        allow_initial: true,
        longhands: &[
            "border-inline-start-width",
            "border-inline-start-style",
            "border-inline-start-color",
        ],
    },
    Entry {
        name: "border-inline-style",
        canonical: "border-inline-style",
        grammar: "border-inline-style",
        allow_initial: false,
        longhands: &["border-inline-start-style", "border-inline-end-style"],
    },
    Entry {
        name: "border-inline-width",
        canonical: "border-inline-width",
        grammar: "border-inline-width",
        allow_initial: false,
        longhands: &["border-inline-start-width", "border-inline-end-width"],
    },
    Entry {
        name: "border-left",
        canonical: "border-left",
        grammar: "border-left",
        allow_initial: false,
        longhands: &[
            "border-left-width",
            "border-left-style",
            "border-left-color",
        ],
    },
    Entry {
        name: "border-radius",
        canonical: "border-radius",
        grammar: "border-radius",
        allow_initial: false,
        longhands: &[
            "border-top-left-radius",
            "border-top-right-radius",
            "border-bottom-right-radius",
            "border-bottom-left-radius",
        ],
    },
    Entry {
        name: "border-right",
        canonical: "border-right",
        grammar: "border-right",
        allow_initial: false,
        longhands: &[
            "border-right-width",
            "border-right-style",
            "border-right-color",
        ],
    },
    Entry {
        name: "border-spacing",
        canonical: "border-spacing",
        grammar: "border-spacing",
        allow_initial: false,
        longhands: &[
            "-webkit-border-horizontal-spacing",
            "-webkit-border-vertical-spacing",
        ],
    },
    Entry {
        name: "border-style",
        canonical: "border-style",
        grammar: "border-style",
        allow_initial: false,
        longhands: &[
            "border-top-style",
            "border-right-style",
            "border-bottom-style",
            "border-left-style",
        ],
    },
    Entry {
        name: "border-top",
        canonical: "border-top",
        grammar: "border-top",
        allow_initial: false,
        longhands: &["border-top-width", "border-top-style", "border-top-color"],
    },
    Entry {
        name: "border-width",
        canonical: "border-width",
        grammar: "border-width",
        allow_initial: false,
        longhands: &[
            "border-top-width",
            "border-right-width",
            "border-bottom-width",
            "border-left-width",
        ],
    },
    Entry {
        name: "column-rule",
        canonical: "column-rule",
        grammar: "column-rule",
        allow_initial: false,
        longhands: &[
            "column-rule-width",
            "column-rule-style",
            "column-rule-color",
        ],
    },
    Entry {
        name: "column-rule-inset",
        canonical: "column-rule-inset",
        grammar: "column-rule-inset",
        allow_initial: false,
        longhands: &[
            "column-rule-inset-cap-start",
            "column-rule-inset-cap-end",
            "column-rule-inset-junction-start",
            "column-rule-inset-junction-end",
        ],
    },
    Entry {
        name: "column-rule-inset-cap",
        canonical: "column-rule-inset-cap",
        grammar: "column-rule-inset-cap",
        allow_initial: false,
        longhands: &["column-rule-inset-cap-start", "column-rule-inset-cap-end"],
    },
    Entry {
        name: "column-rule-inset-end",
        canonical: "column-rule-inset-end",
        grammar: "column-rule-inset-end",
        allow_initial: false,
        longhands: &[
            "column-rule-inset-cap-end",
            "column-rule-inset-junction-end",
        ],
    },
    Entry {
        name: "column-rule-inset-junction",
        canonical: "column-rule-inset-junction",
        grammar: "column-rule-inset-junction",
        allow_initial: false,
        longhands: &[
            "column-rule-inset-junction-start",
            "column-rule-inset-junction-end",
        ],
    },
    Entry {
        name: "column-rule-inset-start",
        canonical: "column-rule-inset-start",
        grammar: "column-rule-inset-start",
        allow_initial: false,
        longhands: &[
            "column-rule-inset-cap-start",
            "column-rule-inset-junction-start",
        ],
    },
    Entry {
        name: "columns",
        canonical: "columns",
        grammar: "columns",
        allow_initial: false,
        longhands: &[
            "column-width",
            "column-count",
            "column-height",
            "column-wrap",
        ],
    },
    Entry {
        name: "contain-intrinsic-size",
        canonical: "contain-intrinsic-size",
        grammar: "contain-intrinsic-size",
        allow_initial: false,
        longhands: &["contain-intrinsic-width", "contain-intrinsic-height"],
    },
    Entry {
        name: "container",
        canonical: "container",
        grammar: "container",
        allow_initial: false,
        longhands: &["container-name", "container-type"],
    },
    Entry {
        name: "corner-block-end-shape",
        canonical: "corner-block-end-shape",
        grammar: "corner-block-end-shape",
        allow_initial: false,
        longhands: &["corner-end-start-shape", "corner-end-end-shape"],
    },
    Entry {
        name: "corner-block-start-shape",
        canonical: "corner-block-start-shape",
        grammar: "corner-block-start-shape",
        allow_initial: false,
        longhands: &["corner-start-start-shape", "corner-start-end-shape"],
    },
    Entry {
        name: "corner-bottom-shape",
        canonical: "corner-bottom-shape",
        grammar: "corner-bottom-shape",
        allow_initial: false,
        longhands: &["corner-bottom-left-shape", "corner-bottom-right-shape"],
    },
    Entry {
        name: "corner-inline-end-shape",
        canonical: "corner-inline-end-shape",
        grammar: "corner-inline-end-shape",
        allow_initial: false,
        longhands: &["corner-start-end-shape", "corner-end-end-shape"],
    },
    Entry {
        name: "corner-inline-start-shape",
        canonical: "corner-inline-start-shape",
        grammar: "corner-inline-start-shape",
        allow_initial: false,
        longhands: &["corner-start-start-shape", "corner-end-start-shape"],
    },
    Entry {
        name: "corner-left-shape",
        canonical: "corner-left-shape",
        grammar: "corner-left-shape",
        allow_initial: false,
        longhands: &["corner-top-left-shape", "corner-bottom-left-shape"],
    },
    Entry {
        name: "corner-right-shape",
        canonical: "corner-right-shape",
        grammar: "corner-right-shape",
        allow_initial: false,
        longhands: &["corner-top-right-shape", "corner-bottom-right-shape"],
    },
    Entry {
        name: "corner-shape",
        canonical: "corner-shape",
        grammar: "corner-shape",
        allow_initial: false,
        longhands: &[
            "corner-top-left-shape",
            "corner-top-right-shape",
            "corner-bottom-right-shape",
            "corner-bottom-left-shape",
        ],
    },
    Entry {
        name: "corner-top-shape",
        canonical: "corner-top-shape",
        grammar: "corner-top-shape",
        allow_initial: false,
        longhands: &["corner-top-left-shape", "corner-top-right-shape"],
    },
    Entry {
        name: "flex",
        canonical: "flex",
        grammar: "flex",
        allow_initial: false,
        longhands: &["flex-grow", "flex-shrink", "flex-basis"],
    },
    Entry {
        name: "flex-flow",
        canonical: "flex-flow",
        grammar: "flex-flow",
        allow_initial: false,
        longhands: &["flex-direction", "flex-wrap"],
    },
    Entry {
        name: "font",
        canonical: "font",
        grammar: "font",
        allow_initial: false,
        longhands: &[
            "font-style",
            "font-variant-ligatures",
            "font-variant-caps",
            "font-variant-numeric",
            "font-variant-east-asian",
            "font-variant-alternates",
            "font-variant-position",
            "font-variant-emoji",
            "font-weight",
            "font-stretch",
            "font-size",
            "line-height",
            "font-family",
            "font-optical-sizing",
            "font-size-adjust",
            "font-kerning",
            "font-feature-settings",
            "font-variation-settings",
            "font-language-override",
        ],
    },
    Entry {
        name: "font-synthesis",
        canonical: "font-synthesis",
        grammar: "font-synthesis",
        allow_initial: false,
        longhands: &[
            "font-synthesis-weight",
            "font-synthesis-style",
            "font-synthesis-small-caps",
        ],
    },
    Entry {
        name: "font-variant",
        canonical: "font-variant",
        grammar: "font-variant",
        allow_initial: false,
        longhands: &[
            "font-variant-ligatures",
            "font-variant-caps",
            "font-variant-alternates",
            "font-variant-numeric",
            "font-variant-east-asian",
            "font-variant-position",
            "font-variant-emoji",
        ],
    },
    Entry {
        name: "gap",
        canonical: "gap",
        grammar: "gap",
        allow_initial: false,
        longhands: &["row-gap", "column-gap"],
    },
    Entry {
        name: "grid",
        canonical: "grid",
        grammar: "grid",
        allow_initial: false,
        longhands: &[
            "grid-template-rows",
            "grid-template-columns",
            "grid-template-areas",
            "grid-auto-flow",
            "grid-auto-rows",
            "grid-auto-columns",
        ],
    },
    Entry {
        name: "grid-area",
        canonical: "grid-area",
        grammar: "grid-area",
        allow_initial: false,
        longhands: &[
            "grid-row-start",
            "grid-column-start",
            "grid-row-end",
            "grid-column-end",
        ],
    },
    Entry {
        name: "grid-column",
        canonical: "grid-column",
        grammar: "grid-column",
        allow_initial: false,
        longhands: &["grid-column-start", "grid-column-end"],
    },
    Entry {
        name: "grid-gap",
        canonical: "gap",
        grammar: "gap",
        allow_initial: false,
        longhands: &["row-gap", "column-gap"],
    },
    Entry {
        name: "grid-row",
        canonical: "grid-row",
        grammar: "grid-row",
        allow_initial: false,
        longhands: &["grid-row-start", "grid-row-end"],
    },
    Entry {
        name: "grid-template",
        canonical: "grid-template",
        grammar: "grid-template",
        allow_initial: false,
        longhands: &[
            "grid-template-rows",
            "grid-template-columns",
            "grid-template-areas",
        ],
    },
    Entry {
        name: "inset",
        canonical: "inset",
        grammar: "inset",
        allow_initial: false,
        longhands: &["top", "right", "bottom", "left"],
    },
    Entry {
        name: "inset-block",
        canonical: "inset-block",
        grammar: "inset-block",
        allow_initial: false,
        longhands: &["inset-block-start", "inset-block-end"],
    },
    Entry {
        name: "inset-inline",
        canonical: "inset-inline",
        grammar: "inset-inline",
        allow_initial: false,
        longhands: &["inset-inline-start", "inset-inline-end"],
    },
    Entry {
        name: "interest-delay",
        canonical: "interest-delay",
        grammar: "interest-delay",
        allow_initial: false,
        longhands: &["interest-delay-start", "interest-delay-end"],
    },
    Entry {
        name: "list-style",
        canonical: "list-style",
        grammar: "list-style",
        allow_initial: true,
        longhands: &["list-style-position", "list-style-image", "list-style-type"],
    },
    Entry {
        name: "margin",
        canonical: "margin",
        grammar: "margin",
        allow_initial: false,
        longhands: &["margin-top", "margin-right", "margin-bottom", "margin-left"],
    },
    Entry {
        name: "margin-block",
        canonical: "margin-block",
        grammar: "margin-block",
        allow_initial: false,
        longhands: &["margin-block-start", "margin-block-end"],
    },
    Entry {
        name: "margin-inline",
        canonical: "margin-inline",
        grammar: "margin-inline",
        allow_initial: false,
        longhands: &["margin-inline-start", "margin-inline-end"],
    },
    Entry {
        name: "marker",
        canonical: "marker",
        grammar: "marker",
        allow_initial: false,
        longhands: &["marker-start", "marker-mid", "marker-end"],
    },
    Entry {
        name: "mask",
        canonical: "mask",
        grammar: "mask",
        allow_initial: false,
        longhands: &[
            "mask-image",
            "-webkit-mask-position-x",
            "-webkit-mask-position-y",
            "mask-size",
            "mask-repeat",
            "mask-origin",
            "mask-clip",
            "mask-composite",
            "mask-mode",
        ],
    },
    Entry {
        name: "mask-position",
        canonical: "mask-position",
        grammar: "mask-position",
        allow_initial: false,
        longhands: &["-webkit-mask-position-x", "-webkit-mask-position-y"],
    },
    Entry {
        name: "offset",
        canonical: "offset",
        grammar: "offset",
        allow_initial: false,
        longhands: &[
            "offset-position",
            "offset-path",
            "offset-distance",
            "offset-rotate",
            "offset-anchor",
        ],
    },
    Entry {
        name: "outline",
        canonical: "outline",
        grammar: "outline",
        allow_initial: true,
        longhands: &["outline-color", "outline-style", "outline-width"],
    },
    Entry {
        name: "overflow",
        canonical: "overflow",
        grammar: "overflow",
        allow_initial: false,
        longhands: &["overflow-x", "overflow-y"],
    },
    Entry {
        name: "overscroll-behavior",
        canonical: "overscroll-behavior",
        grammar: "overscroll-behavior",
        allow_initial: false,
        longhands: &["overscroll-behavior-x", "overscroll-behavior-y"],
    },
    Entry {
        name: "padding",
        canonical: "padding",
        grammar: "padding",
        allow_initial: false,
        longhands: &[
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
        ],
    },
    Entry {
        name: "padding-block",
        canonical: "padding-block",
        grammar: "padding-block",
        allow_initial: false,
        longhands: &["padding-block-start", "padding-block-end"],
    },
    Entry {
        name: "padding-inline",
        canonical: "padding-inline",
        grammar: "padding-inline",
        allow_initial: false,
        longhands: &["padding-inline-start", "padding-inline-end"],
    },
    Entry {
        name: "place-content",
        canonical: "place-content",
        grammar: "place-content",
        allow_initial: false,
        longhands: &["align-content", "justify-content"],
    },
    Entry {
        name: "place-items",
        canonical: "place-items",
        grammar: "place-items",
        allow_initial: false,
        longhands: &["align-items", "justify-items"],
    },
    Entry {
        name: "place-self",
        canonical: "place-self",
        grammar: "place-self",
        allow_initial: false,
        longhands: &["align-self", "justify-self"],
    },
    Entry {
        name: "position-try",
        canonical: "position-try",
        grammar: "position-try",
        allow_initial: false,
        longhands: &["position-try-order", "position-try-fallbacks"],
    },
    Entry {
        name: "row-rule",
        canonical: "row-rule",
        grammar: "row-rule",
        allow_initial: false,
        longhands: &["row-rule-width", "row-rule-style", "row-rule-color"],
    },
    Entry {
        name: "row-rule-inset",
        canonical: "row-rule-inset",
        grammar: "row-rule-inset",
        allow_initial: false,
        longhands: &[
            "row-rule-inset-cap-start",
            "row-rule-inset-cap-end",
            "row-rule-inset-junction-start",
            "row-rule-inset-junction-end",
        ],
    },
    Entry {
        name: "row-rule-inset-cap",
        canonical: "row-rule-inset-cap",
        grammar: "row-rule-inset-cap",
        allow_initial: false,
        longhands: &["row-rule-inset-cap-start", "row-rule-inset-cap-end"],
    },
    Entry {
        name: "row-rule-inset-end",
        canonical: "row-rule-inset-end",
        grammar: "row-rule-inset-end",
        allow_initial: false,
        longhands: &["row-rule-inset-cap-end", "row-rule-inset-junction-end"],
    },
    Entry {
        name: "row-rule-inset-junction",
        canonical: "row-rule-inset-junction",
        grammar: "row-rule-inset-junction",
        allow_initial: false,
        longhands: &[
            "row-rule-inset-junction-start",
            "row-rule-inset-junction-end",
        ],
    },
    Entry {
        name: "row-rule-inset-start",
        canonical: "row-rule-inset-start",
        grammar: "row-rule-inset-start",
        allow_initial: false,
        longhands: &["row-rule-inset-cap-start", "row-rule-inset-junction-start"],
    },
    Entry {
        name: "rule",
        canonical: "rule",
        grammar: "rule",
        allow_initial: false,
        longhands: &[
            "column-rule-width",
            "column-rule-style",
            "column-rule-color",
            "row-rule-width",
            "row-rule-style",
            "row-rule-color",
        ],
    },
    Entry {
        name: "rule-break",
        canonical: "rule-break",
        grammar: "rule-break",
        allow_initial: false,
        longhands: &["row-rule-break", "column-rule-break"],
    },
    Entry {
        name: "rule-color",
        canonical: "rule-color",
        grammar: "rule-color",
        allow_initial: false,
        longhands: &["column-rule-color", "row-rule-color"],
    },
    Entry {
        name: "rule-inset",
        canonical: "rule-inset",
        grammar: "rule-inset",
        allow_initial: false,
        longhands: &[
            "row-rule-inset-cap-start",
            "row-rule-inset-cap-end",
            "row-rule-inset-junction-start",
            "row-rule-inset-junction-end",
            "column-rule-inset-cap-start",
            "column-rule-inset-cap-end",
            "column-rule-inset-junction-start",
            "column-rule-inset-junction-end",
        ],
    },
    Entry {
        name: "rule-inset-cap",
        canonical: "rule-inset-cap",
        grammar: "rule-inset-cap",
        allow_initial: false,
        longhands: &[
            "row-rule-inset-cap-start",
            "row-rule-inset-cap-end",
            "column-rule-inset-cap-start",
            "column-rule-inset-cap-end",
        ],
    },
    Entry {
        name: "rule-inset-end",
        canonical: "rule-inset-end",
        grammar: "rule-inset-end",
        allow_initial: false,
        longhands: &[
            "column-rule-inset-cap-end",
            "column-rule-inset-junction-end",
            "row-rule-inset-cap-end",
            "row-rule-inset-junction-end",
        ],
    },
    Entry {
        name: "rule-inset-junction",
        canonical: "rule-inset-junction",
        grammar: "rule-inset-junction",
        allow_initial: false,
        longhands: &[
            "row-rule-inset-junction-start",
            "row-rule-inset-junction-end",
            "column-rule-inset-junction-start",
            "column-rule-inset-junction-end",
        ],
    },
    Entry {
        name: "rule-inset-start",
        canonical: "rule-inset-start",
        grammar: "rule-inset-start",
        allow_initial: false,
        longhands: &[
            "column-rule-inset-cap-start",
            "column-rule-inset-junction-start",
            "row-rule-inset-cap-start",
            "row-rule-inset-junction-start",
        ],
    },
    Entry {
        name: "rule-style",
        canonical: "rule-style",
        grammar: "rule-style",
        allow_initial: false,
        longhands: &["column-rule-style", "row-rule-style"],
    },
    Entry {
        name: "rule-visibility-items",
        canonical: "rule-visibility-items",
        grammar: "rule-visibility-items",
        allow_initial: false,
        longhands: &["column-rule-visibility-items", "row-rule-visibility-items"],
    },
    Entry {
        name: "rule-width",
        canonical: "rule-width",
        grammar: "rule-width",
        allow_initial: false,
        longhands: &["column-rule-width", "row-rule-width"],
    },
    Entry {
        name: "scroll-margin",
        canonical: "scroll-margin",
        grammar: "scroll-margin",
        allow_initial: false,
        longhands: &[
            "scroll-margin-top",
            "scroll-margin-right",
            "scroll-margin-bottom",
            "scroll-margin-left",
        ],
    },
    Entry {
        name: "scroll-margin-block",
        canonical: "scroll-margin-block",
        grammar: "scroll-margin-block",
        allow_initial: false,
        longhands: &["scroll-margin-block-start", "scroll-margin-block-end"],
    },
    Entry {
        name: "scroll-margin-inline",
        canonical: "scroll-margin-inline",
        grammar: "scroll-margin-inline",
        allow_initial: false,
        longhands: &["scroll-margin-inline-start", "scroll-margin-inline-end"],
    },
    Entry {
        name: "scroll-padding",
        canonical: "scroll-padding",
        grammar: "scroll-padding",
        allow_initial: false,
        longhands: &[
            "scroll-padding-top",
            "scroll-padding-right",
            "scroll-padding-bottom",
            "scroll-padding-left",
        ],
    },
    Entry {
        name: "scroll-padding-block",
        canonical: "scroll-padding-block",
        grammar: "scroll-padding-block",
        allow_initial: false,
        longhands: &["scroll-padding-block-start", "scroll-padding-block-end"],
    },
    Entry {
        name: "scroll-padding-inline",
        canonical: "scroll-padding-inline",
        grammar: "scroll-padding-inline",
        allow_initial: false,
        longhands: &["scroll-padding-inline-start", "scroll-padding-inline-end"],
    },
    Entry {
        name: "scroll-timeline",
        canonical: "scroll-timeline",
        grammar: "scroll-timeline",
        allow_initial: false,
        longhands: &["scroll-timeline-name", "scroll-timeline-axis"],
    },
    Entry {
        name: "text-box",
        canonical: "text-box",
        grammar: "text-box",
        allow_initial: false,
        longhands: &["text-box-trim", "text-box-edge"],
    },
    Entry {
        name: "text-decoration",
        canonical: "text-decoration",
        grammar: "text-decoration",
        allow_initial: true,
        longhands: &[
            "text-decoration-line",
            "text-decoration-thickness",
            "text-decoration-style",
            "text-decoration-color",
        ],
    },
    Entry {
        name: "text-emphasis",
        canonical: "text-emphasis",
        grammar: "text-emphasis",
        allow_initial: true,
        longhands: &["text-emphasis-style", "text-emphasis-color"],
    },
    Entry {
        name: "text-wrap",
        canonical: "text-wrap",
        grammar: "text-wrap",
        allow_initial: true,
        longhands: &["text-wrap-mode", "text-wrap-style"],
    },
    Entry {
        name: "timeline-trigger",
        canonical: "timeline-trigger",
        grammar: "timeline-trigger",
        allow_initial: false,
        longhands: &[
            "timeline-trigger-name",
            "timeline-trigger-source",
            "timeline-trigger-activation-range-start",
            "timeline-trigger-activation-range-end",
            "timeline-trigger-active-range-start",
            "timeline-trigger-active-range-end",
        ],
    },
    Entry {
        name: "timeline-trigger-activation-range",
        canonical: "timeline-trigger-activation-range",
        grammar: "timeline-trigger-activation-range",
        allow_initial: false,
        longhands: &[
            "timeline-trigger-activation-range-start",
            "timeline-trigger-activation-range-end",
        ],
    },
    Entry {
        name: "timeline-trigger-active-range",
        canonical: "timeline-trigger-active-range",
        grammar: "timeline-trigger-active-range",
        allow_initial: false,
        longhands: &[
            "timeline-trigger-active-range-start",
            "timeline-trigger-active-range-end",
        ],
    },
    Entry {
        name: "transition",
        canonical: "transition",
        grammar: "transition",
        allow_initial: false,
        longhands: &[
            "transition-property",
            "transition-duration",
            "transition-timing-function",
            "transition-delay",
            "transition-behavior",
        ],
    },
    Entry {
        name: "view-timeline",
        canonical: "view-timeline",
        grammar: "view-timeline",
        allow_initial: false,
        longhands: &[
            "view-timeline-name",
            "view-timeline-axis",
            "view-timeline-inset",
        ],
    },
    Entry {
        name: "white-space",
        canonical: "white-space",
        grammar: "white-space",
        allow_initial: true,
        longhands: &["white-space-collapse", "text-wrap-mode"],
    },
];

pub fn entry(name: &str) -> Option<&'static Entry> {
    SHORTHANDS
        .binary_search_by(|entry| entry.name.cmp(name))
        .ok()
        .map(|index| &SHORTHANDS[index])
}

/// Whether `name` is a shorthand (or a shorthand alias).
#[must_use]
pub fn is_shorthand(name: &str) -> bool {
    entry(name).is_some()
}

/// The longhands `name` sets, in Chrome's order.
#[must_use]
pub fn longhands(name: &str) -> Option<&'static [&'static str]> {
    entry(name).map(|entry| entry.longhands)
}

/// Canonical shorthands by preference: most longhands first, then by name.
pub fn preferred() -> &'static [&'static Entry] {
    static PREFERRED: OnceLock<Vec<&'static Entry>> = OnceLock::new();
    PREFERRED.get_or_init(|| {
        let mut entries: Vec<&'static Entry> = SHORTHANDS
            .iter()
            .filter(|entry| entry.name == entry.canonical)
            .collect();
        entries.sort_by(|a, b| {
            b.longhands
                .len()
                .cmp(&a.longhands.len())
                .then(a.name.cmp(b.name))
        });
        entries
    })
}

#[cfg(test)]
mod tests {
    use super::{entry, SHORTHANDS};

    /// `grammar::expand` and `serialize::value` take an entry's grammar key: each one names
    /// an entry (whose longhands the serializer reads) and has a parser. `expand` returns
    /// `None` both for an unknown key and for a value its parser rejects, so each key must
    /// expand at least one value Chrome 156 accepts for one of its shorthands (the control's
    /// `name|value` scenarios that set longhands; `-webkit-mask-box-image` sets them but reads
    /// back ""): a key without a parser expands nothing.
    #[test]
    fn every_grammar_names_an_entry_with_a_parser() {
        // IDs from the upstream Chrome fixture whose scenarios set longhands.
        let ids: Vec<String> = serde_json::from_str(include_str!(
            "../../../tests/fixtures/css_shorthand_accepted_chrome156.json"
        ))
        .unwrap();
        let mut accepted = std::collections::HashMap::<&str, Vec<&str>>::new();
        for id in &ids {
            let (name, value) = id.split_once('|').unwrap();
            accepted.entry(name).or_default().push(value);
        }
        // The control's only non-keyword row-rule-inset-end value (`1px 2px`) is invalid;
        // Chrome 156 accepts `row-rule-inset-end: 1px` (frozen headless shell).
        accepted
            .entry("row-rule-inset-end")
            .or_default()
            .push("1px");
        for shorthand in SHORTHANDS {
            let grammar = entry(shorthand.grammar).unwrap_or_else(|| panic!("{}", shorthand.name));
            assert_eq!(grammar.longhands, shorthand.longhands, "{}", shorthand.name);
        }
        let mut grammars: Vec<&str> = SHORTHANDS.iter().map(|s| s.grammar).collect();
        grammars.sort_unstable();
        grammars.dedup();
        for grammar in grammars {
            let expands = SHORTHANDS
                .iter()
                .filter(|shorthand| shorthand.grammar == grammar)
                .flat_map(|shorthand| accepted.get(shorthand.name).into_iter().flatten())
                .any(|value| {
                    super::super::components::components(value).is_some_and(|comps| {
                        super::super::grammar::expand(grammar, &comps).is_some()
                    })
                });
            assert!(
                expands,
                "grammar {grammar} expands no Chrome-accepted value"
            );
        }
    }
}
