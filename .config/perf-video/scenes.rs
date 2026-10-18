use fframes::{
    AudioMap, Duration, FFramesContext, Frame, Scene, Scenes, Svgr, Transform, Video,
    include_media_dir,
};

include_media_dir!(pub struct WalkthroughMedia, "../../assets/repo/video/media");

pub struct Walkthrough {
    scenes: [Chapter; 6],
}

impl Walkthrough {
    pub fn new() -> Self {
        Self {
            scenes: [
                Chapter {
                    index: 0,
                    title: "A clearer path to your next change.",
                    name: "Welcome",
                    seconds: 6.0,
                },
                Chapter {
                    index: 1,
                    title: "1. Prepare your checkout.",
                    name: "Setup",
                    seconds: 8.0,
                },
                Chapter {
                    index: 2,
                    title: "2. Open the docs.",
                    name: "Navigate",
                    seconds: 9.0,
                },
                Chapter {
                    index: 3,
                    title: "Read, then make your change.",
                    name: "Read",
                    seconds: 9.0,
                },
                Chapter {
                    index: 4,
                    title: "3. Review your change.",
                    name: "Review",
                    seconds: 9.0,
                },
                Chapter {
                    index: 5,
                    title: "If setup needs attention.",
                    name: "Help",
                    seconds: 7.0,
                },
            ],
        }
    }
}

impl Video for Walkthrough {
    const FPS: usize = 30;
    const WIDTH: usize = 1920;
    const HEIGHT: usize = 1080;
    fn duration(&self) -> Duration<'_> {
        Duration::Auto
    }
    fn audio(&self) -> AudioMap<'_> {
        AudioMap::none()
    }
    fn define_scenes(&self) -> Scenes<'_> {
        Scenes::from(
            self.scenes
                .iter()
                .map(|scene| scene as &dyn Scene)
                .collect::<Vec<_>>(),
        )
    }
    fn render_frame<'a>(&'a self, frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        fframes::svgr!(<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
            <rect width="1920" height="1080" fill="#0c171e"/>
            <g font-family="DM Sans" font-weight="500" fill="#eff3fa">
                <text x="160" y="110" font-size="36" fill="#ba9cea">"nwsapi / v3"</text>
                <text x="1760" y="110" text-anchor="end" font-size="28" fill="#a9b9c7">"WORKFLOW & DOCS"</text>
                {ctx.render_scenes(&frame)}
            </g>
            <rect x="160" y="1020" width="1600" height="3" rx="1.5" fill="#283a46"/>
            <rect x="160" y="1020" width={(frame.seconds() / 48.0 * 1600.0).max(0.5)} height="3" rx="1.5" fill="#b899ea"/>
        </svg>)
    }
}

#[derive(Debug)]
struct Chapter {
    index: usize,
    title: &'static str,
    name: &'static str,
    seconds: f32,
}

impl Scene for Chapter {
    fn name(&self) -> &'static str {
        self.name
    }
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(self.seconds)
    }
    fn render_frame<'a>(&'a self, frame: Frame, _: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let enter = (t / 0.5).clamp(0.0, 1.0);
        let y = 18.0 * (1.0 - enter).powi(3);
        let content = match self.index {
            0 => introduction(),
            1 => setup(t),
            2 => navigation(t),
            3 => reading(t),
            4 => review(t),
            _ => troubleshooting(),
        };
        fframes::svgr!(<g>
            <text x="160" y="262" font-size="78">{self.title}</text>
            <g transform={Transform::translate(0.0, y)}>{content}</g>
        </g>)
    }
}

fn label<'a>(x: i32, y: i32, size: i32, color: &'a str, text: &'a str) -> Svgr<'a> {
    fframes::svgr!(<text x={x} y={y} font-size={size} fill={color}>{text}</text>)
}

fn panel<'a>() -> Svgr<'a> {
    fframes::svgr!(<rect x="160" y="350" width="1600" height="470" rx="28" fill="#152530" stroke="#354651" stroke-width="2"/>)
}

fn caption<'a>(text: &'a str) -> Svgr<'a> {
    label(160, 935, 40, "#a9b9c7", text)
}

fn introduction<'a>() -> Svgr<'a> {
    fframes::svgr!(<g>
        <text x="160" y="440" font-size="126" fill="#ba9cea">"NWSAPI v3"</text>
        <text x="164" y="525" font-size="48" fill="#a9b9c7">"Developer workflow, from setup to review."</text>
        <path d="M190 685 H1680" fill="none" stroke="#354651" stroke-width="3"/>
        <circle cx="190" cy="685" r="12" fill="#b899ea"/>
        <circle cx="680" cy="685" r="12" fill="#b899ea"/>
        <circle cx="1180" cy="685" r="12" fill="#8ad5bb"/>
        {label(160, 775, 52, "#eff3fa", "01  Set up")}
        {label(650, 775, 52, "#eff3fa", "02  Find & edit")}
        {label(1150, 775, 52, "#eff3fa", "03  Review")}
        {caption("A short walkthrough of the v3 development checkout.")}
    </g>)
}

fn setup<'a>(t: f32) -> Svgr<'a> {
    let reveal = ((t - 1.8) / 0.4).clamp(0.0, 1.0);
    fframes::svgr!(<g>
        {panel()}
        {label(215, 422, 30, "#a9b9c7", "TYPE IN YOUR TERMINAL · REPOSITORY ROOT")}
        {label(215, 530, 68, "#8ad5bb", "pnpm go")}
        {label(215, 610, 38, "#eff3fa", "Press Enter to install tools, dependencies, and build outputs.")}
        <g opacity={reveal}>
            <path d="M215 656 H1700" stroke="#354651"/>
            {label(215, 725, 42, "#a7e4cc", "Wait for: Setup complete")}
            {label(1100, 725, 34, "#a9b9c7", "Then open the docs.")}
        </g>
        {caption("Start here. Run each command from the repository folder.")}
    </g>)
}

fn navigation<'a>(t: f32) -> Svgr<'a> {
    let reveal = ((t - 1.5) / 0.4).clamp(0.0, 1.0);
    fframes::svgr!(<g>
        {panel()}
        {label(215, 435, 43, "#eff3fa", "pnpm run guide")}
        {label(1340, 435, 28, "#a9b9c7", "DOCS PREVIEW")}
        <rect x="215" y="480" width="450" height="270" rx="16" fill="#23333f"/>
        {label(245, 542, 36, "#eff3fa", "API reference")}
        {label(245, 618, 36, "#eff3fa", "Interactive guide")}
        {label(245, 694, 36, "#ba9cea", "All documents")}
        <g opacity={reveal}>
            <rect x="720" y="480" width="980" height="78" rx="12" fill="#0c171e" stroke="#526577"/>
            {label(750, 532, 36, "#eff3fa", "Search documents")}
            <rect x="720" y="600" width="185" height="58" rx="29" fill="#37304c"/>
            <rect x="930" y="600" width="245" height="58" rx="29" fill="#183e36"/>
            <rect x="1200" y="600" width="220" height="58" rx="29" fill="#263d56"/>
            {label(753, 640, 30, "#d3b8fa", "Guides")}
            {label(963, 640, 30, "#a7e4cc", "Experiments")}
            {label(1242, 640, 30, "#b4d5fb", "Reports")}
            {label(723, 726, 32, "#a9b9c7", "Search by topic. Narrow by type.")}
        </g>
        {caption("Type pnpm run guide, then press Enter to open the docs.")}
    </g>)
}

fn reading<'a>(t: f32) -> Svgr<'a> {
    let reveal = ((t - 1.5) / 0.4).clamp(0.0, 1.0);
    fframes::svgr!(<g>
        {panel()}
        {label(220, 437, 31, "#ba9cea", "ON THIS PAGE")}
        {label(220, 533, 34, "#a9b9c7", "Query elements")}
        <rect x="202" y="568" width="410" height="70" rx="10" fill="#37304c"/>
        {label(220, 615, 34, "#d3b8fa", "Configure the engine")}
        {label(220, 699, 34, "#a9b9c7", "Legacy hooks")}
        <path d="M655 410 V760" stroke="#354651" stroke-width="2"/>
        {label(710, 451, 52, "#eff3fa", "Configure the engine")}
        {label(710, 530, 36, "#a9b9c7", "Choose a section. Stay with your selection.")}
        <g opacity={reveal}>
            <rect x="710" y="582" width="985" height="84" rx="12" fill="#183e36"/>
            {label(735, 637, 34, "#a7e4cc", "Continue from: Configure the engine")}
            {label(710, 734, 36, "#eff3fa", "Reading mode reduces visual motion.")}
        </g>
        {caption("Find the relevant section, then edit your source or documentation.")}
    </g>)
}

fn review<'a>(t: f32) -> Svgr<'a> {
    let active = ((t - 1.0) / 1.15).floor().clamp(0.0, 3.0) as usize;
    let names = ["Lint", "Format", "Types", "Unit tests"];
    let steps: Vec<Svgr<'a>> = names.iter().enumerate().map(|(i, name)| {
        let x = 215 + i as i32 * 375;
        let selected = i <= active;
        fframes::svgr!(<g>
            <rect x={x} y="590" width="340" height="100" rx="14" fill={if selected { "#183e36" } else { "#23333f" }}/>
            {label(x + 30, 653, 40, if selected { "#a7e4cc" } else { "#a9b9c7" }, name)}
        </g>)
    }).collect();
    fframes::svgr!(<g>
        {panel()}
        {label(215, 455, 62, "#8ad5bb", "pnpm run review")}
        {label(215, 525, 34, "#a9b9c7", "AFTER EDITING · TYPE IN YOUR TERMINAL, THEN PRESS ENTER")}
        {steps}
        {label(215, 765, 34, "#eff3fa", "Stops at the first failure. Fix the reported issue, then rerun.")}
        {caption("Finish with git diff to inspect the files you changed.")}
    </g>)
}

fn troubleshooting<'a>() -> Svgr<'a> {
    fframes::svgr!(<g>
        {panel()}
        {label(215, 422, 30, "#ba9cea", "OPTIONAL · MISSING TOOL OR WRONG VERSION?")}
        {label(215, 530, 68, "#8ad5bb", "pnpm run setup:check")}
        {label(215, 610, 38, "#eff3fa", "Checks Node.js, package managers, and checkout tools.")}
        {label(215, 704, 36, "#a9b9c7", "Reports readiness and the next command. Changes nothing.")}
        {label(215, 770, 30, "#a9b9c7", "More detail: pnpm run setup:check --details")}
        {caption("Type the command in your terminal, then press Enter.")}
    </g>)
}
