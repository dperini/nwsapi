mod scenes;

use fframes::{EncoderOptions, RenderOptions, StaticMediaProvider, cli};
use fframes_skia_renderer::{
    SkiaFFramesRenderer, SkiaPipelineConcurrencyPolicy, SkiaPipelineConfig,
};
use scenes::{Walkthrough, WalkthroughMedia};
use std::process::ExitCode;

fn main() -> ExitCode {
    let media = WalkthroughMedia::prepare().expect("Load the bundled walkthrough font");
    let video = Walkthrough::new();
    let config = SkiaPipelineConfig {
        concurrency_policy: SkiaPipelineConcurrencyPolicy::MaxPerformance,
        ..Default::default()
    };
    #[cfg(target_os = "macos")]
    let gpu = fframes_skia_renderer::metal::SkiaMetalCtx::new(1920, 1080)
        .expect("Create the Metal context");
    #[cfg(target_os = "macos")]
    let renderer = SkiaFFramesRenderer::new_metal(&gpu, config);
    #[cfg(not(target_os = "macos"))]
    let gpu = fframes_skia_renderer::vulkan::SkiaVulkanCtx::new(1920, 1080)
        .expect("Create the Vulkan context");
    #[cfg(not(target_os = "macos"))]
    let renderer = SkiaFFramesRenderer::new_vulkan(&gpu, config);

    cli::new(
        &video,
        RenderOptions {
            media: Some(&media),
            video_encoder_options: EncoderOptions {
                preferred_encoder: Some("libx264"),
                codec_params: Some(&[("crf", "20"), ("preset", "medium"), ("tune", "animation")]),
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .backend(renderer.expect("Create the Skia renderer"))
    .preview(fframes_native_player::cli_preview)
    .run()
}
