import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { shellExecTool } from "../src/exec/shell.js";

describe("shell_exec safety and exit handling", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-shell-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("blocks catastrophic commands", async () => {
    const res = await shellExecTool.execute({ command: "rm -rf /" }, { cwd: dir });
    expect(res.success).toBe(false);
    expect(res.error).toContain("BLOCKED");
    expect(res.metadata?.assessment.isBlocked).toBe(true);
  });

  it("reports non-zero exit codes and stderr", async () => {
    const res = await shellExecTool.execute(
      { command: "echo oops >&2; exit 3" },
      { cwd: dir }
    );
    expect(res.success).toBe(false);
    expect(res.metadata?.exitCode).toBe(3);
    expect(res.metadata?.stderr).toContain("oops");
  });

  it("captures stdout and works with a relative cwd", async () => {
    await fs.mkdir(path.join(dir, "sub"));
    const res = await shellExecTool.execute(
      { command: "pwd", cwd: "sub" },
      { cwd: dir }
    );
    expect(res.success).toBe(true);
    expect(res.output).toContain("sub");
  });

  it("reports timeouts", async () => {
    const res = await shellExecTool.execute(
      { command: "sleep 5", timeoutMs: 200 },
      { cwd: dir }
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("timed out");
  });

  it("redacts secrets in command output", async () => {
    const res = await shellExecTool.execute(
      { command: "echo sk-proj-1234567890abcdef1234567890abcdef" },
      { cwd: dir }
    );
    expect(res.success).toBe(true);
    expect(res.output).not.toContain("sk-proj-1234567890abcdef1234567890abcdef");
    expect(res.output).toContain("REDACTED");
  });
});
