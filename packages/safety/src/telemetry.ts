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
  // Serializes writes within the process to avoid lost updates.
  private queue: Promise<void> = Promise.resolve();

  constructor(baseDir: string = process.cwd(), enabled: boolean = false) {
    this.logPath = path.join(baseDir, ".morphic", "telemetry.json");
    this.enabled = enabled;
  }

  record(event: Omit<TelemetryEvent, "timestamp">): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.queue = this.queue.then(() => this.write(event)).catch(() => {});
    return this.queue;
  }

  private async write(event: Omit<TelemetryEvent, "timestamp">): Promise<void> {
    try {
      const fullEvent: TelemetryEvent = {
        ...event,
        timestamp: new Date().toISOString(),
      };

      await fs.mkdir(path.dirname(this.logPath), { recursive: true });

      let existing: TelemetryEvent[] = [];
      try {
        const raw = await fs.readFile(this.logPath, "utf-8");
        const parsed = JSON.parse(raw);
        existing = Array.isArray(parsed) ? parsed : [];
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          // Preserve unreadable telemetry instead of destroying it.
          try {
            await fs.rename(this.logPath, `${this.logPath}.corrupt-${Date.now()}`);
          } catch {
            // ignore
          }
        }
        existing = [];
      }

      existing.push(fullEvent);

      const tmpPath = `${this.logPath}.${process.pid}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(existing, null, 2), "utf-8");
      await fs.rename(tmpPath, this.logPath);
    } catch {
      // Telemetry must never crash the agent
    }
  }
}
