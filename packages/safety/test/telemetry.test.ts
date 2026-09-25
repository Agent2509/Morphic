import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { TelemetryReporter } from "../src/telemetry.js";

const LOG = path.join(".morphic", "telemetry.jsonl");

async function readEvents(dir: string): Promise<any[]> {
  const raw = await fs.readFile(path.join(dir, LOG), "utf-8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("TelemetryReporter", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-telemetry-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("does nothing when disabled", async () => {
    const reporter = new TelemetryReporter(dir, false);
    await reporter.record({ event: "session_start" });
    await expect(fs.access(path.join(dir, LOG))).rejects.toThrow();
  });

  it("appends events when enabled", async () => {
    const reporter = new TelemetryReporter(dir, true);
    await reporter.record({ event: "session_start", tier: "T4", cpuCores: 14 });
    await reporter.record({ event: "session_end" });

    const events = await readEvents(dir);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("session_start");
    expect(events[0].tier).toBe("T4");
    expect(typeof events[0].timestamp).toBe("string");
    expect(events[1].event).toBe("session_end");
  });

  it("never throws when the filesystem is unwritable", async () => {
    const reporter = new TelemetryReporter("/proc/definitely/not/writable", true);
    await expect(reporter.record({ event: "x" })).resolves.toBeUndefined();
  });

  it("serializes concurrent writes without losing events", async () => {
    const reporter = new TelemetryReporter(dir, true);
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => reporter.record({ event: `e${i}` }))
    );
    expect(await readEvents(dir)).toHaveLength(5);
  });

  it("appends to existing telemetry without destroying it", async () => {
    const reporter = new TelemetryReporter(dir, true);
    await fs.mkdir(path.join(dir, ".morphic"), { recursive: true });
    await fs.writeFile(path.join(dir, LOG), '{"event":"preexisting","timestamp":"t"}\n', "utf-8");

    await reporter.record({ event: "fresh" });

    const events = await readEvents(dir);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("preexisting");
    expect(events[1].event).toBe("fresh");
  });
});
