import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { RepoMapGenerator, repoMapTool } from "../src/search/repo-map.js";
import { lspQueryTool } from "../src/search/lsp.js";

describe("RepoMapGenerator & repo_map Tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morphic_repomap_test_"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("extracts symbols and applies PageRank to dependencies", async () => {
    // a.ts imports b.ts; b.ts has interface and class
    fs.writeFileSync(
      path.join(tmpDir, "b.ts"),
      `export interface CoreConfig {
  retries: number;
}

export class Engine {
  start(): void {}
}
`,
      "utf-8"
    );

    fs.writeFileSync(
      path.join(tmpDir, "a.ts"),
      `import { Engine, CoreConfig } from "./b.js";

export function runMain() {
  const e = new Engine();
  e.start();
}
`,
      "utf-8"
    );

    const generator = new RepoMapGenerator();
    const map = await generator.generateMap(tmpDir, 1024);

    expect(map).toContain("b.ts:");
    expect(map).toContain("interface CoreConfig");
    expect(map).toContain("class Engine");
    expect(map).toContain("a.ts:");
    expect(map).toContain("function runMain");
  });

  it("repoMapTool executes successfully", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "service.ts"),
      `export class DataService {
  fetchData(): string { return "data"; }
}
`,
      "utf-8"
    );

    const result = await repoMapTool.execute(
      { maxTokens: 500 },
      { cwd: tmpDir, sandbox: false }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("service.ts:");
    expect(result.output).toContain("class DataService");
  });
});

describe("lspQueryTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morphic_lsp_test_"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("finds symbol definitions", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "math.ts"),
      `export function calculateSum(a: number, b: number): number {
  return a + b;
}
`,
      "utf-8"
    );

    const result = await lspQueryTool.execute(
      { symbol: "calculateSum", action: "definition" },
      { cwd: tmpDir, sandbox: false }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("math.ts:1:");
    expect(result.output).toContain("function calculateSum");
  });

  it("finds symbol references", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "app.ts"),
      `import { calculateSum } from "./math.js";
const total = calculateSum(5, 10);
console.log(total);
`,
      "utf-8"
    );

    const result = await lspQueryTool.execute(
      { symbol: "calculateSum", action: "references" },
      { cwd: tmpDir, sandbox: false }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("app.ts:1:");
    expect(result.output).toContain("app.ts:2:");
  });
});
