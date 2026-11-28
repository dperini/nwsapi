//! Pure-Rust port of the `FileReader` / Blob / File surface.
//!
//! Ported from `src/runtime/stubs.mjs` (`FileReader`) and `src/runtime/window.mjs`
//! (`BlobBase`, `makeFile`). Standalone — no `Tree` dependency, pure `std` only.
//!
//! **No async, no event dispatch.** The JS `FileReader` resolves a result via a
//! microtask and fires `load`/`loadend`/`error` events (`readyState`, `onload`,
//! `addEventListener`). A Rust consumer wants a SYNCHRONOUS read, so this port
//! exposes the *core* transform — bytes → text / data-URL / array-buffer — and
//! returns the value directly. The async scheduling + event-target layer
//! (microtask, `onload` callbacks, `readyState` transitions) is the embedder's
//! concern and is intentionally NOT ported: it isn't portable to a sync Rust API.

/// A `Blob`: an immutable byte sequence with a MIME type.
///
/// Mirrors `BlobBase` (window.mjs) reduced to the fields turbo-dom actually uses:
/// the bytes and the `type`.
pub struct Blob {
    bytes: Vec<u8>,
    /// The blob's MIME type (the JS `.type`). Empty string when unset.
    pub mime_type: String,
}

impl Blob {
    /// Construct a blob from owned bytes and a MIME type.
    pub fn new(bytes: Vec<u8>, mime_type: impl Into<String>) -> Self {
        Blob {
            bytes,
            mime_type: mime_type.into(),
        }
    }

    /// The number of bytes (the JS `.size`).
    #[must_use]
    pub fn size(&self) -> usize {
        self.bytes.len()
    }

    /// Borrow the raw bytes.
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// `Blob.slice(start, end)` — a new blob over the half-open byte range
    /// `[start, end)`, clamped to the blob's bounds, preserving the MIME type.
    #[must_use]
    pub fn slice(&self, start: usize, end: usize) -> Blob {
        let len = self.bytes.len();
        let s = start.min(len);
        let e = end.min(len).max(s);
        Blob::new(self.bytes[s..e].to_vec(), self.mime_type.clone())
    }
}

/// A `File`: a `Blob` plus a name and a last-modified timestamp.
///
/// Mirrors `makeFile()` (window.mjs): `File extends Blob` with `name` and
/// `lastModified`. The blob fields (bytes / size / MIME type) are re-exposed here
/// for deref-style convenience.
pub struct File {
    blob: Blob,
    /// The file name (the JS `.name`).
    pub name: String,
    /// Last-modified time, ms since epoch (the JS `.lastModified`).
    pub last_modified: u64,
}

impl File {
    /// Construct a file from bytes, a name, a MIME type and a last-modified time.
    pub fn new(
        bytes: Vec<u8>,
        name: impl Into<String>,
        mime_type: impl Into<String>,
        last_modified: u64,
    ) -> Self {
        File {
            blob: Blob::new(bytes, mime_type),
            name: name.into(),
            last_modified,
        }
    }

    /// Borrow the underlying blob.
    #[must_use]
    pub fn blob(&self) -> &Blob {
        &self.blob
    }

    /// The file's bytes (delegates to the blob).
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        self.blob.bytes()
    }

    /// The file's size in bytes (delegates to the blob).
    #[must_use]
    pub fn size(&self) -> usize {
        self.blob.size()
    }

    /// The file's MIME type (delegates to the blob).
    #[must_use]
    pub fn mime_type(&self) -> &str {
        &self.blob.mime_type
    }
}

/// The base64 alphabet, identical to `turboBtoa`'s `B64` in window.mjs.
const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Hand-rolled standard base64 encode with `=` padding — no external crate.
/// Mirrors the pure-JS fallback in `turboBtoa` (window.mjs).
fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut i = 0;
    let len = bytes.len();
    while i < len {
        let c1 = u32::from(bytes[i]);
        let has2 = i + 1 < len;
        let has3 = i + 2 < len;
        let c2 = if has2 { u32::from(bytes[i + 1]) } else { 0 };
        let c3 = if has3 { u32::from(bytes[i + 2]) } else { 0 };
        i += 3;

        let e1 = c1 >> 2;
        let e2 = ((c1 & 0x3) << 4) | (c2 >> 4);
        let e3 = ((c2 & 0xf) << 2) | (c3 >> 6);
        let e4 = c3 & 0x3f;

        out.push(B64[e1 as usize] as char);
        out.push(B64[e2 as usize] as char);
        out.push(if has2 { B64[e3 as usize] as char } else { '=' });
        out.push(if has3 { B64[e4 as usize] as char } else { '=' });
    }
    out
}

/// The synchronous core of the JS `FileReader`. The async/event-dispatch layer
/// (`onload`, `readyState`, microtask scheduling) is the embedder's, not ported.
pub struct FileReader;

impl FileReader {
    /// `readAsText` — UTF-8 lossy decode of the blob's bytes.
    #[must_use]
    pub fn read_as_text(blob: &Blob) -> String {
        String::from_utf8_lossy(blob.bytes()).into_owned()
    }

    /// `readAsDataURL` — `data:<mime>;base64,<base64(bytes)>`.
    #[must_use]
    pub fn read_as_data_url(blob: &Blob) -> String {
        format!(
            "data:{};base64,{}",
            blob.mime_type,
            base64_encode(blob.bytes())
        )
    }

    /// `readAsArrayBuffer` — a copy of the blob's bytes.
    #[must_use]
    pub fn read_as_array_buffer(blob: &Blob) -> Vec<u8> {
        blob.bytes().to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_as_text_utf8() {
        let blob = Blob::new("héllo wörld".as_bytes().to_vec(), "text/plain");
        assert_eq!(FileReader::read_as_text(&blob), "héllo wörld");
    }

    #[test]
    fn read_as_text_lossy_on_invalid_utf8() {
        let blob = Blob::new(vec![0xff, 0xfe, 0x00], "application/octet-stream");
        // invalid bytes become the replacement char, NUL survives — lossy, no panic.
        let s = FileReader::read_as_text(&blob);
        assert!(s.contains('\u{FFFD}'));
    }

    #[test]
    fn read_as_data_url_man() {
        let blob = Blob::new(b"Man".to_vec(), "text/plain");
        assert_eq!(
            FileReader::read_as_data_url(&blob),
            "data:text/plain;base64,TWFu"
        );
    }

    #[test]
    fn read_as_data_url_one_byte_padding() {
        let blob = Blob::new(b"M".to_vec(), "text/plain");
        assert_eq!(
            FileReader::read_as_data_url(&blob),
            "data:text/plain;base64,TQ=="
        );
    }

    #[test]
    fn read_as_data_url_two_byte_padding() {
        let blob = Blob::new(b"Ma".to_vec(), "text/plain");
        assert_eq!(
            FileReader::read_as_data_url(&blob),
            "data:text/plain;base64,TWE="
        );
    }

    #[test]
    fn read_as_data_url_empty_mime_and_bytes() {
        let blob = Blob::new(Vec::new(), "");
        assert_eq!(FileReader::read_as_data_url(&blob), "data:;base64,");
    }

    #[test]
    fn read_as_array_buffer_clones() {
        let blob = Blob::new(vec![1, 2, 3, 4], "application/octet-stream");
        assert_eq!(FileReader::read_as_array_buffer(&blob), vec![1, 2, 3, 4]);
    }

    #[test]
    fn blob_size_and_bytes() {
        let blob = Blob::new(b"hello".to_vec(), "text/plain");
        assert_eq!(blob.size(), 5);
        assert_eq!(blob.bytes(), b"hello");
        assert_eq!(blob.mime_type, "text/plain");
    }

    #[test]
    fn blob_slice_basic() {
        let blob = Blob::new(b"hello world".to_vec(), "text/plain");
        let s = blob.slice(0, 5);
        assert_eq!(s.bytes(), b"hello");
        assert_eq!(s.mime_type, "text/plain");
        assert_eq!(s.size(), 5);
    }

    #[test]
    fn blob_slice_clamps_out_of_range() {
        let blob = Blob::new(b"abc".to_vec(), "text/plain");
        // end past len clamps to len.
        assert_eq!(blob.slice(1, 100).bytes(), b"bc");
        // start past len → empty.
        assert_eq!(blob.slice(10, 20).bytes(), b"");
        // end < start → empty (e clamped up to s).
        assert_eq!(blob.slice(2, 1).bytes(), b"");
    }

    #[test]
    fn file_fields_and_delegation() {
        let f = File::new(b"data".to_vec(), "report.txt", "text/plain", 1234);
        assert_eq!(f.name, "report.txt");
        assert_eq!(f.last_modified, 1234);
        assert_eq!(f.size(), 4);
        assert_eq!(f.bytes(), b"data");
        assert_eq!(f.mime_type(), "text/plain");
        assert_eq!(f.blob().size(), 4);
    }

    #[test]
    fn file_reads_through_blob() {
        let f = File::new(b"Man".to_vec(), "f.txt", "text/plain", 0);
        assert_eq!(FileReader::read_as_text(f.blob()), "Man");
        assert_eq!(
            FileReader::read_as_data_url(f.blob()),
            "data:text/plain;base64,TWFu"
        );
    }
}
