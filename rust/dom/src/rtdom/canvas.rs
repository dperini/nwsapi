//! Pure-Rust port of the canvas 2D context stub (`makeCanvasStub` in
//! `src/runtime/stubs.mjs`). HONEST stub: a headless runtime has no raster
//! backend, so draw methods are no-ops and value-returning methods produce
//! zero/empty results — never fabricated pixels. Standalone (no Tree dep),
//! pure std.

/// Per-character advance used by `measure_text`, matching the JS stub's
/// `String(s).length * 6`.
const CHAR_WIDTH: f64 = 6.0;

/// TextMetrics-like return of `measure_text`.
#[derive(Debug, Clone, PartialEq)]
pub struct TextMetrics {
    pub width: f64,
}

/// Zero-filled RGBA pixel buffer (honest: no real raster).
#[derive(Debug, Clone, PartialEq)]
pub struct ImageData {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

impl ImageData {
    /// Allocate a zero-filled RGBA buffer of `width * height * 4` bytes.
    #[must_use]
    pub fn new(width: u32, height: u32) -> Self {
        let len = (width as usize) * (height as usize) * 4;
        ImageData {
            width,
            height,
            data: vec![0u8; len],
        }
    }
}

/// Gradient stub — accepts color stops but stores nothing (no raster).
#[derive(Debug, Clone, Default)]
pub struct CanvasGradient;

impl CanvasGradient {
    pub fn add_color_stop(&mut self, _offset: f64, _color: &str) {}
}

/// Pattern stub.
#[derive(Debug, Clone, Default)]
pub struct CanvasPattern;

/// 2D rendering context. Draw operations are no-ops; value-returning methods
/// give honest empty/zero results.
#[derive(Debug, Clone, Default)]
pub struct Canvas2dContext;

impl Canvas2dContext {
    #[must_use]
    pub fn new() -> Self {
        Canvas2dContext
    }

    /// `measureText`: width = char count * `CHAR_WIDTH` (matches the JS stub).
    #[must_use]
    pub fn measure_text(&self, text: &str) -> TextMetrics {
        TextMetrics {
            width: text.chars().count() as f64 * CHAR_WIDTH,
        }
    }

    /// `getImageData`: zero-filled RGBA buffer of length `w * h * 4`.
    #[must_use]
    pub fn get_image_data(&self, _x: f64, _y: f64, w: u32, h: u32) -> ImageData {
        ImageData::new(w, h)
    }

    #[must_use]
    pub fn create_linear_gradient(&self, _x0: f64, _y0: f64, _x1: f64, _y1: f64) -> CanvasGradient {
        CanvasGradient
    }

    #[must_use]
    pub fn create_radial_gradient(
        &self,
        _x0: f64,
        _y0: f64,
        _r0: f64,
        _x1: f64,
        _y1: f64,
        _r1: f64,
    ) -> CanvasGradient {
        CanvasGradient
    }

    #[must_use]
    pub fn create_pattern(&self) -> CanvasPattern {
        CanvasPattern
    }

    // --- no-op draw / state methods ---
    pub fn fill_rect(&self, _x: f64, _y: f64, _w: f64, _h: f64) {}
    pub fn clear_rect(&self, _x: f64, _y: f64, _w: f64, _h: f64) {}
    pub fn stroke_rect(&self, _x: f64, _y: f64, _w: f64, _h: f64) {}
    pub fn begin_path(&self) {}
    pub fn close_path(&self) {}
    pub fn move_to(&self, _x: f64, _y: f64) {}
    pub fn line_to(&self, _x: f64, _y: f64) {}
    pub fn stroke(&self) {}
    pub fn fill(&self) {}
    pub fn save(&self) {}
    pub fn restore(&self) {}
    pub fn translate(&self, _x: f64, _y: f64) {}
    pub fn scale(&self, _x: f64, _y: f64) {}
    pub fn rotate(&self, _angle: f64) {}
    pub fn draw_image(&self, _sx: f64, _sy: f64, _sw: f64, _sh: f64) {}
    pub fn put_image_data(&self, _data: &ImageData, _x: f64, _y: f64) {}
    pub fn fill_text(&self, _text: &str, _x: f64, _y: f64) {}
    pub fn stroke_text(&self, _text: &str, _x: f64, _y: f64) {}
}

/// `<canvas>` element stub.
#[derive(Debug, Clone)]
pub struct HtmlCanvas {
    pub width: u32,
    pub height: u32,
}

impl HtmlCanvas {
    #[must_use]
    pub fn new(width: u32, height: u32) -> Self {
        HtmlCanvas { width, height }
    }

    #[must_use]
    pub fn get_context_2d(&self) -> Canvas2dContext {
        Canvas2dContext::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measure_text_width_math() {
        let ctx = Canvas2dContext::new();
        // "hello" = 5 chars * 6.0 = 30.0
        assert_eq!(ctx.measure_text("hello"), TextMetrics { width: 30.0 });
        assert_eq!(ctx.measure_text("").width, 0.0);
        // multi-byte chars counted by char, not byte: "héllo" = 5 chars.
        assert_eq!(ctx.measure_text("héllo").width, 30.0);
    }

    #[test]
    fn get_image_data_zeroed_and_sized() {
        let ctx = Canvas2dContext::new();
        let img = ctx.get_image_data(0.0, 0.0, 3, 2);
        assert_eq!(img.width, 3);
        assert_eq!(img.height, 2);
        assert_eq!(img.data.len(), 3 * 2 * 4);
        assert!(img.data.iter().all(|&b| b == 0));

        let empty = ctx.get_image_data(5.0, 5.0, 0, 0);
        assert_eq!(empty.data.len(), 0);
    }

    #[test]
    fn image_data_new_direct() {
        let img = ImageData::new(2, 2);
        assert_eq!(img.data.len(), 16);
        assert!(img.data.iter().all(|&b| b == 0));
    }

    #[test]
    fn gradient_add_color_stop_noop() {
        let ctx = Canvas2dContext::new();
        let mut lin = ctx.create_linear_gradient(0.0, 0.0, 10.0, 10.0);
        lin.add_color_stop(0.0, "#fff");
        lin.add_color_stop(1.0, "rgba(0,0,0,1)");

        let mut rad = ctx.create_radial_gradient(0.0, 0.0, 1.0, 0.0, 0.0, 5.0);
        rad.add_color_stop(0.5, "red");

        let mut standalone = CanvasGradient;
        standalone.add_color_stop(0.0, "blue");

        let _pat = ctx.create_pattern();
    }

    #[test]
    fn noop_draw_calls() {
        let ctx = Canvas2dContext;
        ctx.fill_rect(0.0, 0.0, 1.0, 1.0);
        ctx.clear_rect(0.0, 0.0, 1.0, 1.0);
        ctx.stroke_rect(0.0, 0.0, 1.0, 1.0);
        ctx.begin_path();
        ctx.close_path();
        ctx.move_to(1.0, 1.0);
        ctx.line_to(2.0, 2.0);
        ctx.stroke();
        ctx.fill();
        ctx.save();
        ctx.restore();
        ctx.translate(1.0, 1.0);
        ctx.scale(2.0, 2.0);
        ctx.rotate(0.5);
        ctx.draw_image(0.0, 0.0, 1.0, 1.0);
        let img = ImageData::new(1, 1);
        ctx.put_image_data(&img, 0.0, 0.0);
        ctx.fill_text("x", 0.0, 0.0);
        ctx.stroke_text("y", 0.0, 0.0);
    }

    #[test]
    fn canvas_get_context_2d() {
        let canvas = HtmlCanvas::new(640, 480);
        assert_eq!(canvas.width, 640);
        assert_eq!(canvas.height, 480);
        let ctx = canvas.get_context_2d();
        assert_eq!(ctx.measure_text("ab").width, 12.0);
    }
}
