import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { KnowledgeGraph, ShadowGit, SQLiteSessionStore } from "../src/index.js";

describe("KnowledgeGraph search", () => {
  it("finds nodes by id or label, case-insensitively", () => {
    const graph = new KnowledgeGraph();
    graph.addNode({ id: "n1", label: "AgentController", type: "symbol" });
    graph.addNode({ id: "n2", label: "PermissionEngine", type: "symbol" });

    expect(graph.search("agent")).toHaveLength(1);
    expect(graph.search("PERMISSION")).toHaveLength(1);
    expect(graph.search("missing")).toHaveLength(0);
  });
});

describe("ShadowGit diff", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-shadow-diff-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns an empty diff when clean and a diff after edits", async () => {
    const shadow = new ShadowGit(dir);
    await shadow.init();
    await fs.writeFile(path.join(dir, "a.txt"), "one", "utf-8");
    await shadow.snapshot("one");
    expect(await shadow.diff()).toBe("");

    await fs.writeFile(path.join(dir, "a.txt"), "two", "utf-8");
    expect(await shadow.diff()).toContain("two");
  });
});

describe("SQLiteSessionStore search", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `morphic-search-${Date.now()}-${Math.random()}.db`);
  });

  afterEach(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        const p = dbPath + suffix;
        if (fsSync.existsSync(p)) fsSync.unlinkSync(p);
      } catch {}
    }
  });

  it("searches message content and joins the session title", async () => {
    const store = new SQLiteSessionStore(dbPath);
    await store.saveSession({
      id: "s1",
      title: "Auth Work",
      createdAt: 1,
      updatedAt: 1,
      tier: "T4",
      provider: "ollama",
      model: "qwen",
    });
    await store.saveMessages("s1", [
      { id: "m1", sessionId: "s1", role: "user", content: "fix the login bug", timestamp: 2 },
      { id: "m2", sessionId: "s1", role: "assistant", content: "done", timestamp: 3 },
    ]);

    const hits = store.searchMessages("login");
    expect(hits).toHaveLength(1);
    expect(hits[0].sessionTitle).toBe("Auth Work");
    expect(store.searchMessages("nothing")).toHaveLength(0);
    store.close();
  });
});
