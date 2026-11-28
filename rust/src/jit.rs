//! Native code generation for a subset of class selectors on AArch64 and x86-64.

pub mod background;
mod chain;
pub use chain::{Combinator, CompiledList, Host};
use cranelift_codegen::ir::{types, AbiParam, InstBuilder, UserFuncName};
use cranelift_frontend::{FunctionBuilder, FunctionBuilderContext};
use cranelift_jit::{JITBuilder, JITModule};
use cranelift_module::{default_libcall_names, Linkage, Module, ModuleError};
use std::any::Any;
use std::collections::HashMap;
use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe};

const CACHE_CAPACITY: usize = 64;
const MAX_SELECTOR_BYTES: usize = 1024;

/// A document-independent cache for native matchers. The host supplies live
/// class checks and parent links each time a matcher runs.
#[derive(Default)]
pub struct SelectorCache {
    entries: HashMap<String, CompiledSelector>,
}

impl SelectorCache {
    /// Compiles `.class` or `.parent > .child` with unescaped ASCII class names.
    /// Returns `Ok(None)` for selectors outside that subset so the host can
    /// delegate to its usual parser and matcher.
    ///
    /// # Errors
    ///
    /// Returns a code generation error if Cranelift cannot compile the matcher.
    pub fn compile(&mut self, source: &str) -> Result<Option<&CompiledSelector>, Box<ModuleError>> {
        if !self.entries.contains_key(source) {
            let Some(selector) = CompiledSelector::compile(source)? else {
                return Ok(None);
            };
            if self.entries.len() == CACHE_CAPACITY {
                self.entries.clear();
            }
            self.entries.insert(source.to_owned(), selector);
        }
        Ok(self.entries.get(source))
    }
}

fn parse(source: &str) -> Option<Vec<Box<str>>> {
    if source.len() > MAX_SELECTOR_BYTES {
        return None;
    }
    if let Some((parent, child)) = source.split_once('>') {
        Some(vec![class_name(child)?.into(), class_name(parent)?.into()])
    } else {
        Some(vec![class_name(source)?.into()])
    }
}

fn class_name(compound: &str) -> Option<&str> {
    let name = compound
        .trim_matches([' ', '\t', '\n', '\r', '\x0c'])
        .strip_prefix('.')?;
    let start = name.strip_prefix('-').unwrap_or(name);
    if !start.as_bytes().first().is_some_and(|byte| {
        byte.is_ascii_alphabetic() || *byte == b'_' || (*byte == b'-' && start != name)
    }) || !name
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return None;
    }
    Some(name)
}

type Matcher = unsafe extern "C" fn(*mut CallState<'_>) -> u32;

/// Owns the executable code and the class names embedded in it.
pub struct CompiledSelector {
    matcher: Matcher,
    _module: CodeMemory,
    _classes: Vec<Box<str>>,
}

// Cranelift leaves executable memory allocated unless free_memory is called.
struct CodeMemory(Option<JITModule>);

impl Drop for CodeMemory {
    fn drop(&mut self) {
        if let Some(module) = self.0.take() {
            // SAFETY: Callers borrow the synchronous owner or hold a worker lease.
            // The worker drops its owner only after the lease is released.
            unsafe { module.free_memory() };
        }
    }
}

impl CompiledSelector {
    /// Generates a matcher for a single class or a pair of direct parent and child classes.
    /// Returns `Ok(None)` for other syntax.
    ///
    /// # Errors
    ///
    /// Returns Cranelift's error when code generation fails.
    pub fn compile(source: &str) -> Result<Option<Self>, Box<ModuleError>> {
        parse(source).map(Self::new).transpose()
    }

    fn new(classes: Vec<Box<str>>) -> Result<Self, Box<ModuleError>> {
        let mut memory = CodeMemory(Some(JITModule::new(JITBuilder::new(
            default_libcall_names(),
        )?)));
        let module = memory.0.as_mut().expect("module is initialized");
        let mut context = module.make_context();
        let pointer = module.target_config().pointer_type();
        context.func.signature.params.push(AbiParam::new(pointer));
        context
            .func
            .signature
            .returns
            .push(AbiParam::new(types::I32));
        let id = module.declare_function("matches", Linkage::Local, &context.func.signature)?;
        context.func.name = UserFuncName::user(0, id.as_u32());

        let mut step_signature = module.make_signature();
        for _ in 0..3 {
            step_signature.params.push(AbiParam::new(pointer));
        }
        step_signature.returns.push(AbiParam::new(types::I32));

        let mut builder_context = FunctionBuilderContext::new();
        let mut builder = FunctionBuilder::new(&mut context.func, &mut builder_context);
        let step_signature = builder.import_signature(step_signature);
        let entry = builder.create_block();
        let failure = builder.create_block();
        builder.append_block_params_for_function_params(entry);
        builder.switch_to_block(entry);
        let state = builder.block_params(entry)[0];
        let callback = builder
            .ins()
            .iconst(pointer, run_step as *const () as usize as i64);
        let zero_ptr = builder.ins().iconst(pointer, 0);
        for (index, class) in classes.iter().enumerate() {
            if index > 0 {
                let call = builder.ins().call_indirect(
                    step_signature,
                    callback,
                    &[state, zero_ptr, zero_ptr],
                );
                let parent_found = builder.inst_results(call)[0];
                let next = builder.create_block();
                builder.ins().brif(parent_found, next, &[], failure, &[]);
                builder.switch_to_block(next);
            }
            let name = builder
                .ins()
                .iconst(pointer, class.as_ptr().expose_provenance() as i64);
            let len = builder.ins().iconst(pointer, class.len() as i64);
            let call = builder
                .ins()
                .call_indirect(step_signature, callback, &[state, name, len]);
            let found = builder.inst_results(call)[0];
            let next = builder.create_block();
            builder.ins().brif(found, next, &[], failure, &[]);
            builder.switch_to_block(next);
        }

        let matched = builder.ins().iconst(types::I32, 1);
        builder.ins().return_(&[matched]);
        builder.switch_to_block(failure);
        let unmatched = builder.ins().iconst(types::I32, 0);
        builder.ins().return_(&[unmatched]);
        builder.seal_all_blocks();
        builder.finalize();

        module.define_function(id, &mut context)?;
        module.finalize_definitions()?;
        // SAFETY: The finalized entry point has the host C calling convention
        // with one pointer parameter and a u32 return, matching Matcher.
        let matcher =
            unsafe { std::mem::transmute::<*const u8, Matcher>(module.get_finalized_function(id)) };
        Ok(Self {
            matcher,
            _module: memory,
            _classes: classes,
        })
    }

    /// Evaluates the generated matcher against a live node. The host's parent
    /// callback must stop at the appropriate selector traversal boundary.
    pub fn matches<H: Copy>(
        &self,
        node: H,
        has_class: impl FnMut(H, &str) -> bool,
        parent: impl FnMut(H) -> Option<H>,
    ) -> bool {
        match_class(self.matcher, node, has_class, parent)
    }
}

/// Finalized class matcher whose allocation is kept on the compiler thread.
pub struct BackgroundClass {
    matcher: Matcher,
    _lease: background::Lease,
}

impl BackgroundClass {
    pub fn matches<H: Copy>(
        &self,
        node: H,
        has_class: impl FnMut(H, &str) -> bool,
        parent: impl FnMut(H) -> Option<H>,
    ) -> bool {
        match_class(self.matcher, node, has_class, parent)
    }
}

fn match_class<H: Copy>(
    matcher: Matcher,
    mut node: H,
    mut has_class: impl FnMut(H, &str) -> bool,
    mut parent: impl FnMut(H) -> Option<H>,
) -> bool {
    let mut step = |class: Option<&str>| {
        if let Some(class) = class {
            return has_class(node, class);
        }
        if let Some(ancestor) = parent(node) {
            node = ancestor;
            return true;
        }
        false
    };
    let mut state = CallState {
        step: &mut step,
        unwind: None,
    };
    // SAFETY: The calling wrapper keeps the code and class data alive. The
    // callback uses this state only during the synchronous call.
    let matched = unsafe { matcher(&mut state) };
    if let Some(payload) = state.unwind {
        resume_unwind(payload);
    }
    matched != 0
}

struct CallState<'a> {
    step: &'a mut dyn FnMut(Option<&str>) -> bool,
    unwind: Option<Box<dyn Any + Send>>,
}

extern "C" fn run_step(state: *mut CallState<'_>, name: *const u8, len: usize) -> u32 {
    // SAFETY: The entry point forwards the caller's live, exclusive state
    // pointer. The generated code invokes callbacks sequentially.
    let state = unsafe { &mut *state };
    let class = if len == 0 {
        None
    } else {
        // SAFETY: The generated code embeds the address and exact byte length
        // of a Box<str> kept alive by CompiledSelector.
        Some(unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(name, len)) })
    };
    match catch_unwind(AssertUnwindSafe(|| (state.step)(class))) {
        Ok(result) => u32::from(result),
        Err(payload) => {
            // Returning false takes the generated failure path before rethrowing.
            state.unwind = Some(payload);
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::SelectorCache;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[test]
    fn compiles_and_reuses_machine_code() {
        let mut cache = SelectorCache::default();
        let names = ["parent", "child", "child"];
        let parents = [None, Some(0), None];
        let has_class = |node: usize, name: &str| names[node] == name;
        let parent = |node: usize| parents[node];

        let matcher = cache.compile(".parent > .child").unwrap().unwrap();
        let entry = matcher.matcher as usize;
        assert!(matcher.matches(1, has_class, parent));
        assert!(!matcher.matches(2, has_class, parent));
        assert!(!matcher.matches(0, has_class, |_| panic!(
            "parent traversal after failed guard"
        )));
        assert!(catch_unwind(AssertUnwindSafe(|| {
            matcher.matches(1, |_, _| panic!("host callback"), parent);
        }))
        .is_err());
        assert_eq!(
            cache.compile(".parent > .child").unwrap().unwrap().matcher as usize,
            entry,
        );
        assert!(cache
            .compile(".child")
            .unwrap()
            .unwrap()
            .matches(2, has_class, parent));
        assert!(!cache
            .compile(".other")
            .unwrap()
            .unwrap()
            .matches(2, has_class, parent));
        for unsupported in [".a .b", ".a > .b > .c", ".a, .b", ".1", ".-1", r".b\+c"] {
            assert!(
                cache.compile(unsupported).unwrap().is_none(),
                "{unsupported}"
            );
        }
    }
}
