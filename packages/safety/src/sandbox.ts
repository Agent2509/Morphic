import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { SandboxOptions, SandboxResult } from "./types.js";

const execAsync = promisify(exec);

export class PodmanSandbox {
  private cachedAvailable: boolean | null = null;
  private version: string | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.cachedAvailable !== null) return this.cachedAvailable;

    try {
      const { stdout } = await execAsync("podman --version");
      this.version = stdout.trim();
      this.cachedAvailable = true;
      return true;
    } catch {
      this.cachedAvailable = false;
      return false;
    }
  }

  async getVersion(): Promise<string | null> {
    await this.isAvailable();
    return this.version;
  }

  buildPodmanArgs(command: string, options: SandboxOptions = {}): string[] {
    const cwd = options.cwd || process.cwd();
    const network = options.network || "none";
    const memLimit = options.memoryLimit || "2g";
    const cpuLimit = options.cpuLimit || "2";
    const image = options.image || "alpine:latest";

    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(image)) {
      throw new Error(`Invalid sandbox image reference: '${image}'`);
    }

    const args = [
      "run",
      "--rm",
      "-i",
      `--network=${network}`,
      `--memory=${memLimit}`,
      `--cpus=${cpuLimit}`,
      "--userns=keep-id",
      "-v",
      `${cwd}:/workspace:rw`,
      "-w",
      "/workspace",
    ];

    if (options.env) {
      for (const [k, v] of Object.entries(options.env)) {
        args.push("-e", `${k}=${v}`);
      }
    }

    args.push("--", image, "sh", "-c", command);
    return args;
  }

  async execute(command: string, options: SandboxOptions = {}): Promise<SandboxResult> {
    const available = await this.isAvailable();

    if (!available) {
      if (options.failClosed) {
        return {
          stdout: "",
          stderr: "",
          exitCode: 127,
          sandboxed: false,
          fallbackReason:
            "Podman is not installed or available; refusing to execute outside the sandbox.",
        };
      }

      // Graceful fallback to host execution
      return new Promise<SandboxResult>((resolve) => {
        const cwd = options.cwd || process.cwd();
        const timeout = options.timeoutMs || 60000;
        exec(
          command,
          {
            cwd,
            env: { ...process.env, ...(options.env || {}) },
            timeout,
            maxBuffer: 5 * 1024 * 1024,
            signal: options.signal,
          },
          (err: any, stdout, stderr) => {
            const timedOut = Boolean(err?.killed);
            resolve({
              stdout: stdout ? stdout.toString() : "",
              stderr: stderr ? stderr.toString() : "",
              exitCode: err
                ? timedOut
                  ? 124
                  : typeof err.code === "number"
                    ? err.code
                    : 1
                : 0,
              sandboxed: false,
              fallbackReason: "Podman is not installed or available on this system.",
            });
          }
        );
      });
    }

    let podmanArgs: string[];
    try {
      podmanArgs = this.buildPodmanArgs(command, options);
    } catch (err: any) {
      return {
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        sandboxed: false,
        fallbackReason: err.message,
      };
    }

    return new Promise<SandboxResult>((resolve) => {
      const proc = spawn("podman", podmanArgs, {
        cwd: options.cwd || process.cwd(),
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const MAX_OUTPUT = 5 * 1024 * 1024;

      proc.stdout.on("data", (data) => {
        if (stdout.length < MAX_OUTPUT) stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        if (stderr.length < MAX_OUTPUT) stderr += data.toString();
      });

      const timeout = options.timeoutMs || 60000;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, timeout);

      const onAbort = () => {
        proc.kill("SIGKILL");
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });

      const finish = (result: SandboxResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        resolve(result);
      };

      proc.on("close", (code, signal) => {
        if (timedOut) {
          stderr += `\n[Morphic Sandbox] Command timed out after ${timeout}ms.`;
          finish({ stdout, stderr, exitCode: 124, sandboxed: true });
          return;
        }
        finish({
          stdout,
          stderr,
          exitCode: signal ? 1 : (code ?? 0),
          sandboxed: true,
        });
      });

      proc.on("error", (err) => {
        finish({
          stdout,
          stderr: `[Morphic Sandbox Error]: ${err.message}`,
          exitCode: 1,
          sandboxed: false,
          fallbackReason: `Podman spawn failed: ${err.message}`,
        });
      });
    });
  }
}
