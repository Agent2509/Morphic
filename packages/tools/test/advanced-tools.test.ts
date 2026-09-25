import { describe, expect, it, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { astRewriteTool } from "../src/ast/rewrite.js";
import { visualVerifyTool } from "../src/visual/verify.js";
import { dapDebugTool } from "../src/debug/dap.js";
import type { ToolContext } from "../src/types.js";

describe("Phase 6 Advanced Tools", () => {
  const tmpDirs: string[] = [];

  const createTempDir = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-adv-tools-"));
    tmpDirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    for (const d of tmpDirs) {
      await fs.rm(d, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe("ast_rewrite", () => {
    it("rewrites structural patterns with metavariables", async () => {
      const dir = await createTempDir();
      const testFile = path.join(dir, "math.ts");
      await fs.writeFile(
        testFile,
        `const sum = add(foo, bar);\nconst total = add(alpha, beta);`,
        "utf-8"
      );

      const ctx: ToolContext = { cwd: dir };
      const res = await astRewriteTool.execute(
        {
          path: "math.ts",
          pattern: "add($A, $B)",
          replacement: "($A + $B)",
        },
        ctx
      );

      expect(res.success).toBe(true);
      expect(res.metadata?.replacementsCount).toBe(2);

      const updated = await fs.readFile(testFile, "utf-8");
      expect(updated).toContain("const sum = (foo + bar);");
      expect(updated).toContain("const total = (alpha + beta);");
    });

    it("returns error when pattern does not match", async () => {
      const dir = await createTempDir();
      const testFile = path.join(dir, "sample.ts");
      await fs.writeFile(testFile, "const x = 10;", "utf-8");

      const ctx: ToolContext = { cwd: dir };
      const res = await astRewriteTool.execute(
        {
          path: "sample.ts",
          pattern: "subtract($X, $Y)",
          replacement: "($X - $Y)",
        },
        ctx
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("No matches found");
    });
  });

  describe("visual_verify", () => {
    it("verifies local HTML file health and extracts page title", async () => {
      const dir = await createTempDir();
      const htmlFile = path.join(dir, "index.html");
      await fs.writeFile(
        htmlFile,
        `<!DOCTYPE html><html><head><title>Morphic Dashboard</title></head><body><div id="root">Hello App</div></body></html>`,
        "utf-8"
      );

      const ctx: ToolContext = { cwd: dir };
      const res = await visualVerifyTool.execute(
        {
          target: "index.html",
          expectedSelector: `id="root"`,
        },
        ctx
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain("Page Title: Morphic Dashboard");
      expect(res.output).toContain("Selector 'id=\"root\"': FOUND");
      expect(res.metadata?.title).toBe("Morphic Dashboard");
    });

    it("detects critical frontend fatal errors in HTML", async () => {
      const dir = await createTempDir();
      const htmlFile = path.join(dir, "error.html");
      await fs.writeFile(
        htmlFile,
        `<html><head><title>Crash</title></head><body>Uncaught TypeError: Cannot read property of undefined</body></html>`,
        "utf-8"
      );

      const ctx: ToolContext = { cwd: dir };
      const res = await visualVerifyTool.execute(
        {
          target: "error.html",
        },
        ctx
      );

      expect(res.success).toBe(false);
      expect(res.output).toContain("Uncaught TypeError");
      expect(res.metadata?.fatalErrors.length).toBeGreaterThan(0);
    });
  });

  describe("dap_inspect", () => {
    it("parses stack trace and locates source frame and context snippet", async () => {
      const dir = await createTempDir();
      const srcFile = path.join(dir, "calc.ts");
      await fs.writeFile(
        srcFile,
        `export function divide(a: number, b: number) {\n  if (b === 0) {\n    throw new Error("Division by zero");\n  }\n  return a / b;\n}\n`,
        "utf-8"
      );

      const stackTrace = `Error: Division by zero\n    at divide (${srcFile}:3:11)\n    at Object.<anonymous> (${srcFile}:6:1)`;

      const ctx: ToolContext = { cwd: dir };
      const res = await dapDebugTool.execute({ stackTrace }, ctx);

      expect(res.success).toBe(true);
      expect(res.output).toContain("DAP Inspection Report:");
      expect(res.output).toContain("Primary Failure Location: " + srcFile + ":3:11");
      expect(res.output).toContain("3:     throw new Error(\"Division by zero\");");
      expect(res.metadata?.frameCount).toBe(2);
    });

    it("handles stack traces without user source frames", async () => {
      const stackTrace = `Error: System failure\n    at internal/main.js:10:5`;
      const ctx: ToolContext = { cwd: process.cwd() };
      const res = await dapDebugTool.execute({ stackTrace }, ctx);

      expect(res.success).toBe(true);
      expect(res.metadata?.frameCount).toBe(1);
    });
  });
});
