# VoiceOver narration smoke check

The VoiceOver smoke check is an explicit, opt-in macOS action. The no-argument
command reports usage only. A session requires a local documentation server, an
exact URL for the API reader page, and an interactive confirmation. Unit tests
mock the operating-system, browser, and Guidepup interfaces. They do not start
VoiceOver or speak.

The runner opens an isolated browser session at the supplied loopback URL and
checks that its page is the visible, focused API reader before it starts
Guidepup. It captures one focused “Reading mode” control phrase. It does not
check general accessibility, permission grants, or whether speech is available
on the machine.

Before startup, the runner saves five VoiceOver preference entries under
`.cache/voiceover/`. If shutdown, volume detach, or preference restoration
cannot be confirmed, it leaves the recovery snapshot and per-user lock in place
and reports their paths. It does not retry automatically. Stop and review the
recorded recovery data before attempting another session. A successful smoke
check records the action, URL, and captured phrase in a private local artifact.

The read-only status output describes how to opt in. It does not probe or claim
that VoiceOver is configured, permitted, or operational.
