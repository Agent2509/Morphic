import { spawn, type ChildProcess } from "node:child_process";
import { SecretScanner } from "@morphic/safety";
import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  StdioServerConfig,
} from "../types.js";

const ENV_ALLOWLIST = new Set([
  "PATH",
  "HOME",
  "LANG",
  "TERM",
  "TMPDIR",
  "TZ",
  "USER",
  "SHELL",
]);

export function buildChildEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (ENV_ALLOWLIST.has(key) || key.startsWith("LC_")) {
      env[key] = value;
    }
  }
  return { ...env, ...(extra || {}) };
}

export class StdioTransport {
  private child: ChildProcess | null = null;
  private pending = new Map<
    string | number,
    {
      resolve: (res: JsonRpcResponse) => void;
      reject: (err: Error) => void;
    }
  >();
  private buffer = "";
  private nextId = 1;

  constructor(private config: StdioServerConfig) {}

  start(): void {
    if (this.child) return;

    const child = spawn(this.config.command, this.config.args || [], {
      env: buildChildEnv(this.config.env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    child.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf-8");
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const handlers = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            handlers.resolve(msg);
          }
        } catch {
          // ignore non-json log lines
        }
      }
    });

    const scanner = new SecretScanner();
    child.stderr?.on("data", (chunk: Buffer) => {
      // Surface server diagnostics with secrets redacted.
      const text = scanner.sanitize(chunk.toString("utf-8").trim());
      if (text) process.stderr.write(`[MCP:${this.config.command}] ${text}\n`);
    });

    child.on("error", (err) => {
      for (const [, handlers] of this.pending) {
        handlers.reject(err);
      }
      this.pending.clear();
      if (this.child === child) this.child = null;
    });

    child.on("close", (code) => {
      for (const [, handlers] of this.pending) {
        handlers.reject(new Error(`MCP server process exited with code ${code}`));
      }
      this.pending.clear();
      if (this.child === child) this.child = null;
    });
  }

  notify(method: string, params?: any): void {
    if (!this.child) {
      this.start();
    }
    const notification: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    try {
      this.child?.stdin?.write(JSON.stringify(notification) + "\n");
    } catch {
      // best-effort notification
    }
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this.child) {
      this.start();
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out after 30000ms`));
      }, 30000);

      this.pending.set(id, {
        resolve: (response: JsonRpcResponse) => {
          clearTimeout(timer);
          if (response.error) {
            reject(new Error(`MCP error ${response.error.code}: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      try {
        this.child?.stdin?.write(JSON.stringify(request) + "\n");
      } catch (err: any) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  close(): void {
    const child = this.child;
    this.child = null;

    for (const [, handlers] of this.pending) {
      handlers.reject(new Error("MCP transport closed"));
    }
    this.pending.clear();

    if (child) {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
      timer.unref?.();
      child.once("close", () => clearTimeout(timer));
    }
  }
}
