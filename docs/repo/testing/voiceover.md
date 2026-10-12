# VoiceOver narration smoke check

The VoiceOver smoke check is an explicit, opt-in macOS action. The no-argument
command reports usage only. A session requires a local documentation server, an
exact URL for the API reader page, and an interactive confirmation. Unit tests
mock the operating-system, browser, and Guidepup interfaces. They do not start
VoiceOver or speak.

## Run a check

1. Use `pnpm run voiceover:check` to read the instructions without starting anything.
2. If needed, opt in to testing assets with `pnpm run setup -- --voiceover`. Follow its macOS permission instructions. Setup and starting narration are separate choices.
3. Start the docs with `pnpm run guide`. Keep that terminal running and use the loopback port it prints.
4. In another interactive terminal, run the command below. Replace `4389` if the server printed a different port. Confirm only when ready to hear narration.

```sh
pnpm run voiceover:test -- --url 'http://127.0.0.1:4389/model-guide-reading.html?doc=docs/repo/selector/api.md'
```

Press Ctrl+C to cancel. `pnpm run voiceover:stop` is the separate Stop command. Normal unit tests and review do not run this live check.

## Results and recovery

The runner opens an isolated browser session at the supplied loopback URL and
checks that its page is the visible, focused API reader before it starts
Guidepup. It captures one focused “Reading mode” control phrase. It does not
check general accessibility or acoustic pronunciation. Startup and permission failures are reported separately from captured speech.

Before startup, the runner saves five VoiceOver preference entries under
`.cache/voiceover/`. If shutdown, volume detach, or preference restoration
cannot be confirmed, it leaves the recovery snapshot and per-user lock in place
and reports their paths. It does not retry automatically. Stop and review the
recorded recovery data before attempting another session. Automated recovery after incomplete cleanup is not provided. Keep the backup and lock until recovery is verified. A successful smoke
check records the action, URL, and captured phrase in a private local artifact.

The read-only status output describes how to opt in. It does not probe or claim
that VoiceOver is configured, permitted, or operational.
