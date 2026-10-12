import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isolatedEnvironment, makeSandbox, sha256 } from "./isolation.mts";
import { assertHarnessResult, assertTaskDiscovery, parseHarnessJson } from "./protocol.mts";
import { readJourney } from "./readme.mts";

const REPO = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const LOG_ROOT = path.join(REPO, ".cache/onboarding");
const TIMEOUT = 20 * 60_000;
const cases = ["bootstrap", "npm", "pnpm", "journey"] as const;
const phases: Outcome[] = [];
let cleanupSandbox: (() => Promise<void>) | undefined;
let keepSandbox = false;
let activeLog = "";
let activeScenario: Scenario | undefined;
let entryNodeVersion = "";
const managerVersions: Record<string, string> = {};
type Scenario = (typeof cases)[number];
interface Options {
  scenario: Scenario;
  node: string;
  npm?: string;
  pnpm?: string;
  keep?: boolean;
}
interface Outcome {
  phase: string;
  command: string;
  status: string;
  code: number | null;
}

function parse(argv: string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!;
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (key === "--keep") {
      values.set(key, "true");
      continue;
    }
    const value = argv[++index];
    if (!value) throw new Error(`Missing value for ${key}`);
    values.set(key, value);
  }
  const scenario = values.get("--scenario") as Scenario | undefined;
  const node = values.get("--node");
  if (!scenario || !cases.includes(scenario))
    throw new Error(`Choose --scenario ${cases.join("|")}.`);
  if (!node) throw new Error("Pass the absolute entry runtime path with --node.");
  if (!path.isAbsolute(node)) throw new Error("The entry runtime path must be absolute.");
  for (const name of ["npm", "pnpm"]) {
    const manager = values.get(`--${name}`);
    if (manager && !path.isAbsolute(manager))
      throw new Error(`The ${name} entry path must be absolute.`);
  }
  if (scenario === "npm" && !values.has("--npm"))
    throw new Error("Pass the pinned external npm entry point with --npm.");
  if (scenario === "pnpm" && !values.has("--pnpm"))
    throw new Error("Pass the pinned external pnpm entry point with --pnpm.");
  return {
    scenario,
    node,
    npm: values.get("--npm"),
    pnpm: values.get("--pnpm"),
    keep: values.has("--keep"),
  };
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout = TIMEOUT,
) {
  if (process.platform === "win32" && command.toLowerCase().endsWith(".cmd")) {
    const invocation = `"${command}" ${args.map((value) => `"${value.replaceAll('"', '""')}"`).join(" ")}`;
    const result = spawnSync(process.env["ComSpec"] ?? "cmd.exe", ["/d", "/s", "/c", invocation], {
      cwd,
      env,
      encoding: "utf8",
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return {
      code: result.status,
      signal: result.signal,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error,
    };
  }
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    code: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

async function appendLog(file: string, phase: string, result: ReturnType<typeof run>) {
  const body = redact(
    `\n## ${phase}\nexit=${result.code ?? "null"} signal=${result.signal ?? "none"}\n${result.stdout}\n${result.stderr}\n`,
  );
  await writeFile(file, body, { flag: "a" });
  phases.push({
    phase,
    command: phase,
    status: result.code === 0 ? "completed" : "failed",
    code: result.code,
  });
  if (result.error) throw result.error;
  if (result.code !== 0)
    throw new Error(`${phase} failed (exit ${result.code ?? "null"}). See ${file}`);
}

function protectedPath(paths: string[]) {
  return paths.join(path.delimiter);
}
function absentArtifacts(checkout: string) {
  for (const name of ["node_modules", "dist", ".cache"]) {
    if (existsSync(path.join(checkout, name))) return name;
  }
  return undefined;
}

async function command(
  file: string,
  phase: string,
  executable: string,
  args: string[],
  checkout: string,
  env: NodeJS.ProcessEnv,
  timeout = TIMEOUT,
  expected: number | null = 0,
) {
  const result = await runBounded(executable, args, checkout, env, timeout);
  await writeFile(
    file,
    redact(
      `\n## ${phase}\n$ ${path.basename(executable)} ${args.join(" ")}\nexit=${result.code ?? "null"} signal=${result.signal ?? "none"}\n${result.stdout}\n${result.stderr}\n`,
    ),
    { flag: "a" },
  );
  phases.push({
    phase,
    command: `${path.basename(executable)} ${args.join(" ")}`,
    status: result.code === 0 ? "completed" : "failed",
    code: result.code,
  });
  if (result.error) throw result.error;
  if (expected !== null && result.code !== expected)
    throw new Error(
      `${phase} returned ${result.code ?? "null"}, expected ${expected}. See ${file}`,
    );
  return result;
}

async function runBounded(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout: number,
) {
  let command = executable;
  let commandArgs = args;
  if (process.platform === "win32" && executable.toLowerCase().endsWith(".cmd")) {
    command = process.env["ComSpec"] ?? "cmd.exe";
    commandArgs = [
      "/d",
      "/s",
      "/c",
      `"${executable}" ${args.map((value) => `"${value.replaceAll('"', '""')}"`).join(" ")}`,
    ];
  }
  const grouped = process.platform !== "win32";
  const child = spawn(command, commandArgs, {
    cwd,
    env,
    detached: grouped,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const output: { stdout: string; stderr: string } = { stdout: "", stderr: "" };
  const maximum = 16 * 1024 * 1024;
  let timedOut = false;
  let signal: NodeJS.Signals | null = null;
  let escalation: NodeJS.Timeout | undefined;
  const append = (kind: "stdout" | "stderr", chunk: Buffer) => {
    if (output[kind].length < maximum)
      output[kind] += chunk.toString("utf8").slice(0, maximum - output[kind].length);
  };
  child.stdout.on("data", (chunk) => append("stdout", chunk));
  child.stderr.on("data", (chunk) => append("stderr", chunk));
  const kill = (requested: NodeJS.Signals) => {
    signal = requested;
    if (grouped && child.pid) {
      try {
        process.kill(-child.pid, requested);
      } catch {
        child.kill(requested);
      }
    } else {
      child.kill(requested);
    }
    escalation ??= setTimeout(() => {
      if (grouped && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else {
        child.kill("SIGKILL");
      }
    }, 5000);
    escalation.unref();
  };
  const interrupt = () => kill("SIGINT");
  const terminate = () => kill("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  let timer: NodeJS.Timeout | undefined;
  timer = setTimeout(() => {
    timedOut = true;
    kill("SIGTERM");
  }, timeout);
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>(
    (resolve) => {
      child.once("error", (error) => resolve({ code: null, signal: null, error }));
      child.once("close", (code, childSignal) => resolve({ code, signal: childSignal }));
    },
  );
  try {
    const result = await closed;
    if (grouped && signal) {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        /* group exited */
      }
    }
    return {
      ...result,
      ...output,
      error:
        result.error ??
        (timedOut
          ? new Error(
              `Timed out after ${Math.ceil(timeout / 60_000)}min: ${path.basename(executable)} ${args.join(" ")}`,
            )
          : undefined),
    };
  } finally {
    clearTimeout(timer);
    clearTimeout(escalation);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}

async function harness(
  file: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  args: string[],
  expectedStatus: string,
) {
  const result = await command(
    file,
    args.slice(1).join(" "),
    node,
    args.slice(1),
    checkout,
    env,
    TIMEOUT,
    null,
  );
  const object = parseHarnessJson(result.stdout);
  const taskIndex = args.indexOf("--task");
  const task = taskIndex >= 0 ? args[taskIndex + 1] : "";
  assertHarnessResult(object, expectedStatus, result.code, task!);
  return object;
}

async function startGuide(
  file: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  execution: string[],
) {
  const port = await unusedPort();
  const args = execution.slice(1);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(node, args, {
    cwd: checkout,
    env: { ...env, NWSAPI_GUIDE_NO_OPEN: "1", PORT: String(port) },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  let spawnFailure: Error | undefined;
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  child.once("error", (error) => {
    spawnFailure = error;
  });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once("close", (code, signal) => resolve({ code, signal })),
  );
  let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  try {
    const deadline = Date.now() + 60_000;
    let page: Response | undefined;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          page = response;
          break;
        }
      } catch {
        /* server is still starting */
      }
      await delay(300);
    }
    if (!page)
      throw new Error(
        `Guide did not become ready. ${spawnFailure?.message ?? stderr.slice(-2000)}`,
      );
    const contentType = page.headers.get("content-type") ?? "";
    const html = await page.text();
    if (!contentType.includes("text/html") || !/<html\b/i.test(html) || !/<title\b/i.test(html)) {
      throw new Error("Guide route returned an invalid HTML document.");
    }
    const modulePath = html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/i)?.[1];
    if (!modulePath) throw new Error("Guide page has no module entry point.");
    const moduleResponse = await fetch(new URL(modulePath, url), {
      signal: AbortSignal.timeout(5000),
    });
    const moduleText = await moduleResponse.text();
    if (
      !moduleResponse.ok ||
      !moduleResponse.headers.get("content-type")?.includes("javascript") ||
      !moduleText.trim()
    ) {
      throw new Error("Guide module entry point did not load as JavaScript.");
    }
    terminateTree(child, "SIGTERM");
    exit = await stopBounded(child, closed);
    const result = parseHarnessJson(stdout);
    assertHarnessResult(result, "stopped", exit.code, "guide");
    await writeFile(
      file,
      `\n## guide persistent session\nHTTP ${page.status}; module HTTP ${moduleResponse.status}; SIGTERM child code=${exit.code} signal=${exit.signal}\nstdout=${stdout}\nstderr=${stderr}\n`,
      { flag: "a" },
    );
    if (exit.code !== 143 && exit.signal !== "SIGTERM")
      throw new Error(`Guide runner cleanup unexpected: ${JSON.stringify(exit)}.`);
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      throw new Error("Guide server is still accepting connections after runner shutdown.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("still accepting")) throw error;
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      terminateTree(child, "SIGTERM");
      await stopBounded(child, closed);
    }
  }
}

async function stopBounded(
  child: ReturnType<typeof spawn>,
  closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>,
) {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    closed,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        terminateTree(child, "SIGKILL");
        reject(new Error("Guide harness did not stop within 10s after SIGTERM."));
      }, 10_000);
    }),
  ]).finally(() => clearTimeout(timer));
}

function terminateTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals) {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      /* the process group may have exited */
    }
  }
  child.kill(signal);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Cannot allocate an ephemeral guide port.");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function main() {
  const options = parse(process.argv.slice(2));
  activeScenario = options.scenario;
  await mkdir(LOG_ROOT, { recursive: true });
  const sandbox = await makeSandbox();
  cleanupSandbox = sandbox.cleanup;
  keepSandbox = options.keep ?? false;
  const log = path.join(
    LOG_ROOT,
    `${options.scenario}-${new Date().toISOString().replaceAll(":", "-")}.log`,
  );
  activeLog = log;
  const gitExecutable = findGit();
  const gitDir = path.dirname(gitExecutable);
  const stagedBin = path.join(sandbox.directory, "entry-bin");
  await mkdir(stagedBin, { recursive: true });
  const stagedNode = path.join(stagedBin, process.platform === "win32" ? "node.exe" : "node");
  if (process.platform === "win32") copyFileSync(path.resolve(options.node), stagedNode);
  else symlinkSync(path.resolve(options.node), stagedNode);
  const selectedManager =
    options.scenario === "npm"
      ? options.npm
      : options.scenario === "pnpm"
        ? options.pnpm
        : undefined;
  await stageCommands(stagedBin, stagedNode, options.scenario, selectedManager);
  const systemDirs =
    process.platform === "win32"
      ? [
          path.join(process.env["SystemRoot"] ?? "C:\\Windows", "System32"),
          path.join(
            process.env["SystemRoot"] ?? "C:\\Windows",
            "System32",
            "WindowsPowerShell",
            "v1.0",
          ),
        ]
      : process.platform === "darwin"
        ? ["/usr/bin", "/bin"]
        : ["/usr/bin", "/bin"];
  const env = isolatedEnvironment(
    sandbox.directory,
    protectedPath([stagedBin, gitDir, ...systemDirs]),
  );
  const snapshot = path.join(sandbox.directory, "checkout");
  const sourceCommit = run(
    gitExecutable,
    ["rev-parse", "HEAD"],
    REPO,
    process.env,
    15_000,
  ).stdout.trim();
  if (!/^[0-9a-f]{40,64}$/i.test(sourceCommit))
    throw new Error("Cannot capture exact source commit for the onboarding snapshot.");
  const clone = run(
    gitExecutable,
    ["clone", "--no-hardlinks", "--local", "--no-checkout", REPO, snapshot],
    REPO,
    env,
    60_000,
  );
  await appendLog(log, "independent git clone", clone);
  await command(
    log,
    "checkout exact source commit",
    gitExecutable,
    ["checkout", "--detach", sourceCommit],
    snapshot,
    env,
    60_000,
  );
  await verifyEntryPath(log, options, snapshot, env);
  const head = run(gitExecutable, ["rev-parse", "HEAD"], snapshot, env);
  if (head.code !== 0) throw new Error("Cannot read snapshot commit.");
  const dirty = run(gitExecutable, ["status", "--porcelain"], snapshot, env);
  if (dirty.stdout.trim()) throw new Error("Fresh clone is unexpectedly dirty.");
  const initialCommit = head.stdout.trim();
  const missing = absentArtifacts(snapshot);
  if (missing) throw new Error(`Cold snapshot already contains ${missing}.`);
  const readmeSteps = await readJourney(snapshot);
  for (const id of ["bootstrap", "task-discovery", "readiness", "npm-install", "pnpm-install"]) {
    if (!readmeSteps.some((step) => step.id === id))
      throw new Error(`README executable step ${id} is missing.`);
  }
  const sentinels = await hashes(path.join(sandbox.directory, "home"), [
    ".npmrc",
    ".pnpmrc",
    ".gitconfig",
    ".zshrc",
    ".bashrc",
    "profile",
    "sentinel",
  ]);
  const manifests = await hashes(snapshot, [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ]);
  const nodeVersion = await command(
    log,
    "entry runtime version",
    options.node,
    ["--version"],
    snapshot,
    env,
    15_000,
  );
  const nodeNumber = nodeVersion.stdout.trim().replace(/^v/, "").split(".").map(Number);
  entryNodeVersion = nodeVersion.stdout.trim();
  if (nodeNumber[0]! < 22 || (nodeNumber[0] === 22 && nodeNumber[1]! < 18))
    throw new Error(`Node.js 22.18 or newer is required; got ${nodeVersion.stdout.trim()}.`);
  if (options.scenario !== "bootstrap") {
    const nodePin = await externalToolVersion(snapshot, "node");
    if (entryNodeVersion.replace(/^v/, "") !== nodePin)
      throw new Error(`${options.scenario} lane requires pinned Node ${nodePin}.`);
  }
  if (options.scenario === "bootstrap") {
    const journey = await readJourney(snapshot);
    const bootstrap = journey.find((step) => step.id === "bootstrap");
    if (!bootstrap) throw new Error("README bootstrap step is missing.");
    await command(
      log,
      "literal README bootstrap journey",
      options.node,
      bootstrap.command[0] === "node" ? bootstrap.command.slice(1) : bootstrap.command,
      snapshot,
      env,
    );
    await runReadmeHarnessSteps(log, snapshot, options.node, env);
  }
  if (options.scenario === "npm" || options.scenario === "pnpm") {
    const journey = await readJourney(snapshot);
    const stepId = options.scenario === "npm" ? "npm-install" : "pnpm-install";
    const step = journey.find((candidate) => candidate.id === stepId);
    const manager = options.scenario === "npm" ? options.npm : options.pnpm;
    if (!manager || !step || step.command[0] !== options.scenario)
      throw new Error(`README ${stepId} command or --${options.scenario} is missing.`);
    const nodePin = await externalToolVersion(snapshot, "node");
    if (nodeVersion.stdout.trim().replace(/^v/, "") !== nodePin)
      throw new Error(`${options.scenario} lane requires pinned Node ${nodePin}.`);
    const version = await command(
      log,
      `${options.scenario} exact version`,
      options.node,
      [manager!, "--version"],
      snapshot,
      env,
      15_000,
    );
    const expected = await externalToolVersion(snapshot, options.scenario);
    if (version.stdout.trim() !== expected)
      throw new Error(`${options.scenario} must be ${expected}; got ${version.stdout.trim()}.`);
    managerVersions[options.scenario] = version.stdout.trim();
    await command(
      log,
      `literal README ${stepId}`,
      process.platform === "win32" ? `${options.scenario}.cmd` : options.scenario,
      step.command.slice(1),
      snapshot,
      env,
    );
    await runReadmeHarnessSteps(log, snapshot, options.node, env);
  }
  if (options.scenario === "journey") await runJourney(log, snapshot, options.node, env);
  const finalManifests = await hashes(snapshot, [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ]);
  if (JSON.stringify(manifests) !== JSON.stringify(finalManifests))
    throw new Error("Install changed package manifests or lockfiles.");
  const sentinelsAfter = await hashes(path.join(sandbox.directory, "home"), Object.keys(sentinels));
  if (JSON.stringify(sentinels) !== JSON.stringify(sentinelsAfter))
    throw new Error("Shell/global-config sentinel changed.");
  const finalHead = run(gitExecutable, ["rev-parse", "HEAD"], snapshot, env).stdout.trim();
  if (finalHead !== initialCommit) throw new Error("Snapshot HEAD changed during onboarding.");
  for (const artifact of ["node_modules", "dist"]) {
    if (!existsSync(path.join(snapshot, artifact)))
      throw new Error(`Onboarding did not create ${artifact}/.`);
  }
  await verifyInstalledCheckout(log, snapshot, options.node, env);
  await writeSummary("completed", initialCommit);
  console.log(
    JSON.stringify({
      scenario: options.scenario,
      status: "completed",
      node: entryNodeVersion,
      managers: managerVersions,
      commit: initialCommit,
      log,
      outcomes: phases,
    }),
  );
}

async function hashes(root: string, names: string[]) {
  const result: Record<string, string | null> = {};
  for (const name of names) {
    try {
      result[name] = sha256(await readFile(path.join(root, name)));
    } catch {
      result[name] = null;
    }
  }
  return result;
}

async function externalToolVersion(checkout: string, name: "node" | "npm" | "pnpm") {
  const config = JSON.parse(
    await readFile(path.join(checkout, ".config/external-tools.json"), "utf8"),
  ) as {
    tools: Record<string, { version: string }>;
  };
  return config.tools[name]!.version;
}

function findGit() {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["git"], {
    encoding: "utf8",
  });
  const executable = result.stdout.trim().split(/\r?\n/)[0];
  if (result.status !== 0 || !executable)
    throw new Error("Git is required as an onboarding prerequisite.");
  return executable;
}

async function stageCommands(bin: string, node: string, scenario: Scenario, manager?: string) {
  for (const name of ["npm", "pnpm", "npx", "corepack", "nub", "mise"]) {
    const selected = manager && name === scenario;
    const suffix = process.platform === "win32" ? ".cmd" : "";
    const target = path.join(bin, `${name}${suffix}`);
    let body: string;
    if (selected) {
      if (process.platform === "win32") {
        body = `@echo off\r\n"%~dp0node.exe" "${manager}" %*\r\nexit /b %ERRORLEVEL%\r\n`;
      } else {
        const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
        body = `#!/bin/sh\nexec ${quote(node)} ${quote(manager)} "$@"\n`;
      }
    } else if (process.platform === "win32") {
      body = `@echo onboarding isolation blocked undeclared command ${name} 1>&2\r\nexit /b 125\r\n`;
    } else {
      body = `#!/bin/sh\nprintf '%s\\n' 'onboarding isolation blocked undeclared command ${name}' >&2\nexit 125\n`;
    }
    writeFileSync(target, body);
    if (process.platform !== "win32") chmodSync(target, 0o755);
  }
}

function redact(value: string) {
  let result = value;
  for (const [name, secret] of Object.entries(process.env)) {
    if (secret && /(TOKEN|PASSWORD|SECRET|PRIVATE_KEY|PROXY|CA_CERT)/i.test(name)) {
      result = result.replaceAll(secret, "[redacted]");
    }
  }
  return result;
}

async function verifyInstalledCheckout(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
) {
  const discovery = await command(
    log,
    "guided task discovery",
    node,
    ["scripts/repo/develop/run.mts", "--list", "--json"],
    checkout,
    env,
  );
  const discoveryData = parseHarnessJson(discovery.stdout);
  assertTaskDiscovery(discoveryData);
  const tasks = discoveryData.tasks as Array<{ id: string; execution: string[] }>;
  const check = tasks.find((task) => task.id === "setup:check");
  if (!check) throw new Error("Setup diagnostics task is missing from harness discovery.");
  await harness(log, checkout, node, env, check.execution, "completed");
  await verifyBuildOutputs(log, checkout, node, env);
  const wrapperEnv = {
    ...env,
    PATH: protectedPath([path.join(checkout, ".cache", "bin"), env.PATH ?? ""]),
  };
  for (const manager of ["npm", "pnpm"]) {
    const suffix = process.platform === "win32" ? ".cmd" : "";
    const wrapper = path.join(checkout, ".cache", "bin", `${manager}${suffix}`);
    if (!existsSync(wrapper))
      throw new Error(`Lifecycle did not install the ${manager} Firewall launcher.`);
    const result = await command(
      log,
      `${manager} Firewall launcher smoke check`,
      wrapper,
      ["--version"],
      checkout,
      wrapperEnv,
      30_000,
    );
    const expected = await externalToolVersion(checkout, manager);
    if (result.stdout.trim() !== expected)
      throw new Error(
        `${manager} Firewall launcher reported ${result.stdout.trim()}, expected ${expected}.`,
      );
    managerVersions[manager] = result.stdout.trim();
  }
}

async function verifyEntryPath(
  log: string,
  options: Options,
  checkout: string,
  env: NodeJS.ProcessEnv,
) {
  for (const name of ["npm", "pnpm"] as const) {
    const executable = process.platform === "win32" ? `${name}.cmd` : name;
    if (options.scenario === name) {
      const result = await command(
        log,
        `declared ${name} PATH entry`,
        executable,
        ["--version"],
        checkout,
        env,
        15_000,
      );
      const expected = await externalToolVersion(checkout, name);
      if (result.stdout.trim() !== expected)
        throw new Error(
          `${name} PATH entry reported ${result.stdout.trim()}, expected ${expected}.`,
        );
      managerVersions[name] = result.stdout.trim();
    } else {
      const result = await command(
        log,
        `blocked undeclared ${name} PATH entry`,
        executable,
        ["--version"],
        checkout,
        env,
        15_000,
        125,
      );
      if (!result.stderr.includes("blocked undeclared command"))
        throw new Error(`Undeclared ${name} did not resolve to the isolation guard.`);
    }
  }
}

async function runJourney(log: string, checkout: string, node: string, env: NodeJS.ProcessEnv) {
  const list = await command(
    log,
    "harness task discovery",
    node,
    ["scripts/repo/develop/run.mts", "--list", "--json"],
    checkout,
    env,
  );
  const discovery = parseHarnessJson(list.stdout);
  assertTaskDiscovery(discovery);
  const tasks = discovery.tasks as Array<{ id: string; execution: string[] }>;
  const setup = tasks.find((task) => task.id === "setup");
  const guide = tasks.find((task) => task.id === "guide");
  const review = tasks.find((task) => task.id === "review");
  const check = tasks.find((task) => task.id === "setup:check");
  if (!setup || !guide || !review || !check)
    throw new Error(
      "Harness did not discover required setup, guide, review, and diagnostics tasks.",
    );
  const before = await harness(log, checkout, node, env, check.execution, "failed");
  if (before.exitCode === 0) throw new Error("Setup diagnostics passed before setup.");
  await harness(log, checkout, node, env, setup.execution, "completed");
  await harness(log, checkout, node, env, check.execution, "completed");
  await startGuide(log, checkout, node, env, guide.execution);
  await harness(log, checkout, node, env, review.execution, "completed");
  const setupScript = path.join(checkout, "scripts/repo/setup/bootstrap.mts");
  await rm(path.join(checkout, "dist"), { recursive: true, force: true });
  await command(log, "repeat setup after removing dist", node, [setupScript], checkout, env);
  if (!(await exists(path.join(checkout, "dist"))))
    throw new Error("Repeat setup did not rebuild dist/.");
  await verifyBuildOutputs(log, checkout, node, env);
}

async function runReadmeHarnessSteps(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
) {
  for (const step of await readJourney(checkout)) {
    if (step.id !== "task-discovery" && step.id !== "readiness") continue;
    const args = step.command[0] === "node" ? step.command.slice(1) : step.command;
    const result = await command(log, `literal README ${step.id}`, node, args, checkout, env);
    const value = parseHarnessJson(result.stdout);
    if (step.id === "task-discovery") {
      assertTaskDiscovery(value);
    } else {
      assertHarnessResult(value, "completed", result.code, "setup:check");
    }
  }
}

async function verifyBuildOutputs(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
) {
  const config = await import(pathToFileURL(path.join(checkout, ".config/build.config.mts")).href);
  for (const item of config.packageFiles as Array<{ output: string }>) {
    const output = path.join(checkout, item.output);
    if (!(await exists(output)) || (await stat(output)).size === 0) {
      throw new Error(`Build output is missing or empty: ${item.output}.`);
    }
  }
  await command(
    log,
    "package manifest and export check",
    node,
    ["scripts/repo/build/manifest.mts"],
    checkout,
    env,
  );
  await command(
    log,
    "built engine module load smoke check",
    node,
    ["-e", "require('./dist/nwsapi.js')"],
    checkout,
    env,
  );
}

async function exists(target: string) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeSummary(status: string, commit?: string, message?: string) {
  const summary = {
    scenario: activeScenario ?? "unknown",
    status,
    entryNodeVersion: entryNodeVersion || null,
    managerVersions,
    commit: commit ?? null,
    message: message ? redact(message) : null,
    phases,
  };
  if (activeLog)
    await writeFile(`${activeLog}.summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

main()
  .catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    const summary = await writeSummary("failed", undefined, message);
    if (activeLog)
      await writeFile(
        activeLog,
        `\n## summary\nstatus=failed\nmessage=${redact(message)}\nphases=${JSON.stringify(phases)}\n`,
        { flag: "a" },
      );
    console.error(JSON.stringify({ ...summary, log: activeLog || null }));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!keepSandbox) await cleanupSandbox?.();
  });
