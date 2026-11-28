//!`nwsapi` is a native DOM selector engine with an HTML parser, mutable trees,
//! and reusable selector plans.
//!
//! ```
//! use nwsapi::Tree;
//!
//! let tree = Tree::parse("<main><article class=card>hello</article></main>");
//! let selector = tree.compile_selector("main > .card")?;
//! assert_eq!(selector.select(&tree, None).len(), 1);
//! # Ok::<(), nwsapi::rtdom::query::SelectorError>(())
//! ```
//!
//! The default `jit` feature enables background native code generation on
//! supported architectures. Disable default features to use the interpreter.
//! Use `SelectorState` to report browser interaction or media state from a host.

// `core.rs` is kept byte-identical to turbo-dom's parser core for easy re-sync; it
// carries `cfg(feature = "wasm-bind")` attrs for a feature this standalone crate
// doesn't define (the attrs are simply never active here).
#![allow(unexpected_cfgs)]

/// Version string shared with the JavaScript NWSAPI v3 prerelease API.
pub const VERSION: &str = "nwsapi-3.0.0-prerelease";

/// JavaScript resolver fragments exposed by the v3 API for compiler plugins.
/// The native matcher executes compiled selector plans directly.
pub mod resolver_templates {
    /// Body of the single-element matching resolver.
    pub const M_BODY: &str = "";
    /// Invoke the callback on the matching element.
    pub const M_TEST: &str = "f(c);";
    /// Append an array candidate to the selected results.
    pub const S_BODY: &str = "r[++j]=c[k];";
    /// Stop array selection when the callback returns a truthy value.
    pub const S_TEST: &str = "if(f(c[k])){break main;}";
    /// Append a DOM collection candidate to the selected results.
    pub const N_BODY: &str = "r[++j]=c.item(k);";
    /// Stop DOM collection selection when the callback returns a truthy value.
    pub const N_TEST: &str = "if(f(c.item(k))){break main;}";

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn fragments_match_v3_initialization_and_public_exports() {
            let initialization = include_str!("../../../src/core/initialize/matching.mts");
            let exports = include_str!("../../../src/core/initialize/api.mts");
            for (name, fragment) in [
                ("M_BODY", M_BODY),
                ("M_TEST", M_TEST),
                ("S_BODY", S_BODY),
                ("S_TEST", S_TEST),
                ("N_BODY", N_BODY),
                ("N_TEST", N_TEST),
            ] {
                assert!(
                    initialization
                        .lines()
                        .any(|line| { line.trim() == format!("engine.{name} = '{fragment}'") }),
                    "{name} differs from the v3 template"
                );
                assert!(exports.contains(&format!("{name}: engine.{name},")));
            }
        }
    }
}

/// The html5ever-backed parser core (produces the read-only SoA the tree views).
pub mod core;

/// The pure-Rust DOM runtime.
pub mod rtdom;

pub use nwsapi_has::has_policy::{
    Features as HasFeatures, Host as HasRoutePlannerHost, Route as HasRoute,
};
pub use nwsapi_has::Relationship as HasRelationship;
pub use rtdom::node_ref::{DocumentExt, NodeRef};
pub use rtdom::query::HostSnapshot;
pub use rtdom::query::{AdapterError, DomSelector, QueryOptions, SelectorSubject, StylesheetMatch};
pub use rtdom::query::{
    AttributePredicate, BulkHasPlanner, CombinatorResolver, CompiledRelativeSelector,
    CompiledSelector, ExtensionSyntax, ResolverCache, SelectorArity, SelectorConfig,
    SelectorErrorMode, SelectorExtensions, SelectorForm, SelectorPredicate, TraversalTarget,
};
pub use rtdom::tree::SelectorState;
pub use rtdom::{CustomElementState, Dom, Event, FormProp, Handle, ParseOptions, Tree};
