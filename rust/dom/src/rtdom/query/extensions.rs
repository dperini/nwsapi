use super::{
    cascade, units, CompiledRelativeSelector, CompiledSelector, Complex, Handle, PreparedList,
    Pseudo, SelectorError, Tree,
};
use cssparser::{Parser, ParserInput};
use indexmap::{map::Entry as OrderedEntry, IndexMap};
use rustc_hash::{FxBuildHasher, FxHashMap};
use std::collections::hash_map::Entry;
use std::fmt;
use std::rc::Rc;

/// The syntax accepted by a registered pseudo-class or pseudo-element.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SelectorArity {
    /// A bare selector such as `:featured` or `::featured`.
    Flag,
    /// A functional selector such as `:rating(5)` or `::rating(5)`.
    Function,
    /// Either spelling, for plugins whose expression makes the argument optional.
    Optional,
}

impl SelectorArity {
    fn accepts(self, has_argument: bool) -> bool {
        match self {
            Self::Flag => !has_argument,
            Self::Function => has_argument,
            Self::Optional => true,
        }
    }
}

/// CSS spellings matched by a plugin registration.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SelectorForm {
    PseudoClass,
    PseudoElement,
    Either,
}

struct RegisteredSelector {
    pseudo: String,
    arity: SelectorArity,
    form: SelectorForm,
    callback: SelectorCallback,
}

/// A predicate over the live tree and an optional CSS argument.
/// Functional arguments are passed as CSS source, with escapes still present.
pub type SelectorPredicate = fn(&Tree, Handle, Option<&str>) -> bool;

/// Compare existing attribute and selector values as original UTF-16 code units.
/// The third argument reports whether ASCII case-insensitive matching was requested.
pub type AttributePredicate = fn(&[u16], &[u16], bool) -> bool;

/// Visit candidates on the left side of a custom combinator, given its right node.
/// Stop and return true when the visitor returns true. Otherwise return false.
/// Candidates must belong to the same tree.
pub type CombinatorResolver = fn(&Tree, Handle, &mut dyn FnMut(Handle) -> bool) -> bool;

type SelectorCallbackFn = dyn Fn(&Tree, Handle, Option<&str>) -> bool;
type AttributeCallbackFn = dyn Fn(&[u16], &[u16], bool) -> bool;
type CombinatorCallbackFn = dyn Fn(&Tree, Handle, &mut dyn FnMut(Handle) -> bool) -> bool;

#[derive(Clone)]
/// A retained native selector predicate, including its captured plugin state.
pub struct SelectorCallback(Rc<SelectorCallbackFn>);

impl SelectorCallback {
    fn new(callback: impl Fn(&Tree, Handle, Option<&str>) -> bool + 'static) -> Self {
        Self(Rc::new(callback))
    }

    pub fn matches(&self, tree: &Tree, node: Handle, argument: Option<&str>) -> bool {
        (self.0)(tree, node, argument)
    }
}

impl fmt::Debug for SelectorCallback {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SelectorCallback(..)")
    }
}

#[derive(Clone)]
pub(super) struct AttributeCallback(Rc<AttributeCallbackFn>);

impl AttributeCallback {
    fn new(callback: impl Fn(&[u16], &[u16], bool) -> bool + 'static) -> Self {
        Self(Rc::new(callback))
    }

    pub(super) fn matches(&self, got: &[u16], wanted: &[u16], insensitive: bool) -> bool {
        (self.0)(got, wanted, insensitive)
    }
}

impl fmt::Debug for AttributeCallback {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("AttributeCallback(..)")
    }
}

#[derive(Clone)]
/// A retained native combinator resolver.
pub struct CombinatorCallback(Rc<CombinatorCallbackFn>);

impl CombinatorCallback {
    fn new(
        callback: impl Fn(&Tree, Handle, &mut dyn FnMut(Handle) -> bool) -> bool + 'static,
    ) -> Self {
        Self(Rc::new(callback))
    }

    pub fn visit(
        &self,
        tree: &Tree,
        node: Handle,
        visitor: &mut dyn FnMut(Handle) -> bool,
    ) -> bool {
        (self.0)(tree, node, visitor)
    }
}

impl fmt::Debug for CombinatorCallback {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("CombinatorCallback(..)")
    }
}

/// Native selector extensions for explicitly compiled selectors.
///
/// ```
/// use nwsapi::{SelectorArity, SelectorExtensions, Tree};
///
/// let tree = Tree::parse("<article data-featured>One</article><article>Two</article>");
/// let mut extensions = SelectorExtensions::default();
/// assert!(extensions.register_selector("featured", SelectorArity::Flag, |tree, node, _| {
///     tree.has_attribute(node, "data-featured")
/// }));
/// let plan = extensions.compile("article:featured")?;
/// assert_eq!(plan.select(&tree, None).len(), 1);
/// # Ok::<(), nwsapi::rtdom::query::SelectorError>(())
/// ```
#[derive(Default)]
pub struct SelectorExtensions {
    syntax: ExtensionSyntax,
    operator_expression: std::cell::OnceCell<Option<regress::Regex>>,
    selectors: IndexMap<String, RegisteredSelector, FxBuildHasher>,
    operators: FxHashMap<u16, AttributeCallback>,
    jquery: bool,
    combinators: IndexMap<char, (String, CombinatorCallback), FxBuildHasher>,
}

/// JavaScript regular-expression source for the registered extension symbols.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExtensionSyntax {
    pub operators: String,
    pub combinators: String,
}

impl Default for ExtensionSyntax {
    fn default() -> Self {
        Self {
            operators: "[~*^$|]=|=".into(),
            combinators: r"[\x20\t>+~](?=[^>+~])".into(),
        }
    }
}

// ECMAScript own-property order places canonical array indices before string keys.
fn registry_index(key: &str) -> Option<u32> {
    if !key.as_bytes().first()?.is_ascii_digit() || (key.len() > 1 && key.starts_with('0')) {
        return None;
    }
    key.parse::<u32>().ok().filter(|&index| index != u32::MAX)
}

fn decoded_pseudo(name: &str) -> Option<String> {
    let mut input = ParserInput::new(name);
    let mut parser = Parser::new(&mut input);
    let key = parser.expect_ident().ok()?.to_ascii_lowercase();
    parser.expect_exhausted().ok()?;
    Some(key)
}

impl SelectorExtensions {
    /// Current v3 CFG expressions, including custom symbols in registration order.
    #[must_use]
    pub fn syntax(&self) -> &ExtensionSyntax {
        &self.syntax
    }

    /// Edit the v3 CFG expressions used by subsequent extension registrations.
    /// Existing compiled plans retain the callbacks they were built with.
    pub fn syntax_mut(&mut self) -> &mut ExtensionSyntax {
        self.operator_expression.take();
        &mut self.syntax
    }

    /// Registered selector names, argument requirements and callable predicates.
    pub fn selectors(&self) -> impl Iterator<Item = (&str, SelectorArity, &SelectorCallback)> {
        self.selectors
            .iter()
            .map(|(key, entry)| (key.as_str(), entry.arity, &entry.callback))
    }

    /// Original combinator registration names and their callable resolvers.
    pub fn combinators(&self) -> impl Iterator<Item = (&str, &CombinatorCallback)> {
        self.combinators
            .values()
            .map(|(name, resolver)| (name.as_str(), resolver))
    }

    /// Look up the predicate by its exact public registration name.
    #[must_use]
    pub fn selector(&self, name: &str) -> Option<(SelectorArity, &SelectorCallback)> {
        self.selectors
            .get(name)
            .map(|entry| (entry.arity, &entry.callback))
    }

    /// Look up a relationship by its original registration name.
    #[must_use]
    pub fn combinator(&self, name: &str) -> Option<&CombinatorCallback> {
        let symbol = name.chars().find(|&ch| ch != '=')?;
        let (key, callback) = self.combinators.get(&symbol)?;
        (key == name).then_some(callback)
    }

    /// Replace a registered predicate for future compilations. Existing plans retain their callback.
    pub fn replace_selector_with(
        &mut self,
        name: &str,
        predicate: impl Fn(&Tree, Handle, Option<&str>) -> bool + 'static,
    ) -> bool {
        let Some(entry) = self.selectors.get_mut(name) else {
            return false;
        };
        entry.callback = SelectorCallback::new(predicate);
        true
    }

    /// Change which argument forms a registered selector accepts in future compilations.
    pub fn set_selector_arity(&mut self, name: &str, arity: SelectorArity) -> bool {
        let Some(entry) = self.selectors.get_mut(name) else {
            return false;
        };
        entry.arity = arity;
        true
    }

    /// Replace a registered relationship for future compilations.
    pub fn replace_combinator_with(
        &mut self,
        name: &str,
        resolver: impl Fn(&Tree, Handle, &mut dyn FnMut(Handle) -> bool) -> bool + 'static,
    ) -> bool {
        let Some(symbol) = name.chars().find(|&ch| ch != '=') else {
            return false;
        };
        let Some((key, callback)) = self.combinators.get_mut(&symbol) else {
            return false;
        };
        if key != name {
            return false;
        }
        *callback = CombinatorCallback::new(resolver);
        true
    }

    /// Delete a selector by its public registration key. Existing plans retain their resolver.
    pub fn remove_selector(&mut self, name: &str) -> bool {
        self.selectors.shift_remove(name).is_some()
    }

    /// Delete a combinator registry entry. As in v3, editing the table leaves CFG intact.
    pub fn remove_combinator(&mut self, name: &str) -> bool {
        let Some(index) = self.combinators.values().position(|(key, _)| key == name) else {
            return false;
        };
        self.combinators.shift_remove_index(index);
        true
    }

    /// Whether any user-defined selector, attribute, or combinator resolver is registered.
    ///
    /// The built-in jQuery examples are not custom resolvers.
    #[must_use]
    pub fn has_custom_resolvers(&self) -> bool {
        !self.selectors.is_empty() || !self.operators.is_empty() || !self.combinators.is_empty()
    }

    /// Register a CSS pseudo-class or pseudo-element name without its colons.
    ///
    /// Returns false for an invalid, reserved, or duplicate name.
    /// Existing compiled plans retain their predicates.
    pub fn register_selector(
        &mut self,
        name: &str,
        arity: SelectorArity,
        predicate: SelectorPredicate,
    ) -> bool {
        self.register_selector_with(name, arity, predicate)
    }

    /// Register a pseudo-class or pseudo-element with a capturing Rust closure.
    ///
    /// Compiled plans retain a shared reference to the callback, so the closure
    /// must own any state it needs and be `'static`.
    pub fn register_selector_with(
        &mut self,
        name: &str,
        arity: SelectorArity,
        predicate: impl Fn(&Tree, Handle, Option<&str>) -> bool + 'static,
    ) -> bool {
        self.register_selector_form(name, arity, SelectorForm::Either, predicate)
    }

    /// Register a predicate restricted to a pseudo-class or pseudo-element spelling.
    pub fn register_selector_form(
        &mut self,
        name: &str,
        arity: SelectorArity,
        form: SelectorForm,
        predicate: impl Fn(&Tree, Handle, Option<&str>) -> bool + 'static,
    ) -> bool {
        if decoded_pseudo(name)
            .is_some_and(|key| self.selectors.values().any(|entry| entry.pseudo == key))
        {
            return false;
        }
        self.register_selector_key(name, name, arity, form, predicate)
    }

    /// Register a CSS pseudo under an independent, case-sensitive public registry key.
    /// Plugin keys such as `"example:rating"` need not be CSS identifiers.
    pub fn register_selector_key(
        &mut self,
        registry_key: &str,
        pseudo: &str,
        arity: SelectorArity,
        form: SelectorForm,
        predicate: impl Fn(&Tree, Handle, Option<&str>) -> bool + 'static,
    ) -> bool {
        let Some(key) = decoded_pseudo(pseudo) else {
            return false;
        };
        if cascade::is_builtin_pseudo(&key) || (self.jquery && super::jquery::is_name(&key)) {
            return false;
        }
        if self.selectors.contains_key(registry_key) {
            return false;
        }
        let position = registry_index(registry_key)
            .and_then(|index| {
                self.selectors
                    .keys()
                    .position(|key| registry_index(key).is_none_or(|existing| existing > index))
            })
            .unwrap_or(self.selectors.len());
        self.selectors.shift_insert(
            position,
            registry_key.to_owned(),
            RegisteredSelector {
                pseudo: key,
                arity,
                form,
                callback: SelectorCallback::new(predicate),
            },
        );
        true
    }

    /// Register a custom attribute comparison such as `!=`.
    ///
    /// Returns false for a duplicate or unsupported operator. Supported custom
    /// symbols are `!`, `#`, `%`, `&`, `/`, `<`, `>`, `?`, and `@`, followed by `=`.
    pub fn register_operator(&mut self, operator: &str, predicate: AttributePredicate) -> bool {
        self.register_operator_with(operator, predicate)
    }

    /// Register a custom attribute comparison with a capturing Rust closure.
    pub fn register_operator_with(
        &mut self,
        operator: &str,
        predicate: impl Fn(&[u16], &[u16], bool) -> bool + 'static,
    ) -> bool {
        let [symbol, b'='] = operator.as_bytes() else {
            return false;
        };
        let character = char::from(*symbol);
        let symbol = u16::from(*symbol);
        if !units::custom_operator_symbol(symbol) || self.syntax.operators.contains(character) {
            return false;
        }
        let Entry::Vacant(entry) = self.operators.entry(symbol) else {
            return false;
        };
        self.operator_expression.take();
        self.syntax.operators = self
            .syntax
            .operators
            .replacen("]=", &format!("{character}]="), 1);
        entry.insert(AttributeCallback::new(predicate));
        true
    }

    /// Register a single-character, right-to-left relationship between elements.
    ///
    /// Returns false for duplicates or punctuation that conflicts with CSS syntax.
    pub fn register_combinator(&mut self, symbol: char, resolver: CombinatorResolver) -> bool {
        self.register_combinator_symbol(
            symbol,
            &symbol.to_string(),
            CombinatorCallback::new(resolver),
        )
    }

    /// Register a single-character custom combinator with a capturing closure.
    pub fn register_combinator_with(
        &mut self,
        symbol: char,
        resolver: impl Fn(&Tree, Handle, &mut dyn FnMut(Handle) -> bool) -> bool + 'static,
    ) -> bool {
        self.register_combinator_symbol(
            symbol,
            &symbol.to_string(),
            CombinatorCallback::new(resolver),
        )
    }

    /// Register a combinator using NWSAPI's JavaScript registration-string form.
    ///
    /// The first non-`=` character is the selector symbol; for example, `"!="`
    /// registers `!`. Returns false when no symbol exists or the symbol is
    /// already registered or conflicts with CSS syntax.
    pub fn register_combinator_name(&mut self, name: &str, resolver: CombinatorResolver) -> bool {
        self.register_combinator_name_with(name, resolver)
    }

    /// Register a JS-style combinator name with a capturing Rust closure.
    pub fn register_combinator_name_with(
        &mut self,
        name: &str,
        resolver: impl Fn(&Tree, Handle, &mut dyn FnMut(Handle) -> bool) -> bool + 'static,
    ) -> bool {
        let Some(symbol) = name.chars().find(|&character| character != '=') else {
            return false;
        };
        self.register_combinator_symbol(symbol, name, CombinatorCallback::new(resolver))
    }

    fn register_combinator_symbol(
        &mut self,
        symbol: char,
        name: &str,
        resolver: CombinatorCallback,
    ) -> bool {
        if !super::custom_combinator_symbol(symbol) {
            return false;
        }
        let OrderedEntry::Vacant(entry) = self.combinators.entry(symbol) else {
            return false;
        };
        self.syntax.combinators = self
            .syntax
            .combinators
            .replacen("](", &format!("{symbol}]("), 1)
            .replacen("])", &format!("{symbol}])"), 1);
        entry.insert((name.to_owned(), resolver));
        true
    }

    /// Enable NWSAPI's optional jQuery selector examples.
    ///
    /// Returns false when already enabled or when a registered name conflicts.
    /// Set filters may be chained on the subject of each selector-list branch.
    /// Chained filters run in source order and share that branch's candidate index.
    /// Visibility follows the host-reported [`SelectorState::HasOffsetDimensions`](crate::SelectorState::HasOffsetDimensions).
    pub fn register_jquery(&mut self) -> bool {
        if self.jquery
            || self
                .selectors
                .values()
                .any(|entry| super::jquery::is_name(&entry.pseudo))
        {
            return false;
        }
        self.jquery = true;
        true
    }

    /// Compile a selector using the registered extensions.
    ///
    /// # Errors
    ///
    /// Returns a selector syntax error for invalid input or an unregistered
    /// pseudo-class in an unforgiving context.
    pub fn compile(&self, source: &str) -> Result<CompiledSelector, SelectorError> {
        self.compile_with_forgiving(source, true)
    }

    pub fn compile_with_forgiving(
        &self,
        source: &str,
        forgiving: bool,
    ) -> Result<CompiledSelector, SelectorError> {
        let selectors = cascade::parse_with_extensions(source, self, forgiving)?;
        Ok(self.prepare(selectors, source.len()))
    }

    pub(super) fn compile_for_adapter(
        &self,
        source: &str,
        forgiving: bool,
    ) -> Result<CompiledSelector, SelectorError> {
        let mut selectors = cascade::parse_with_extensions(source, self, forgiving)?;
        if source.contains("||") {
            selectors
                .iter_mut()
                .for_each(super::adapter::apply_v3_column_rules);
        }
        Ok(self.prepare(selectors, source.len()))
    }

    fn prepare(&self, selectors: Vec<Complex>, source_bytes: usize) -> CompiledSelector {
        let prepared = if self.jquery {
            PreparedList::with_jquery(selectors, source_bytes)
        } else {
            PreparedList::new(selectors, source_bytes)
        };
        CompiledSelector(Rc::new(prepared))
    }

    /// Compile a relative selector list for an existence query with registered extensions.
    ///
    /// # Errors
    ///
    /// Returns a selector syntax error if the relative selector list is invalid.
    pub fn compile_relative(
        &self,
        source: &str,
    ) -> Result<CompiledRelativeSelector, SelectorError> {
        self.compile_relative_with_forgiving(source, true)
    }

    pub(super) fn compile_relative_with_forgiving(
        &self,
        source: &str,
        forgiving: bool,
    ) -> Result<CompiledRelativeSelector, SelectorError> {
        let normalized = super::source::normalize_str(source, super::source::Mode::Dom);
        let wrapped = format!(":has({normalized})");
        let invalid = SelectorError::Invalid("expected a relative selector list");
        if super::split_top_level_commas(&wrapped).len() != 1 {
            return Err(invalid);
        }
        let mut selectors = cascade::parse_with_extensions(&wrapped, self, forgiving)?;
        if selectors.len() != 1 {
            return Err(invalid);
        }
        let selector = selectors.pop().ok_or(invalid.clone())?;
        let compound = selector.first;
        if !selector.rest.is_empty()
            || compound.tag.is_some()
            || compound.id.is_some()
            || !compound.attrs.is_empty()
            || !compound.classes.is_empty()
            || compound.namespace != super::TypeNamespace::Default
        {
            return Err(invalid);
        }
        let mut pseudos = compound.pseudos;
        match (pseudos.len(), pseudos.pop()) {
            (1, Some(Pseudo::Has(relative))) => Ok(CompiledRelativeSelector(relative.into())),
            _ => Err(invalid),
        }
    }

    fn bind_combinator(&self, combinator: &mut super::Combinator) {
        if let super::Combinator::Custom(symbol, resolve) = combinator {
            *resolve = self
                .combinators
                .get(symbol)
                .map(|(_, resolver)| resolver.clone());
        }
    }

    pub(super) fn bind(&self, complex: &mut Complex) -> Result<(), SelectorError> {
        self.bind_complex(complex, true, true)
    }

    pub(super) fn bind_stylesheet(&self, complex: &mut Complex) -> Result<(), SelectorError> {
        self.bind_complex(complex, true, false)
    }

    fn allows_operator(&self, attribute: &super::AttrMatch) -> bool {
        use super::AttrMatch;
        if self.syntax.operators == "[~*^$|]=|=" {
            return !matches!(attribute, AttrMatch::Units(record) if self.operators.contains_key(&record.operator()));
        }
        let symbol = match attribute {
            AttrMatch::Present => return true,
            AttrMatch::Equals(_) => u16::from(b'='),
            AttrMatch::Prefix(_) => u16::from(b'^'),
            AttrMatch::Suffix(_) => u16::from(b'$'),
            AttrMatch::Includes(_) => u16::from(b'~'),
            AttrMatch::Substr(_) => u16::from(b'*'),
            AttrMatch::Units(record) => record.operator(),
        };
        if symbol == 0 {
            return true;
        }
        let mut token = String::new();
        if symbol != u16::from(b'=') {
            let Some(ch) = char::from_u32(u32::from(symbol)) else {
                return false;
            };
            token.push(ch);
        }
        token.push('=');
        self.operator_expression
            .get_or_init(|| regress::Regex::new(&format!("^(?:{})$", self.syntax.operators)).ok())
            .as_ref()
            .is_some_and(|expression| expression.find(&token).is_some())
    }

    fn bind_complex(
        &self,
        complex: &mut Complex,
        allow_positions: bool,
        bind_pseudo_elements: bool,
    ) -> Result<(), SelectorError> {
        for (combinator, _) in &mut complex.rest {
            self.bind_combinator(combinator);
        }
        let subject = complex.rest.len();
        for (index, compound) in std::iter::once(&mut complex.first)
            .chain(complex.rest.iter_mut().map(|(_, compound)| compound))
            .enumerate()
        {
            let allow_position = allow_positions && index == subject;
            if bind_pseudo_elements {
                self.bind_pseudo_element_extension(compound);
            }
            for attr in &mut compound.attrs {
                if !self.allows_operator(&attr.m) {
                    return Err(SelectorError::Invalid("attribute operator excluded by CFG"));
                }
                if let super::AttrMatch::Units(m) = &mut attr.m {
                    m.bind_operator(&self.operators);
                }
            }
            let mut jquery_pseudos = Vec::new();
            for (pseudo_index, pseudo) in compound.pseudos.iter_mut().enumerate() {
                if cascade::is_pseudo_element_marker(pseudo) {
                    break;
                }
                self.bind_pseudo(pseudo, allow_position, bind_pseudo_elements)?;
                if allow_position && matches!(pseudo, Pseudo::JqueryPosition(_)) {
                    jquery_pseudos.push(pseudo_index);
                }
            }
            for index in jquery_pseudos {
                compound.order.push(super::CompoundPart::Pseudo(index));
            }
        }
        Ok(())
    }

    fn matching_selector(
        &self,
        name: &str,
        form: SelectorForm,
        has_argument: bool,
    ) -> Option<&RegisteredSelector> {
        self.selectors.values().find(|entry| {
            entry.pseudo == name
                && (entry.form == SelectorForm::Either || entry.form == form)
                && entry.arity.accepts(has_argument)
        })
    }

    fn bind_pseudo_element_extension(&self, compound: &mut super::Compound) {
        let mut index = 0;
        while index + 1 < compound.pseudos.len() {
            let (name, has_argument) =
                match (&compound.pseudos[index], &compound.pseudos[index + 1]) {
                    (Pseudo::Unknown(marker), Pseudo::Unknown(extension))
                        if marker.name.is_empty() && marker.arg.is_none() =>
                    {
                        (extension.name.to_ascii_lowercase(), extension.arg.is_some())
                    }
                    _ => {
                        index += 1;
                        continue;
                    }
                };
            let Some(entry) =
                self.matching_selector(&name, SelectorForm::PseudoElement, has_argument)
            else {
                index += 1;
                continue;
            };
            let Pseudo::Unknown(extension) = compound.pseudos.remove(index + 1) else {
                unreachable!("matched pseudo-element name is an unknown pseudo");
            };
            let arg = extension.arg;
            compound.pseudos[index] = Pseudo::Extension(entry.callback.clone(), arg);
            compound.order.retain(
                |part| !matches!(part, super::CompoundPart::Pseudo(pseudo) if *pseudo == index + 1),
            );
            for part in &mut compound.order {
                if let super::CompoundPart::Pseudo(pseudo) = part {
                    if *pseudo > index + 1 {
                        *pseudo -= 1;
                    }
                }
            }
        }
    }

    fn bind_pseudo(
        &self,
        pseudo: &mut Pseudo,
        allow_position: bool,
        bind_pseudo_elements: bool,
    ) -> Result<(), SelectorError> {
        match pseudo {
            Pseudo::Unknown(unknown) => {
                let name = unknown.name.to_ascii_lowercase();
                if self.jquery && super::jquery::is_name(&name) {
                    if let Some(test) = super::jquery::parse(&name, unknown.arg.as_deref()) {
                        if allow_position || !matches!(test, Pseudo::JqueryPosition(_)) {
                            *pseudo = test;
                        }
                    }
                    return Ok(());
                }
                if let Some(entry) =
                    self.matching_selector(&name, SelectorForm::PseudoClass, unknown.arg.is_some())
                {
                    *pseudo = Pseudo::Extension(entry.callback.clone(), unknown.arg.take());
                }
            }
            Pseudo::Host {
                selectors: Some(list),
                ..
            }
            | Pseudo::Is(list)
            | Pseudo::Matches(list)
            | Pseudo::Where(list)
            | Pseudo::Not(list)
            | Pseudo::WebkitAny(list)
            | Pseudo::NthChildOf(_, _, list)
            | Pseudo::NthLastChildOf(_, _, list) => {
                for arm in list {
                    self.bind_complex(arm, false, bind_pseudo_elements)?;
                }
            }
            Pseudo::Has(list) => {
                for relative in list {
                    self.bind_combinator(&mut relative.combinator);
                    self.bind_complex(&mut relative.complex, false, bind_pseudo_elements)?;
                }
            }
            Pseudo::HasSlotted(Some(selector), _) => {
                self.bind_complex(selector, false, bind_pseudo_elements)?;
            }
            _ => {}
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn featured(tree: &Tree, node: Handle, _: Option<&str>) -> bool {
        tree.has_attribute(node, "data-featured")
    }

    fn rating(tree: &Tree, node: Handle, argument: Option<&str>) -> bool {
        tree.get_attribute(node, "data-rating") == argument.map(str::trim)
    }

    fn attribute_never_matches(_: &[u16], _: &[u16], _: bool) -> bool {
        false
    }

    fn custom_combinator(_: &Tree, node: Handle, visit: &mut dyn FnMut(Handle) -> bool) -> bool {
        visit(node)
    }

    #[test]
    fn replacing_registry_entries_only_changes_new_plans() {
        let tree = Tree::parse("<main><p></p></main>");
        let mut registry = SelectorExtensions::default();
        registry.register_selector("Picked", SelectorArity::Flag, |_, _, _| true);
        registry.register_combinator_name("!=", |tree, node, visit| {
            tree.parent(node).is_some_and(visit)
        });
        assert!(registry.selector("Picked").is_some());
        assert!(registry.selector("picked").is_none());
        assert!(registry.combinator("!=").is_some());
        assert!(registry.combinator("!").is_none());
        let original = registry.compile("main ! p:picked").unwrap();
        assert!(registry.replace_selector_with("Picked", |_, _, _| false));
        assert_eq!(
            registry
                .compile("main ! p:picked")
                .unwrap()
                .select(&tree, None),
            []
        );
        assert!(registry.replace_combinator_with("!=", |_, _, _| false));
        assert_eq!(
            registry.compile("main ! p").unwrap().select(&tree, None),
            []
        );
        assert_eq!(original.select(&tree, None).len(), 1);
    }

    #[test]
    fn deleting_registry_entries_preserves_compiled_plans_and_public_keys() {
        let tree = Tree::parse("<main><p></p></main>");
        let mut registry = SelectorExtensions::default();
        registry.register_selector("Picked", SelectorArity::Flag, |_, _, _| true);
        registry.register_combinator_name("!=", |tree, node, visit| {
            tree.parent(node).is_some_and(visit)
        });
        let original = registry.compile("main ! p:picked").unwrap();
        let syntax = registry.syntax().clone();
        assert!(!registry.remove_selector("picked"));
        assert!(!registry.remove_combinator("!"));
        assert!(registry.remove_selector("Picked"));
        assert!(registry.compile(":picked").is_err());
        assert!(registry.remove_combinator("!="));
        assert!(registry.compile("main ! p").is_err());
        assert_eq!(registry.syntax(), &syntax);
        assert!(!registry.has_custom_resolvers());
        assert_eq!(original.select(&tree, None).len(), 1);
        assert!(registry.register_selector("Picked", SelectorArity::Flag, |_, _, _| false));
        assert_eq!(
            registry.compile(":picked").unwrap().select(&tree, None),
            Vec::new()
        );
    }

    #[test]
    fn numeric_registry_keys_follow_javascript_property_order() {
        let tree = Tree::parse("<p></p>");
        let mut registry = SelectorExtensions::default();
        for key in ["01", "4294967295", "9", "+1", "2", "4294967294", "0"] {
            assert!(registry.register_selector_key(
                key,
                "marked",
                SelectorArity::Flag,
                SelectorForm::Either,
                move |_, _, _| key == "0"
            ));
        }
        let keys: Vec<_> = registry.selectors().map(|(key, _, _)| key).collect();
        assert_eq!(
            keys,
            ["0", "2", "9", "4294967294", "01", "4294967295", "+1"]
        );
        assert_eq!(
            registry
                .compile("p:marked")
                .unwrap()
                .select(&tree, None)
                .len(),
            1
        );
        assert!(registry.remove_selector("0"));
        assert_eq!(
            registry.compile("p:marked").unwrap().select(&tree, None),
            Vec::new()
        );
    }

    #[test]
    fn identity_combinators_match_both_sides_on_one_node() {
        let tree = Tree::parse("<main><p></p><p></p><i></i></main>");
        let mut registry = SelectorExtensions::default();
        assert!(registry.register_combinator('!', |_, candidate, visit| visit(candidate)));
        let paragraphs = registry.compile("p").unwrap().select(&tree, None);
        for source in ["p!p", "p!p!p"] {
            assert_eq!(
                registry.compile(source).unwrap().select(&tree, None),
                paragraphs
            );
        }
        assert_eq!(
            registry.compile("main!p").unwrap().select(&tree, None),
            Vec::new()
        );
    }

    #[test]
    fn overlapping_plugin_keys_bind_in_registration_order() {
        let tree = Tree::parse("<p></p>");
        let mut registry = SelectorExtensions::default();
        registry.register_selector_key(
            "first",
            "picked",
            SelectorArity::Flag,
            SelectorForm::Either,
            |_, _, _| false,
        );
        registry.register_selector_key(
            "second",
            "picked",
            SelectorArity::Optional,
            SelectorForm::Either,
            |_, _, _| true,
        );
        for prefix in ["p:", "p::"] {
            assert_eq!(
                registry
                    .compile(&format!("{prefix}picked"))
                    .unwrap()
                    .select(&tree, None),
                Vec::new()
            );
            assert_eq!(
                registry
                    .compile(&format!("{prefix}picked(x)"))
                    .unwrap()
                    .select(&tree, None)
                    .len(),
                1
            );
        }
        registry.remove_selector("first");
        assert_eq!(
            registry
                .compile("p:picked")
                .unwrap()
                .select(&tree, None)
                .len(),
            1
        );
    }

    #[test]
    fn registry_keys_are_independent_of_css_pseudo_names() {
        let tree = Tree::parse("<p></p>");
        let mut registry = SelectorExtensions::default();
        let register = |registry: &mut SelectorExtensions, key, pseudo| {
            registry.register_selector_key(
                key,
                pseudo,
                SelectorArity::Flag,
                SelectorForm::PseudoClass,
                |_, _, _| true,
            )
        };
        assert!(register(&mut registry, "example:flag", "marked"));
        assert!(!register(&mut registry, "example:flag", "other"));
        assert!(registry.selector("example:flag").is_some());
        assert!(registry.selector("marked").is_none());
        let retained = registry.compile("p:marked").unwrap();
        assert!(registry.replace_selector_with("example:flag", |_, _, _| false));
        assert_eq!(
            registry.compile("p:marked").unwrap().select(&tree, None),
            Vec::new()
        );
        assert!(registry.remove_selector("example:flag"));
        assert!(registry.compile("p:marked").is_err());
        assert_eq!(retained.select(&tree, None).len(), 1);
    }

    #[test]
    fn plugins_can_restrict_pseudo_spelling() {
        let tree = Tree::parse("<p></p>");
        let mut registry = SelectorExtensions::default();
        registry.register_selector_form(
            "widget",
            SelectorArity::Flag,
            SelectorForm::PseudoElement,
            |_, _, _| true,
        );
        registry.register_selector_form(
            "marked",
            SelectorArity::Flag,
            SelectorForm::PseudoClass,
            |_, _, _| true,
        );
        for selector in ["p::widget", "p:marked"] {
            assert_eq!(
                registry
                    .compile(selector)
                    .unwrap()
                    .select(&tree, None)
                    .len(),
                1
            );
        }
        assert!(registry.compile("p:widget").is_err());
        assert!(registry
            .compile("p::marked")
            .map_or(true, |plan| plan.select(&tree, None).is_empty()));
    }

    #[test]
    fn editable_argument_rules_apply_to_classes_and_elements() {
        let tree = Tree::parse("<p id=x></p>");
        let mut registry = SelectorExtensions::default();
        registry.register_selector("Picked", SelectorArity::Optional, |_, _, arg| {
            arg.is_none() || arg == Some("yes")
        });
        let original = registry.compile("p::picked").unwrap();
        for prefix in ["p:", "p::"] {
            for (suffix, count) in [("picked", 1), ("picked(yes)", 1), ("picked(no)", 0)] {
                let plan = registry.compile(&format!("{prefix}{suffix}")).unwrap();
                assert_eq!(plan.select(&tree, None).len(), count);
            }
        }
        assert!(!registry.set_selector_arity("picked", SelectorArity::Function));
        assert!(registry.set_selector_arity("Picked", SelectorArity::Function));
        assert!(registry.compile("p:picked").is_err());
        assert!(registry.compile("p:picked(yes)").is_ok());
        assert_eq!(original.select(&tree, None).len(), 1);
    }

    #[test]
    fn registries_preserve_registration_order_and_public_spelling() {
        let mut registry = SelectorExtensions::default();
        for name in ["Zoo", "Alpha", "Middle"] {
            assert!(registry.register_selector(name, SelectorArity::Flag, |_, _, _| true));
        }
        for name in ["!=", "^"] {
            assert!(registry.register_combinator_name(name, |_, _, _| false));
        }
        assert_eq!(
            registry
                .selectors()
                .map(|(name, _, _)| name)
                .collect::<Vec<_>>(),
            ["Zoo", "Alpha", "Middle"]
        );
        assert_eq!(
            registry
                .combinators()
                .map(|(name, _)| name)
                .collect::<Vec<_>>(),
            ["!=", "^"]
        );
        assert!(registry.compile(":zoo").is_ok());
    }

    #[test]
    fn registries_expose_callable_resolvers_and_original_combinator_names() {
        let tree = Tree::parse("<main><p></p></main>");
        let p = tree.query_selector("p").unwrap();
        let main = tree.query_selector("main").unwrap();
        let mut registry = SelectorExtensions::default();
        registry.register_selector_with("picked", SelectorArity::Flag, move |_, node, _| node == p);
        registry.register_combinator_name_with("!=", |tree, node, visit| {
            tree.parent(node).is_some_and(visit)
        });
        let (name, arity, predicate) = registry.selectors().next().unwrap();
        assert_eq!((name, arity), ("picked", SelectorArity::Flag));
        assert!(predicate.matches(&tree, p, None));
        let (name, resolver) = registry.combinators().next().unwrap();
        assert_eq!(name, "!=");
        assert!(resolver.visit(&tree, p, &mut |node| node == main));
    }

    #[test]
    fn shadow_host_arguments_use_the_active_operator_grammar() {
        let mut registry = SelectorExtensions::default();
        registry.syntax_mut().operators = "=".into();
        for name in ["host", "host-context"] {
            assert!(registry.compile(&format!(":{name}([id=pick])")).is_ok());
            assert!(registry.compile(&format!(":{name}([id^=pi])")).is_err());
        }
    }

    #[test]
    fn cfg_operator_edits_apply_to_new_plans_and_nested_selectors() {
        let mut registry = SelectorExtensions::default();
        let tree = Tree::parse("<p id=pick></p>");
        let original = registry.compile("p[id^=pi]").unwrap();
        registry.syntax_mut().operators = "=".into();
        assert!(registry.compile("p[id^=pi]").is_err());
        assert!(registry.compile("p[id]").is_ok());
        assert!(registry.compile("p[id=pick]").is_ok());
        assert!(registry.compile("p:is([id^=pi], #pick)").is_err());
        assert_eq!(original.select(&tree, None).len(), 1);
        registry.syntax_mut().operators = "[~*^$|]=|=".into();
        assert!(registry.compile("p[id^=pi]").is_ok());
    }

    #[test]
    fn operator_registration_observes_edits_to_cfg() {
        let mut registry = SelectorExtensions::default();
        registry.syntax_mut().operators = "[~*^$|@]=|=".into();
        assert!(!registry.register_operator("@=", |_, _, _| true));
        assert!(!registry.has_custom_resolvers());
        registry.syntax_mut().operators = "[~*^$|]=|=".into();
        assert!(registry.register_operator("@=", |_, _, _| true));
        assert_eq!(registry.syntax().operators, "[~*^$|@]=|=");
        let tree = Tree::parse("<p data-code=x></p>");
        let plan = registry.compile("p[data-code@=other]").unwrap();
        assert_eq!(plan.select(&tree, None).len(), 1);
    }

    #[test]
    fn cfg_tracks_successful_registrations_in_order() {
        let mut registry = SelectorExtensions::default();
        assert!(registry.register_operator("@=", |_, _, _| true));
        assert!(registry.register_operator("!=", |_, _, _| true));
        assert!(!registry.register_operator("@=", |_, _, _| false));
        assert!(registry.register_combinator_name("!=", |_, _, _| false));
        assert!(!registry.register_combinator('!', |_, _, _| true));
        assert_eq!(registry.syntax().operators, "[~*^$|@!]=|=");
        assert_eq!(registry.syntax().combinators, r"[\x20\t>+~!](?=[^>+~!])");
    }

    #[test]
    fn custom_resolver_status_excludes_the_builtin_jquery_plugin() {
        let mut extensions = SelectorExtensions::default();
        assert!(!extensions.has_custom_resolvers());
        assert!(extensions.register_jquery());
        assert!(!extensions.has_custom_resolvers());
        assert!(extensions.register_selector("featured", SelectorArity::Flag, featured));
        assert!(extensions.has_custom_resolvers());

        let mut operators = SelectorExtensions::default();
        assert!(operators.register_operator("!=", attribute_never_matches));
        assert!(operators.has_custom_resolvers());

        let mut combinators = SelectorExtensions::default();
        assert!(combinators.register_combinator('!', custom_combinator));
        assert!(combinators.has_custom_resolvers());
    }

    #[test]
    fn registered_predicates_compose_and_read_live_trees() {
        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_selector("featured", SelectorArity::Flag, featured));
        assert!(extensions.register_selector("rating", SelectorArity::Function, rating));
        assert!(!extensions.register_selector("Featured", SelectorArity::Flag, featured));
        assert!(!extensions.register_selector("bad name", SelectorArity::Flag, featured));
        assert!(extensions.compile(":rating").is_err());
        assert!(extensions.compile(":featured(5)").is_err());
        assert!(extensions.compile("main > > :featured").is_err());

        let plan = extensions
            .compile(
                "main:has(> :FEATURED:rating( 5 )) > :is(:featured, :unregistered):not(:rating(2))",
            )
            .unwrap();
        drop(extensions);
        let mut tree = Tree::parse(
            "<main><p id=a data-featured data-rating=5></p><p id=b data-featured data-rating=2></p></main>",
        );
        let a = tree.get_element_by_id("a").unwrap();
        let b = tree.get_element_by_id("b").unwrap();
        assert!(tree.compile_selector(":featured").is_err());
        assert_eq!(plan.select(&tree, None), [a]);
        assert_eq!(plan.select(&tree, None), [a]);
        assert!(plan.matches(&tree, a));
        tree.remove_attribute(a, "data-featured");
        assert_eq!(plan.select(&tree, None), []);
        tree.set_attribute(b, "data-rating", "5");
        assert_eq!(plan.select(&tree, None), [b]);
    }

    #[test]
    fn registered_pseudo_element_resolvers_match_and_compose() {
        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_selector("featured", SelectorArity::Flag, featured));
        let tree = Tree::parse("<main><p id=featured data-featured></p><p id=plain></p></main>");
        let featured_node = tree.get_element_by_id("featured").unwrap();
        let plain_node = tree.get_element_by_id("plain").unwrap();

        let plan = extensions.compile("p::featured").unwrap();
        assert!(plan.matches(&tree, featured_node));
        assert!(!plan.matches(&tree, plain_node));
        assert_eq!(plan.select(&tree, None), [featured_node]);
        assert_eq!(
            extensions
                .compile("p:not(::featured)")
                .unwrap()
                .select(&tree, None),
            [plain_node]
        );
    }

    #[test]
    fn operators_compose_preserve_units_and_require_registration() {
        fn unequal(got: &[u16], want: &[u16], insensitive: bool) -> bool {
            if !insensitive {
                return got != want;
            }
            got.len() != want.len()
                || got.iter().zip(want).any(|(&a, &b)| {
                    let lower = |unit| {
                        if (65..=90).contains(&unit) {
                            unit + 32
                        } else {
                            unit
                        }
                    };
                    lower(a) != lower(b)
                })
        }
        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_operator("!=", unequal));
        assert!(extensions.register_operator(">=", |got, wanted, _| got >= wanted));
        assert!(!extensions.register_operator("!=", unequal));
        assert!(!extensions.register_operator("~=", unequal));
        assert!(extensions.compile("[title!=]").is_err());
        assert!(extensions.compile("[title?=x]").is_err());

        let mut tree =
            Tree::parse("<p id=a title=TEST data-n=3></p><p id=b title=else data-n=1></p><p></p>");
        let a = tree.get_element_by_id("a").unwrap();
        let b = tree.get_element_by_id("b").unwrap();
        assert!(tree.compile_selector("[title!=test]").is_err());
        let plan = extensions
            .compile("p:is([title!=test i], [data-n>=\"2\"])")
            .unwrap();
        assert_eq!(plan.select(&tree, None), [a, b]);
        let plan = extensions.compile("p[title!=test i]").unwrap();
        assert_eq!(plan.select(&tree, None), [b]);
        tree.set_attribute_utf16(a, "title", &[0xd800]);
        let plan = extensions.compile("p[title!='�']").unwrap();
        assert_eq!(plan.select(&tree, None), [a, b]);
        let wildcard = extensions.compile("p[*|title!='�']").unwrap();
        assert_eq!(wildcard.select(&tree, None), [a, b]);
    }

    #[test]
    fn custom_combinators_can_cross_subtrees_in_relative_queries() {
        fn points_to(tree: &Tree, right: Handle, visit: &mut dyn FnMut(Handle) -> bool) -> bool {
            tree.get_attribute(right, "data-points-to")
                .and_then(|id| tree.get_element_by_id(id))
                .is_some_and(visit)
        }
        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_combinator('!', points_to));
        assert!(extensions.register_combinator('^', points_to));
        assert!(!extensions.register_combinator('!', points_to));
        assert!(!extensions.register_combinator('>', points_to));
        assert!(extensions.compile("main ! ! span").is_err());
        assert!(extensions.compile("main !").is_err());

        let mut tree = Tree::parse(
            "<main id=anchor><i id=inside></i></main><aside><span class=target data-points-to=anchor data-detail=inside></span></aside>",
        );
        let anchor = tree.get_element_by_id("anchor").unwrap();
        let target = tree.query_selector(".target").unwrap();
        assert!(tree.compile_selector("main ! .target").is_err());
        let plan = extensions.compile("main ! .target").unwrap();
        assert_eq!(plan.select(&tree, None), [target]);
        assert_eq!(
            extensions
                .compile("main ^ .target")
                .unwrap()
                .select(&tree, None),
            [target]
        );
        assert_eq!(
            extensions
                .compile("main ! .t\\61 rget")
                .unwrap()
                .select(&tree, None),
            [target]
        );
        assert!(extensions
            .compile("main:has(! .target)")
            .unwrap()
            .matches(&tree, anchor));
        let relative = extensions.compile_relative("! .target, > strong").unwrap();
        assert!(relative.exists(&tree, anchor));
        tree.set_attribute(target, "data-points-to", "inside");
        assert!(!relative.exists(&tree, anchor));
        assert!(extensions
            .compile_relative("> i ! .target")
            .unwrap()
            .exists(&tree, anchor));
        assert!(!plan.exists(&tree, None));
    }

    #[test]
    fn combinator_registration_uses_the_first_non_equals_symbol() {
        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_combinator_name("!=", custom_combinator));
        let tree = Tree::parse("<main></main>");
        assert_eq!(
            extensions
                .compile("main ! main")
                .unwrap()
                .select(&tree, None),
            [tree.query_selector("main").unwrap()]
        );
        assert!(!extensions.register_combinator('!', custom_combinator));
        assert!(!extensions.register_combinator_name("===", custom_combinator));
        assert!(!extensions.register_combinator_name(">=", custom_combinator));
        assert!(!extensions.register_combinator_name("ab", custom_combinator));
    }

    #[test]
    fn capturing_rust_resolvers_are_retained_by_compiled_plans() {
        let mut extensions = SelectorExtensions::default();
        let expected_tier = String::from("gold");
        assert!(extensions.register_selector_with(
            "featured",
            SelectorArity::Flag,
            move |tree, node, _| {
                tree.get_attribute(node, "data-tier") == Some(expected_tier.as_str())
            },
        ));
        let required_suffix = String::from("ok");
        assert!(
            extensions.register_operator_with("@=", move |got, wanted, _| {
                got == wanted && String::from_utf16_lossy(got).ends_with(&required_suffix)
            })
        );
        let anchor_id = String::from("anchor");
        assert!(
            extensions.register_combinator_name_with("!=", move |tree, right, visit| {
                tree.get_attribute(right, "data-target") == Some(anchor_id.as_str())
                    && tree.get_element_by_id(&anchor_id).is_some_and(visit)
            },)
        );

        let plan = extensions
            .compile("main:featured ! span[data-code@=\"ok\"]")
            .unwrap();
        drop(extensions);
        let tree = Tree::parse(
            "<main id=anchor data-tier=gold></main><span id=hit data-target=anchor data-code=ok></span><span data-target=anchor data-code=no></span>",
        );
        assert_eq!(
            plan.select(&tree, None),
            [tree.get_element_by_id("hit").unwrap()]
        );
    }

    #[test]
    fn escaped_selector_names_register_by_their_decoded_identifier() {
        fn featured(tree: &Tree, node: Handle, _: Option<&str>) -> bool {
            tree.has_attribute(node, "data-featured")
        }

        let mut extensions = SelectorExtensions::default();
        assert!(extensions.register_selector(r"f\65 atured", SelectorArity::Flag, featured));
        assert!(!extensions.register_selector("featured", SelectorArity::Flag, featured));
        assert!(!extensions.register_selector(r"h\6f ver", SelectorArity::Flag, featured));
        let tree =
            Tree::parse("<article id=hit data-featured></article><article id=miss></article>");
        let hit = tree.get_element_by_id("hit").unwrap();
        let plan = extensions.compile(r"article:f\65 atured").unwrap();
        assert_eq!(plan.select(&tree, None), [hit]);
    }

    #[test]
    fn builtins_and_pseudo_elements_keep_their_meaning() {
        let mut extensions = SelectorExtensions::default();
        assert!(!extensions.register_selector("first-child", SelectorArity::Flag, featured));
        assert!(!extensions.register_selector("hover", SelectorArity::Flag, featured));
        assert!(!extensions.register_selector("nth-child", SelectorArity::Flag, featured));
        assert!(!extensions.register_selector("before", SelectorArity::Flag, featured));
        assert!(extensions.register_selector("badge", SelectorArity::Flag, featured));
        let tree = Tree::parse("<main><p id=a></p><p data-featured></p></main>");
        let a = tree.get_element_by_id("a").unwrap();
        let plan = extensions
            .compile("p:first-child, p:hover, p::before")
            .unwrap();
        assert_eq!(plan.select(&tree, None), [a]);
        let featured_node = tree.query_selector("[data-featured]").unwrap();
        assert_eq!(
            extensions.compile("p::badge").unwrap().select(&tree, None),
            [featured_node]
        );
        assert!(extensions.compile(":not(:unregistered)").is_err());
    }
}
