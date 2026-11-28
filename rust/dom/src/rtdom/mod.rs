//! Pure-Rust DOM runtime (native Rust API; no wasm-bindgen / napi boundary).
//! Phase-0 of the pivoted port (RUST_PORT_PLAN §7): a Rust consumer drives this
//! in-process — zero JS↔WASM boundary, every read/mutation a plain Rust call.
//!
//! Modules:
//!   * `tree`  — COW tree over the immutable parse buffer + version counter.
//!   * `query` — the selector engine: matching + version-cached
//!     querySelectorAll/getElementBy*, and stylesheet selectors (`parse_for_cascade`,
//!     `match_for_cascade`) for layout cascades.
//!   * `color` — CSS color canonicalization (rgb()/rgba()), pure functions.
//!   * `css_values` — Chrome-compatible CSS value grammars (`zoom`), pure functions.

pub mod canvas;
pub mod cascade;
pub mod color;
pub mod css_shorthand;
pub mod css_values;
pub mod cssom;
pub mod custom_elements;
pub mod events;
pub mod file;
pub mod location;
pub mod mutations;
pub mod node_ref;
pub mod query;
pub mod serialize;
pub mod stubs;
pub mod svg;
pub mod tree;

#[cfg(test)]
mod conformance;
#[cfg(test)]
mod dump;
#[cfg(test)]
mod gauntlet;

pub use events::{Dom, Event};
pub use node_ref::{DocumentExt, NodeRef};
pub use tree::{
    CustomElementState, FormProp, Handle, LocalAttributes, ParseOptions, Siblings, SourcePosition,
    StyleFilter, StyleScope, Tree,
};
