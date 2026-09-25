import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { readFileTool } from "../src/code/read.js";
import { createFileTool } from "../src/code/create.js";
import { resolveSafePath } from "../src/path-utils.js";

describe("Path confinement", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-path-test-"));
    root = path.join(base, "project");
    outside = path.join(base, "outside");
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(outside, "secret.txt"), "top secret", "utf-8");
  });

  afterEach(async () => {
    await fs.rm(path.dirname(root), { recursive: true, force: true });
  });

  it("allows nested paths inside the workspace", async () => {
    const res = await resolveSafePath(root, "src/deep/file.ts");
    expect(res.ok).toBe(true);
    expect(res.abs).toBe(path.join(root, "src/deep/file.ts"));
  });

  it("rejects parent-directory traversal", async () => {
    const res = await resolveSafePath(root, "../outside/secret.txt");
    expect(res.ok).toBe(false);
  });

  it("rejects absolute paths outside the workspace", async () => {
    const res = await resolveSafePath(root, path.join(outside, "secret.txt"));
    expect(res.ok).toBe(false);
  });

  it("rejects symlink escape", async () => {
    try {
      await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
    } catch {
      return; // symlinks unsupported in this environment
    }
    const res = await resolveSafePath(root, "link.txt");
    expect(res.ok).toBe(false);
  });

  it("read_file refuses traversal", async () => {
    const res = await readFileTool.execute(
      { path: "../outside/secret.txt" },
      { cwd: root }
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("escapes the project workspace");
  });

  it("create_file refuses traversal", async () => {
    const res = await createFileTool.execute(
      { path: "../outside/evil.txt", content: "x" },
      { cwd: root }
    );
    expect(res.success).toBe(false);
    await expect(fs.access(path.join(outside, "evil.txt"))).rejects.toThrow();
  });
});
