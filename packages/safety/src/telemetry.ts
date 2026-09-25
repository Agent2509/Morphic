import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface TelemetryEvent {
  event: string;
  tier?: string;
  primaryModel?: string;
  os?: string;
  cpuCores?: number;
  ramGb?: number;
  timestamp: string;
}

export class TelemetryReporter {
  private logPath: string;
  private enabled: boolean;
  // Serializes writes within the process; O_APPEND keeps cross-process writes safe.
  private queue: Promise<void> = Promise.resolve();

  constructor(baseDir: string = process.cwd(), enabled: boolean = false) {
    this.logPath = path.join(baseDir, ".morphic", "telemetry.jsonl");
    this.enabled = enabled;
  }

  record(event: Omit<TelemetryEvent, "timestamp">): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.queue = this.queue.then(() => this.write(event)).catch(() => {});
    return this.queue;
  }

  private async write(event: Omit<TelemetryEvent, "timestamp">): Promise<void> {
    try {
      const fullEvent: TelemetryEvent = { ...event, timestamp: new Date().toISOString() };
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      // Single append of one line is atomic on POSIX, so concurrent processes
      // never overwrite each other's events.
      await fs.appendFile(this.logPath, JSON.stringify(fullEvent) + "\n", {
        encoding: "utf-8",
        mode: 0o600,
      });
    } catch {
      // Telemetry must never crash the agent
    }
  }
}
