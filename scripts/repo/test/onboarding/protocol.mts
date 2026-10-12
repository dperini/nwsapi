export function parseHarnessJson(stdout: string) {
  const value = JSON.parse(stdout.trim());
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Harness output must be one JSON object.");
  }
  return value as Record<string, unknown>;
}

export function assertTaskDiscovery(value: Record<string, unknown>) {
  if (value.schemaVersion !== 1 || value.type !== "tasks" || !Array.isArray(value.tasks)) {
    throw new Error("Unexpected task discovery envelope.");
  }
  const ids = (value.tasks as Array<{ id?: unknown }>).map((task) => task.id);
  const expected = ["setup", "guide", "review", "setup:check"];
  if (expected.some((id, index) => ids[index] !== id)) {
    throw new Error("Task discovery is missing required tasks or has changed their order.");
  }
}

export function assertHarnessResult(
  value: Record<string, unknown>,
  expectedStatus: string,
  processExitCode: number | null,
  expectedTask: string,
) {
  if (value.schemaVersion !== 1 || value.type !== "result" || value.task !== expectedTask) {
    throw new Error(`Unexpected harness result envelope for ${expectedTask}.`);
  }
  if (value.status !== expectedStatus) {
    throw new Error(`Expected harness status ${expectedStatus}; got ${String(value.status)}.`);
  }
  if (value.exitCode !== processExitCode) {
    throw new Error(
      `Harness result exit ${String(value.exitCode)} disagrees with process exit ${String(processExitCode)}.`,
    );
  }
  if (expectedStatus === "completed" && processExitCode !== 0) {
    throw new Error(`Completed task ${expectedTask} exited with ${String(processExitCode)}.`);
  }
}
