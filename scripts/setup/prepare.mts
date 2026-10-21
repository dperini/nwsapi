import { setupRelease } from "../publish/setup.mjs";
import { isMainModule } from "../lib/paths.mts";
import { toolVersion } from "../lib/external-tools.mjs";
import { configureEditor } from "./editor.mts";

export function prepareCheckout() {
  setupRelease({ quiet: true });
  const editor = configureEditor();
  console.log(editor.messages.join("\n"));
  console.log(
    `[setup] Core checkout ready on Node ${process.version.slice(1)} with pinned npm ${toolVersion("npm")}. Next: node scripts/develop/run.mts`,
  );
  console.log("[setup] Browser fixtures are optional: node scripts/setup.mjs --full");
}

if (isMainModule(import.meta.url)) {
  prepareCheckout();
}
