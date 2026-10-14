use std::fs;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-env-changed=OPENTUI_PRESSED");
    println!("cargo:rerun-if-env-changed=OPENTUI_SHA512_FILE");
    let pressed_path =
        PathBuf::from(std::env::var_os("OPENTUI_PRESSED").expect("OPENTUI_PRESSED is required"));
    let digest_path = PathBuf::from(
        std::env::var_os("OPENTUI_SHA512_FILE").expect("OPENTUI_SHA512_FILE is required"),
    );
    println!("cargo:rerun-if-changed={}", pressed_path.display());
    println!("cargo:rerun-if-changed={}", digest_path.display());
    let out = PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR is required"));
    fs::copy(pressed_path, out.join("opentui.pressed")).expect("copy compressed OpenTUI payload");
    fs::copy(digest_path, out.join("opentui.sha512")).expect("copy OpenTUI digest");
}
