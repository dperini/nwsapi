//! Generate right-to-left selector traversal over a host DOM.

use super::{background, CodeMemory};
use cranelift_codegen::ir::{types, AbiParam, BlockArg, FuncRef, InstBuilder, Type, UserFuncName};
use cranelift_frontend::{FunctionBuilder, FunctionBuilderContext};
use cranelift_jit::{JITBuilder, JITModule};
use cranelift_module::{default_libcall_names, FuncId, Linkage, Module, ModuleError};
use std::any::Any;
use std::num::NonZeroUsize;
use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe};

/// How the current compound relates to the compound to its left.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum Combinator {
    Child,
    Descendant,
    Adjacent,
    GeneralSibling,
}

impl Combinator {
    fn operation(self) -> i64 {
        match self {
            Self::Child | Self::Descendant => 1,
            Self::Adjacent | Self::GeneralSibling => 2,
        }
    }

    fn backtracks(self) -> bool {
        matches!(self, Self::Descendant | Self::GeneralSibling)
    }
}

/// Access to one stable DOM snapshot during matching.
pub trait Host {
    /// Test the compound at `position` in selector-list arm `arm`.
    /// Positions are numbered left to right, starting at zero.
    fn test(&mut self, node: NonZeroUsize, arm: usize, position: usize) -> bool;
    fn parent(&mut self, node: NonZeroUsize) -> Option<NonZeroUsize>;
    fn previous_element_sibling(&mut self, node: NonZeroUsize) -> Option<NonZeroUsize>;
}

type Entry = unsafe extern "C" fn(*mut State<'_>, usize) -> u32;

/// Native matcher for a selector list. Hosts use their own compound predicates.
pub struct CompiledList {
    entry: Option<Entry>,
    _memory: Option<CodeMemory>,
}

impl CompiledList {
    /// Compiles the combinators of each arm in left-to-right order.
    /// An arm with zero combinators tests a single compound. A list with no
    /// arms never matches. Returns `Ok(None)` beyond the native code size limit.
    ///
    /// # Errors
    ///
    /// Returns Cranelift's error when code generation fails.
    pub fn compile(arms: &[Vec<Combinator>]) -> Result<Option<Self>, Box<ModuleError>> {
        const COMPOUND_LIMIT: usize = 32;
        if arms.is_empty() {
            return Ok(Some(Self {
                entry: None,
                _memory: None,
            }));
        }
        if arms.len() > COMPOUND_LIMIT
            || arms
                .iter()
                .map(|arm| arm.len().saturating_add(1))
                .fold(0_usize, usize::saturating_add)
                > COMPOUND_LIMIT
        {
            return Ok(None);
        }

        let mut memory = CodeMemory(Some(JITModule::new(JITBuilder::with_flags(
            &[("opt_level", "speed")],
            default_libcall_names(),
        )?)));
        let module = memory.0.as_mut().expect("module is initialized");
        let pointer = module.target_config().pointer_type();
        let mut signature = module.make_signature();
        signature.params.extend([AbiParam::new(pointer); 2]);
        signature.returns.push(AbiParam::new(types::I32));
        let mut context = module.make_context();
        let mut builder_context = FunctionBuilderContext::new();
        let mut tails = Vec::with_capacity(arms.len());

        for (arm_index, arm) in arms.iter().enumerate() {
            let mut left = None;
            for position in 0..=arm.len() {
                let name = format!("arm_{arm_index}_compound_{position}");
                let id = module.declare_function(&name, Linkage::Local, &signature)?;
                context.func.name = UserFuncName::user(0, id.as_u32());
                context.func.signature = signature.clone();
                let continuation = left.map(|left_id| {
                    (
                        arm[position - 1],
                        module.declare_func_in_func(left_id, &mut context.func),
                    )
                });
                let builder = FunctionBuilder::new(&mut context.func, &mut builder_context);
                emit_compound(builder, pointer, arm_index, position, continuation);
                module.define_function(id, &mut context)?;
                module.clear_context(&mut context);
                left = Some(id);
            }
            tails.push(left.expect("each arm has at least one compound"));
        }

        let entry_id = module.declare_function("selector_list", Linkage::Local, &signature)?;
        context.func.name = UserFuncName::user(0, entry_id.as_u32());
        context.func.signature = signature;
        let tails: Vec<FuncRef> = tails
            .into_iter()
            .map(|id: FuncId| module.declare_func_in_func(id, &mut context.func))
            .collect();
        let builder = FunctionBuilder::new(&mut context.func, &mut builder_context);
        emit_entry(builder, &tails);
        module.define_function(entry_id, &mut context)?;
        module.finalize_definitions()?;
        // SAFETY: The finalized entry uses the host C calling convention and the
        // same pointer, usize, and u32 ABI as Entry. CompiledList owns the code.
        let entry = unsafe {
            std::mem::transmute::<*const u8, Entry>(module.get_finalized_function(entry_id))
        };
        Ok(Some(Self {
            entry: Some(entry),
            _memory: Some(memory),
        }))
    }

    /// Runs the generated machine code against a candidate in the live DOM.
    pub fn matches(&self, node: NonZeroUsize, host: &mut dyn Host) -> bool {
        match_chain(self.entry, node, host)
    }

    pub(super) fn background(&self, lease: background::Lease) -> BackgroundList {
        BackgroundList {
            entry: self.entry,
            _lease: lease,
        }
    }
}

/// Finalized selector-list matcher whose allocation is kept on the compiler thread.
pub struct BackgroundList {
    entry: Option<Entry>,
    _lease: background::Lease,
}

impl BackgroundList {
    pub fn matches(&self, node: NonZeroUsize, host: &mut dyn Host) -> bool {
        match_chain(self.entry, node, host)
    }
}

fn match_chain(entry: Option<Entry>, node: NonZeroUsize, host: &mut dyn Host) -> bool {
    let Some(entry) = entry else {
        return false;
    };
    let mut state = State { host, unwind: None };
    // SAFETY: The code runs synchronously and this state remains exclusively
    // borrowed until the entry returns.
    let matched = unsafe { entry(&mut state, node.get()) };
    if let Some(unwind) = state.unwind {
        resume_unwind(unwind);
    }
    matched != 0
}

fn emit_entry(mut builder: FunctionBuilder<'_>, arms: &[FuncRef]) {
    let entry = builder.create_block();
    let success = builder.create_block();
    builder.append_block_params_for_function_params(entry);
    builder.switch_to_block(entry);
    let state = builder.block_params(entry)[0];
    let node = builder.block_params(entry)[1];
    for &arm in arms {
        let call = builder.ins().call(arm, &[state, node]);
        let matched = builder.inst_results(call)[0];
        let next = builder.create_block();
        builder.ins().brif(matched, success, &[], next, &[]);
        builder.switch_to_block(next);
    }
    let no = builder.ins().iconst(types::I32, 0);
    builder.ins().return_(&[no]);
    builder.switch_to_block(success);
    let yes = builder.ins().iconst(types::I32, 1);
    builder.ins().return_(&[yes]);
    builder.seal_all_blocks();
    builder.finalize();
}

fn emit_compound(
    mut builder: FunctionBuilder<'_>,
    pointer: Type,
    arm: usize,
    position: usize,
    continuation: Option<(Combinator, FuncRef)>,
) {
    let mut signature = cranelift_codegen::ir::Signature::new(builder.func.signature.call_conv);
    signature.params.extend([AbiParam::new(pointer); 5]);
    signature.returns.push(AbiParam::new(pointer));
    let callback_signature = builder.import_signature(signature);

    let entry = builder.create_block();
    let passed = builder.create_block();
    let failed = builder.create_block();
    builder.append_block_params_for_function_params(entry);
    builder.switch_to_block(entry);
    let state = builder.block_params(entry)[0];
    let node = builder.block_params(entry)[1];
    let callback = builder
        .ins()
        .iconst(pointer, host_step as *const () as usize as i64);
    let arm = builder.ins().iconst(pointer, arm as i64);
    let position = builder.ins().iconst(pointer, position as i64);
    let test = builder.ins().iconst(pointer, 0);
    let call = builder.ins().call_indirect(
        callback_signature,
        callback,
        &[state, node, test, arm, position],
    );
    let matched = builder.inst_results(call)[0];
    builder.ins().brif(matched, passed, &[], failed, &[]);
    builder.switch_to_block(passed);

    if let Some((combinator, left)) = continuation {
        let traverse = builder.create_block();
        let try_left = builder.create_block();
        builder.append_block_param(traverse, pointer);
        let operation = builder.ins().iconst(pointer, combinator.operation());
        builder.ins().jump(traverse, &[BlockArg::Value(node)]);
        builder.switch_to_block(traverse);
        let current = builder.block_params(traverse)[0];
        let call = builder.ins().call_indirect(
            callback_signature,
            callback,
            &[state, current, operation, arm, position],
        );
        let next = builder.inst_results(call)[0];
        builder.ins().brif(next, try_left, &[], failed, &[]);
        builder.switch_to_block(try_left);
        let call = builder.ins().call(left, &[state, next]);
        let matched = builder.inst_results(call)[0];
        if combinator.backtracks() {
            let success = builder.create_block();
            builder
                .ins()
                .brif(matched, success, &[], traverse, &[BlockArg::Value(next)]);
            builder.switch_to_block(success);
        }
        builder.ins().return_(&[matched]);
    } else {
        let yes = builder.ins().iconst(types::I32, 1);
        builder.ins().return_(&[yes]);
    }

    builder.switch_to_block(failed);
    let no = builder.ins().iconst(types::I32, 0);
    builder.ins().return_(&[no]);
    builder.seal_all_blocks();
    builder.finalize();
}

struct State<'a> {
    host: &'a mut dyn Host,
    unwind: Option<Box<dyn Any + Send>>,
}

extern "C" fn host_step(
    state: *mut State<'_>,
    node: usize,
    op: usize,
    arm: usize,
    position: usize,
) -> usize {
    // SAFETY: Native calls receive the live State from CompiledList::matches.
    // No two callbacks access it concurrently or overlap.
    let state = unsafe { &mut *state };
    let Some(node) = NonZeroUsize::new(node) else {
        return 0;
    };
    if state.unwind.is_some() {
        return 0;
    }
    match catch_unwind(AssertUnwindSafe(|| match op {
        0 => usize::from(state.host.test(node, arm, position)),
        1 => state.host.parent(node).map_or(0, NonZeroUsize::get),
        2 => state
            .host
            .previous_element_sibling(node)
            .map_or(0, NonZeroUsize::get),
        _ => 0,
    })) {
        Ok(result) => result,
        Err(payload) => {
            state.unwind = Some(payload);
            0
        }
    }
}
