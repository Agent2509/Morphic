import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ShadowGit } from "../src/snapshot/shadow-git.js";

describe("ShadowGit safety", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-shadow-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("does not execute shell metacharacters in snapshot messages", async () => {
    const shadow = new ShadowGit(dir);
    await shadow.init();
    await fs.writeFile(path.join(dir, "a.txt"), "hello", "utf-8");

    const hash = await shadow.snapshot('evil"; touch pwned; echo $(touch pwned2) #');
    expect(hash).toBeTruthy();

    const entries = await fs.readdir(dir);
    expect(entries).not.toContain("pwned");
    expect(entries).not.toContain("pwned2");
  });

  it("preserves untracked user files through undo", async () => {
    const shadow = new ShadowGit(dir);
    await shadow.init();

    const file = path.join(dir, "a.txt");
    await fs.writeFile(file, "v1", "utf-8");
    await shadow.snapshot("v1");
    await fs.writeFile(file, "v2", "utf-8");
    await shadow.snapshot("v2");

    const userFile = path.join(dir, "user-notes.tmp");
    await fs.writeFile(userFile, "keep me", "utf-8");

    const res = await shadow.undo();
    expect(res.success).toBe(true);

    expect(await fs.readFile(file, "utf-8")).toBe("v1");
    expect(await fs.readFile(userFile, "utf-8")).toBe("keep me");
  });

  it("reverts uncommitted tracked edits back to the last snapshot", async () => {
    const shadow = new ShadowGit(dir);
    await shadow.init();

    const file = path.join(dir, "a.txt");
    await fs.writeFile(file, "v1", "utf-8");
    await shadow.snapshot("v1");

    // Simulate an agent turn that edits the file without taking a snapshot
    await fs.writeFile(file, "v2-agent", "utf-8");

    const res = await shadow.undo();
    expect(res.success).toBe(true);
    expect(await fs.readFile(file, "utf-8")).toBe("v1");
  });

  it("removes files created by the undone snapshot (exact revert)", async () => {
    const shadow = new ShadowGit(dir);
    await shadow.init();

    await fs.writeFile(path.join(dir, "keep.txt"), "keep", "utf-8");
    await shadow.snapshot("baseline");

    await fs.writeFile(path.join(dir, "created.txt"), "agent made me", "utf-8");
    await fs.mkdir(path.join(dir, "newdir"), { recursive: true });
    await fs.writeFile(path.join(dir, "newdir", "nested.txt"), "nested", "utf-8");
    await shadow.snapshot("agent changes");

    const res = await shadow.undo();
    expect(res.success).toBe(true);

    await expect(fs.access(path.join(dir, "created.txt"))).rejects.toThrow();
    await expect(fs.access(path.join(dir, "newdir", "nested.txt"))).rejects.toThrow();
    expect(await fs.readFile(path.join(dir, "keep.txt"), "utf-8")).toBe("keep");
  });

  it("round-trips messages containing pipe characters", async () => {
    const shadow = new ShadowGit(dir);
    await shadow.init();
    await fs.writeFile(path.join(dir, "a.txt"), "x", "utf-8");
    await shadow.snapshot("feat: add a | b support");

    const history = await shadow.history(5);
    expect(history.some((h) => h.message === "feat: add a | b support")).toBe(true);
  });
});
