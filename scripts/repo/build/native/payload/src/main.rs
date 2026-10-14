use abitious_decmpfs::{build_section_payload, Arch, Libc, Platform};
use sha2::{Digest, Sha512};
use std::fs;
use std::path::PathBuf;

fn main() {
    let source =
        PathBuf::from(std::env::var_os("OPENTUI_LIBRARY").expect("OPENTUI_LIBRARY is required"));
    let pressed_path =
        PathBuf::from(std::env::var_os("OPENTUI_PRESSED").expect("OPENTUI_PRESSED is required"));
    let digest_path = PathBuf::from(
        std::env::var_os("OPENTUI_SHA512_FILE").expect("OPENTUI_SHA512_FILE is required"),
    );
    let raw = fs::read(source).expect("read pinned OpenTUI library");
    let pressed = build_section_payload(&raw, Platform::Darwin, Arch::Arm64, Libc::Na, 15);
    let digest = Sha512::digest(&raw);
    fs::write(pressed_path, pressed).expect("write pressed-data payload");
    fs::write(digest_path, format!("{digest:x}")).expect("write source digest");
}
