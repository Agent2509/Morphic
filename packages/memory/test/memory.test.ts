import { describe, expect, it, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  KnowledgeGraph,
  ProjectRulesParser,
  SQLiteSessionStore,
  ShadowGit,
} from "../src/index.js";

describe("KnowledgeGraph", () => {
  it("adds nodes and edges and retrieves neighbors", () => {
    const graph = new KnowledgeGraph();
    graph.addNode({
      id: "node_1",
      label: "AgentController",
      type: "symbol",
      data: { kind: "class", path: "src/agent.ts" },
    });

    graph.addNode({
      id: "node_2",
      label: "PermissionEngine",
      type: "symbol",
      data: { kind: "class", path: "src/permission.ts" },
    });

    graph.addEdge({
      source: "node_1",
      target: "node_2",
      type: "depends_on",
      weight: 1.0,
    });

    expect(graph.getNode("node_1")?.label).toBe("AgentController");
    expect(graph.getNodeCount()).toBe(2);
    expect(graph.getEdgeCount()).toBe(1);

    const neighbors = graph.getNeighbors("node_1");
    expect(neighbors.length).toBe(1);
    expect(neighbors[0].id).toBe("node_2");
  });

  it("generates markdown context snippet", () => {
    const graph = new KnowledgeGraph();
    graph.addNode({
      id: "rule_1",
      label: "TypeScript Rule: Always strict typing",
      type: "rule",
    });
    graph.addNode({
      id: "pattern_1",
      label: "Architecture: 5-agent pipeline",
      type: "pattern",
    });

    const snippet = graph.generateContextSnippet();
    expect(snippet).toContain("Project Architecture & Memory");
    expect(snippet).toContain("TypeScript Rule");
    expect(snippet).toContain("Architecture: 5-agent pipeline");
  });

  it("exports and imports graph state", () => {
    const graph1 = new KnowledgeGraph();
    graph1.addNode({ id: "a", label: "Alpha", type: "module" });
    graph1.addNode({ id: "b", label: "Beta", type: "module" });
    graph1.addEdge({ source: "a", target: "b", type: "references" });

    const exported = graph1.exportGraph();
    const graph2 = new KnowledgeGraph();
    graph2.importGraph(exported);

    expect(graph2.getNodeCount()).toBe(2);
    expect(graph2.getEdgeCount()).toBe(1);
    expect(graph2.getNeighbors("a")[0].label).toBe("Beta");
  });
});

describe("ProjectRulesParser", () => {
  it("parses rules from markdown content", () => {
    const parser = new ProjectRulesParser();
    const markdown = `# Project Guidelines
- Do not edit generated files directly
- Always run tests with bun test
- Never use console.log in production
`;
    const rules = parser.parseRulesContent(markdown, "TEST_RULES.md");
    expect(rules.rules.length).toBe(3);
    expect(rules.rules[0].description).toContain("Do not edit generated files directly");
    expect(rules.rules[1].description).toContain("Always run tests with bun test");

    const snippet = parser.toContextSnippet(rules);
    expect(snippet).toContain("PROJECT INSTRUCTIONS & RULES");
    expect(snippet).toContain("Do not edit generated files directly");
  });
});

describe("SQLiteSessionStore", () => {
  const tmpDbPath = path.join(os.tmpdir(), `morphic_test_${Date.now()}.db`);

  afterEach(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        const p = tmpDbPath + suffix;
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }
  });

  it("creates tables, saves session, retrieves and lists sessions", async () => {
    const store = new SQLiteSessionStore(tmpDbPath);
    await store.saveSession({
      id: "sess_1",
      title: "Test Session 1",
      createdAt: 1000,
      updatedAt: 1000,
      tier: "T4",
      provider: "ollama",
      model: "llama3.1",
    });

    const retrieved = await store.getSession("sess_1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe("Test Session 1");

    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe("sess_1");
    store.close();
  });

  it("saves and retrieves message history for session", async () => {
    const store = new SQLiteSessionStore(tmpDbPath);
    await store.saveSession({
      id: "sess_msg",
      title: "Message Test",
      createdAt: 1000,
      updatedAt: 1000,
      tier: "T4",
      provider: "ollama",
      model: "llama3.1",
    });

    await store.saveMessages("sess_msg", [
      {
        id: "msg_1",
        sessionId: "sess_msg",
        role: "user",
        content: "Fix the bug",
        timestamp: 1001,
      },
      {
        id: "msg_2",
        sessionId: "sess_msg",
        role: "assistant",
        content: "I will inspect the code.",
        timestamp: 1002,
      },
    ]);

    const messages = await store.getMessages("sess_msg");
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Fix the bug");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("I will inspect the code.");

    await store.deleteSession("sess_msg");
    const remaining = await store.getSession("sess_msg");
    expect(remaining).toBeNull();
    store.close();
  });

  it("persists caller-provided message ids/timestamps and escapes LIKE wildcards", async () => {
    const store = new SQLiteSessionStore(tmpDbPath);
    await store.saveSession({ id: "sess_meta", title: "Meta", tier: "T4", provider: "ollama", model: "qwen" });
    await store.saveMessages("sess_meta", [
      { id: "keep_1", sessionId: "sess_meta", role: "user", content: "100% done", timestamp: 5000 },
      { id: "keep_2", sessionId: "sess_meta", role: "assistant", content: "ok", timestamp: 6000 },
    ]);

    const messages = store.getMessages("sess_meta");
    expect(messages.map((m) => m.id)).toEqual(["keep_1", "keep_2"]);
    expect(messages[0].createdAt).toBe(new Date(5000).toISOString());

    expect(store.searchMessages("100%").length).toBe(1);
    expect(store.searchMessages("1%0").length).toBe(0);
    store.close();
  });
});

describe("ShadowGit Snapshot Engine", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morphic_shadow_test_"));

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("initializes shadow git, captures snapshots, and performs undo", async () => {
    const shadow = new ShadowGit(tmpDir);
    await shadow.init();

    // Create an initial file
    const testFile = path.join(tmpDir, "test.txt");
    fs.writeFileSync(testFile, "Version 1 content\n", "utf-8");

    // Take snapshot 1
    const snap1 = await shadow.snapshot("Initial file creation");
    expect(snap1).toBeTruthy();

    // Modify file
    fs.writeFileSync(testFile, "Version 2 mutated content\n", "utf-8");
    const snap2 = await shadow.snapshot("Mutated version");
    expect(snap2).toBeTruthy();

    // Verify history contains snapshots
    const history = await shadow.history(5);
    expect(history.length).toBeGreaterThanOrEqual(2);

    // Verify file has version 2 content
    expect(fs.readFileSync(testFile, "utf-8")).toBe("Version 2 mutated content\n");

    // Execute undo
    const undoResult = await shadow.undo();
    expect(undoResult.success).toBe(true);

    // Verify file is reverted to Version 1 content
    expect(fs.readFileSync(testFile, "utf-8")).toBe("Version 1 content\n");
  });
});
