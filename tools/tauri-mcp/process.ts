import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOG_PATH = path.join(PROJECT_ROOT, ".tauri-mcp", "tauri-dev.log");
const MAX_LOG_CHARS = 80_000;

type DevProcessStatus = {
  managed: boolean;
  starting: boolean;
  running: boolean;
  pid: number | undefined;
  exit: { code: number | null; signal: NodeJS.Signals | null } | null;
  spawnError: string | null;
  logPath: string;
};

let child: ChildProcess | null = null;
let startPromise: Promise<DevProcessStatus> | null = null;
let output = "";
let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
let spawnError: string | null = null;
let launchId = 0;

function appendOutput(chunk: Buffer | string): void {
  output = `${output}${chunk.toString()}`.slice(-MAX_LOG_CHARS);
  void mkdir(path.dirname(LOG_PATH), { recursive: true })
    .then(() => writeFile(LOG_PATH, output))
    .catch(() => undefined);
}

export function devProcessStatus(): DevProcessStatus {
  return {
    managed: child !== null || startPromise !== null || exit !== null || spawnError !== null,
    starting: startPromise !== null && child === null,
    running: child !== null && child.exitCode === null,
    pid: child?.pid,
    exit,
    spawnError,
    logPath: LOG_PATH,
  };
}

export function devProcessLogs(tailChars = 12_000): string {
  return output.slice(-tailChars);
}

export function devProcessFailure(): string | null {
  if (spawnError) return `Tauri dev failed to start: ${spawnError}`;
  if (exit) {
    const reason = exit.signal ? `signal ${exit.signal}` : `exit code ${exit.code}`;
    return `Tauri dev exited before WebDriver became ready (${reason})`;
  }
  return null;
}

async function startDevProcessOnce(): Promise<DevProcessStatus> {
  output = "";
  exit = null;
  spawnError = null;
  const currentLaunchId = ++launchId;

  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  await writeFile(LOG_PATH, "");

  let spawned: ChildProcess;
  try {
    spawned = spawn("npm", ["run", "--silent", "tauri:dev:mcp"], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      detached: process.platform !== "win32",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    });
  } catch (error) {
    spawnError = String(error);
    appendOutput(`\nFailed to start Tauri dev: ${spawnError}\n`);
    throw error;
  }

  child = spawned;
  spawned.stdout?.on("data", appendOutput);
  spawned.stderr?.on("data", appendOutput);
  spawned.on("error", (error) => {
    if (launchId !== currentLaunchId) return;
    spawnError = String(error);
    appendOutput(`\nFailed to start Tauri dev: ${spawnError}\n`);
    if (child === spawned) child = null;
  });
  spawned.on("exit", (code, signal) => {
    if (launchId !== currentLaunchId) return;
    exit = { code, signal };
    if (child === spawned) child = null;
  });

  return devProcessStatus();
}

export function startDevProcess(): Promise<DevProcessStatus> {
  if (child?.exitCode === null) return Promise.resolve(devProcessStatus());
  if (startPromise) return startPromise;

  const pending = startDevProcessOnce();
  startPromise = pending.finally(() => {
    startPromise = null;
  });
  return startPromise;
}

export async function stopDevProcess(): Promise<boolean> {
  await startPromise?.catch(() => undefined);
  const processToStop = child;
  if (!processToStop?.pid || processToStop.exitCode !== null) {
    child = null;
    return false;
  }

  const pid = processToStop.pid;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      processToStop.kill("SIGTERM");
    }
  }

  if (child === processToStop) child = null;
  return true;
}
