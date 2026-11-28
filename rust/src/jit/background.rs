//! Compiles native matchers without blocking a selector evaluation.

use super::chain::BackgroundList;
use super::{BackgroundClass, Combinator, CompiledList, CompiledSelector};
use std::any::Any;
use std::mem::ManuallyDrop;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

/// The data needed for code generation. It never contains a live DOM reference.
pub enum Job {
    Class(String),
    Chain(Vec<Vec<Combinator>>),
}

/// Generated code. The callbacks and DOM access run on the calling thread.
pub enum Program {
    Class(BackgroundClass),
    Chain(BackgroundList),
}

type Request = (Job, mpsc::Sender<Option<Program>>);
static COMPILER: OnceLock<Option<SyncSender<Request>>> = OnceLock::new();

/// Queues a compile if the worker is available. An empty reply means the
/// selector should continue using the host matcher.
pub fn try_compile(job: Job) -> Option<Receiver<Option<Program>>> {
    let queue = COMPILER
        .get_or_init(|| {
            let (send, receive) = mpsc::sync_channel(16);
            std::thread::Builder::new()
                .name("nwsapi-jit".into())
                .spawn(move || compile_jobs(&receive))
                .ok()
                .map(|_| send)
        })
        .as_ref()?;
    let (send, receive) = mpsc::channel();
    queue.try_send((job, send)).ok()?;
    Some(receive)
}

pub(super) struct Lease(Arc<AtomicBool>);

impl Drop for Lease {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Release);
    }
}

struct Allocation {
    released: Arc<AtomicBool>,
    // If the worker exits unexpectedly, code already published must remain valid.
    owner: Option<ManuallyDrop<Box<dyn Any>>>,
}

fn compile_jobs(requests: &Receiver<Request>) {
    let mut allocations: Vec<Allocation> = Vec::new();
    loop {
        allocations.retain_mut(|allocation| {
            if !allocation.released.load(Ordering::Acquire) {
                return true;
            }
            // The lease is released only after the last call has returned.
            drop(allocation.owner.take().map(ManuallyDrop::into_inner));
            false
        });
        match requests.recv_timeout(Duration::from_secs(1)) {
            Ok((job, reply)) => {
                let published = std::panic::catch_unwind(|| compile(job)).ok().flatten();
                let program = published.map(|(allocation, program)| {
                    allocations.push(allocation);
                    program
                });
                let _ = reply.send(program);
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn compile(job: Job) -> Option<(Allocation, Program)> {
    let released = Arc::new(AtomicBool::new(false));
    let lease = Lease(released.clone());
    let (owner, program): (Box<dyn Any>, Program) = match job {
        Job::Class(source) => {
            let selector = CompiledSelector::compile(&source).ok().flatten()?;
            let program = BackgroundClass {
                matcher: selector.matcher,
                _lease: lease,
            };
            (Box::new(selector), Program::Class(program))
        }
        Job::Chain(arms) => {
            let list = CompiledList::compile(&arms).ok().flatten()?;
            let program = list.background(lease);
            (Box::new(list), Program::Chain(program))
        }
    };
    Some((
        Allocation {
            released,
            owner: Some(ManuallyDrop::new(owner)),
        },
        program,
    ))
}
