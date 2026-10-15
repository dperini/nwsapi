# V3 workflow walkthrough

The [48s walkthrough](../../../assets/repo/video/v3-walkthrough.mp4) introduces
setup, documentation navigation, reading mode, and the review command. It is a
1920×1080, 30fps, caption-led video with intentional silence. The interface
scenes are illustrations of the v3 workflow. The check sequence illustrates
execution order and does not claim a recorded passing run.

- [Storyboard](../../../assets/repo/video/v3-walkthrough-strip.png)
- [Poster](../../../assets/repo/video/v3-walkthrough-poster.png)
- [Captions](../../../assets/repo/video/v3-walkthrough.vtt)
- [First-change guide](first-change.md)

## Prepare and render

Run these commands from the repository root:

```sh
pnpm run setup:video
pnpm run video:render
```

`setup:video` downloads the locked Cargo dependencies and builds the renderer.
The first build takes longer than subsequent builds. Generated build files stay
in `.cache/fframes/target/`. The rendered video goes to
`assets/repo/video/v3-walkthrough.mp4`.

Open the embedded video page through the installed Portless command:

```sh
pnpm run video:preview
```

The page includes native playback controls, captions, chapter buttons, and an
expandable transcript. It opens automatically at the local URL printed by
Portless. This preview uses the rendered MP4 and does not require Rust.
Run `pnpm run video:render` after changing the scenes.

For the native frame-by-frame player, run `pnpm run video:player`.
Space toggles playback. H and L seek by a second. J and K step one frame.
Q closes the player.

## Toolchain

`fframes`, `fframes_skia_renderer`, and `fframes_native_player` are development-only
Rust dependencies pinned to 1.2.0 in `.config/perf-video/Cargo.toml`.
`Cargo.lock` pins transitive Rust dependencies. Cargo runs with `--locked`.
The upstream npm workspace is private, so it is not an npm development
installation.

`.config/external-tools.json` pins the `fframes` source archive and SHA-256
digest. Ordinary `prepare`, including installation through `pnpm i`,
downloads and verifies that small archive without requiring Rust. A valid
cached download is reused. The video command checks that the manifest,
Cargo dependency, and lockfile agree. Compiling the optional renderer downloads
the remaining locked dependencies through Cargo, including its verified copy
of the library.

Rendering needs Rust/Cargo 1.98 or newer. The runner reuses a compatible Cargo
on PATH or an already installed stable rustup toolchain. `CARGO` can select an
explicit compatible executable. It does not install Rust, change rustup's
default, or edit shell initialization. On macOS it discovers the installed SDK
with `xcrun` when `SDKROOT` is unset.

The renderer uses Skia Metal on macOS and Skia Vulkan elsewhere. The delivered
artifact was rendered on macOS. Other platforms have not been exercised here.
Install the platform prerequisites listed in the
[fframes installation guide](https://github.com/dmtrKovalenko/fframes#installation).
Prebuilt native libraries are available for supported targets. A source build
may need additional compiler and codec packages. Windows needs an FFmpeg shared
build and LLVM as described upstream.

## Edit and inspect

The six scenes are in `.config/perf-video/scenes.rs`. The example entrypoint is
`.config/perf-video/walkthrough.rs`. The DM Sans font and its license are
bundled under `assets/repo/video/media/`, with the license in
`assets/repo/video/DMSans.LICENSE`.

```sh
pnpm run video timeline
pnpm run video inspect --fail-on warning
pnpm run video strip --columns 3 -n 12 -o assets/repo/video/v3-walkthrough-strip.png
pnpm run video frame 2s -o .cache/fframes/frames
pnpm run video render --draft -o .cache/fframes/draft.mp4
pnpm run video audio analyze
```

Inspect contact sheets and full-size frames after layout changes. Keep captions
and scene durations together when editing. Check final duration, dimensions,
and frame count with `ffprobe` before sharing.

## Transcript

| Time   | Scene               | Message                                                                                                                                                                                                |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0–6s   | Welcome             | Follow the task order: set up, find and edit, review.                                                                                                                                                  |
| 6–14s  | 1. Setup            | Open a terminal in the repository folder. Type `pnpm go` and press Enter. Wait for “Setup complete.”                                                                                                   |
| 14–23s | 2. Open docs        | Type `pnpm run guide` and press Enter to open the documentation. Choose a document or search and filter.                                                                                               |
| 23–32s | Read and edit       | Find the relevant section, then edit your source or documentation. Return to a saved section or choose reading mode.                                                                                   |
| 32–41s | 3. Review           | After editing, type `pnpm run review` and press Enter. It runs lint, formatting, types, and unit tests in order. Fix the first reported issue and rerun. Inspect `git diff`.                           |
| 41–48s | Optional setup help | For a missing tool or wrong version, type `pnpm run setup:check` and press Enter. It reports Node.js and package-manager versions, checkout tool readiness, and the next command. It changes no tools. |

`setup:check` is the preferred name for the tool-readiness report. The existing
`doctor:tools` alias continues to work. Add `--details` for executable paths,
version requirements, tool ownership, and wrapper information.
