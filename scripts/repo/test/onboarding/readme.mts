import { readFile } from "node:fs/promises";
import path from "node:path";

export interface JourneyStep {
  id: string;
  command: string[];
}

export function parseJourney(markdown: string): JourneyStep[] {
  const steps: JourneyStep[] = [];
  const pattern =
    /<!-- onboarding:([a-z-]+):start -->\s*```sh\n([\s\S]*?)\n```\s*<!-- onboarding:\1:end -->/g;
  for (const match of markdown.matchAll(pattern)) {
    const command = match[2]!.trim().split(/\s+/);
    if (command.length === 0 || command.some((part) => part.startsWith("#"))) {
      throw new Error(`Invalid onboarding command for ${match[1]}.`);
    }
    steps.push({ id: match[1]!, command });
  }
  if (steps.length === 0) throw new Error("README has no marked onboarding commands.");
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw new Error("README onboarding command IDs must be unique.");
  }
  return steps;
}

export async function readJourney(repository: string) {
  const markdown = await readFile(path.join(repository, "README.md"), "utf8");
  return parseJourney(markdown);
}
