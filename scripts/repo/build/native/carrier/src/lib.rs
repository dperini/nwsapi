#![deny(unsafe_op_in_unsafe_fn)]

use abitious_decmpfs::decode_pressed_data;
use sha2::{Digest, Sha512};
use std::ffi::{c_char, c_void, CString};
use std::io::Write;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

type Env = *mut c_void;
type Value = *mut c_void;
type Status = i32;

extern "C" {
    fn napi_create_string_utf8(
        env: Env,
        value: *const c_char,
        length: usize,
        result: *mut Value,
    ) -> Status;
    fn napi_set_named_property(
        env: Env,
        object: Value,
        name: *const c_char,
        value: Value,
    ) -> Status;
}

const PRESSED: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/opentui.pressed"));
const EXPECTED_SHA512: &str = include_str!(concat!(env!("OUT_DIR"), "/opentui.sha512"));

#[no_mangle]
pub unsafe extern "C" fn napi_register_module_v1(env: Env, exports: Value) -> Value {
    let Some(path) = extract_library() else {
        return exports;
    };
    let Ok(value) = CString::new(path.to_string_lossy().as_bytes()) else {
        return exports;
    };
    let mut string = std::ptr::null_mut();
    // SAFETY: Node supplies a live environment and exports object for this callback.
    if unsafe { napi_create_string_utf8(env, value.as_ptr(), value.as_bytes().len(), &mut string) }
        != 0
    {
        return exports;
    }
    // SAFETY: The property name is static and both values remain live during the call.
    if unsafe { napi_set_named_property(env, exports, c"libraryPath".as_ptr(), string) } != 0 {
        return exports;
    }
    exports
}

fn extract_library() -> Option<PathBuf> {
    let raw = decode_pressed_data(PRESSED)?;
    let digest = Sha512::digest(&raw);
    let expected = hex::decode(EXPECTED_SHA512.trim()).ok()?;
    if digest.as_slice() != expected.as_slice() {
        return None;
    }
    let directory = cache_dir()?;
    prepare_cache_dir(&directory)?;
    let destination = directory.join(format!("{}.dylib", EXPECTED_SHA512.trim()));
    if valid_file(&destination, &expected) {
        return Some(destination);
    }
    if destination.symlink_metadata().is_ok() {
        std::fs::remove_file(&destination).ok()?;
    }
    write_atomic(&destination, &directory, &raw)?;
    valid_file(&destination, &expected).then_some(destination)
}

fn cache_dir() -> Option<PathBuf> {
    Some(
        std::env::temp_dir()
            .join("nwsapi-opentui")
            .join(unsafe { libc::getuid() }.to_string()),
    )
}

fn prepare_cache_dir(directory: &Path) -> Option<()> {
    let parent = directory.parent()?;
    for candidate in [parent, directory] {
        if !candidate.exists() {
            std::fs::DirBuilder::new()
                .mode(0o700)
                .create(candidate)
                .ok()?;
        }
        let metadata = candidate.symlink_metadata().ok()?;
        if !metadata.file_type().is_dir()
            || metadata.uid() != unsafe { libc::getuid() }
            || metadata.mode() & 0o022 != 0
        {
            return None;
        }
    }
    Some(())
}

fn valid_file(path: &Path, expected: &[u8]) -> bool {
    let Ok(metadata) = path.symlink_metadata() else {
        return false;
    };
    if !metadata.file_type().is_file()
        || metadata.uid() != unsafe { libc::getuid() }
        || metadata.mode() & 0o022 != 0
    {
        return false;
    }
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };
    Sha512::digest(bytes).as_slice() == expected
}

fn write_atomic(destination: &Path, directory: &Path, bytes: &[u8]) -> Option<()> {
    for attempt in 0..8 {
        let temporary = directory.join(format!(
            ".{}.{}.{}.tmp",
            std::process::id(),
            attempt,
            EXPECTED_SHA512
        ));
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary);
        let Ok(mut file) = file else { continue };
        file.write_all(bytes).ok()?;
        file.sync_all().ok()?;
        drop(file);
        match std::fs::rename(&temporary, destination) {
            Ok(()) => return Some(()),
            Err(_) => {
                std::fs::remove_file(&temporary).ok()?;
                return None;
            }
        }
    }
    None
}
