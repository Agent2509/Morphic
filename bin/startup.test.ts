import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { isGitRepo, resolveStartupPaths } from "./startup.js";

describe("startup path resolution", () => {
  let dir: string;
  let home: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-startup-cwd-"));
    home = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-startup-home-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  it("does not treat a non-git directory as a project and writes nothing there", () => {
    expect(isGitRepo(dir)).toBe(false);

    const paths = resolveStartupPaths(dir, home, false);
    expect(paths.shadowGitDir).toBeNull();
    expect(paths.sessionDbPath).toBe(path.join(home, ".morphic", "sessions.db"));
    expect(paths.writeProjectProfile).toBe(false);

    expect(fsSync.existsSync(path.join(dir, ".morphic"))).toBe(false);
    expect(fsSync.existsSync(path.join(dir, ".git"))).toBe(false);
  });

  it("uses project-local paths inside a git work tree", async () => {
    execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
    expect(isGitRepo(dir)).toBe(true);

    const paths = resolveStartupPaths(dir, home, true);
    expect(paths.shadowGitDir).toBe(dir);
    expect(paths.sessionDbPath).toBe(path.join(dir, ".morphic", "sessions.db"));
    expect(paths.writeProjectProfile).toBe(true);
  });
});
