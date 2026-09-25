import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createFileTool } from "../src/code/create.js";
import { editFileTool } from "../src/code/edit.js";
import { astRewriteTool } from "../src/ast/rewrite.js";
import { dapDebugTool } from "../src/debug/dap.js";
import { visualVerifyTool } from "../src/visual/verify.js";

describe("Tool error paths", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-tool-err-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("create_file surfaces write failures", async () => {
    // A file where a directory is expected forces mkdir to fail.
    await fs.writeFile(path.join(dir, "blocker"), "x", "utf-8");
    const res = await createFileTool.execute(
      { path: "blocker/child.txt", content: "y" },
      { cwd: dir }
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("Failed to create file");
  });

  it("edit_file reports missing files", async () => {
    const res = await editFileTool.execute(
      { path: "gone.txt", oldStr: "a", newStr: "b" },
      { cwd: dir }
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("File not found");
  });

  it("ast_rewrite reports when the pattern does not match", async () => {
    await fs.writeFile(path.join(dir, "a.txt"), "hello world", "utf-8");
    const res = await astRewriteTool.execute(
      { path: "a.txt", pattern: "nope($A)", replacement: "$A" },
      { cwd: dir }
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("No matches found");
  });

  it("dap_inspect reports when no source frames exist", async () => {
    const res = await dapDebugTool.execute(
      { stackTrace: "Error: boom\n    at node_modules/foo/index.js:1:1" },
      { cwd: dir }
    );
    expect(res.success).toBe(true);
    expect(res.output).toContain("No workspace source frames");
  });

  it("dap_inspect renders context for an absolute frame", async () => {
    await fs.writeFile(
      path.join(dir, "app.ts"),
      "line1\nline2\nline3\nline4\nline5\n",
      "utf-8"
    );
    const res = await dapDebugTool.execute(
      { stackTrace: `Error: boom\n    at run (${path.join(dir, "app.ts")}:3:5)` },
      { cwd: dir }
    );
    expect(res.success).toBe(true);
    expect(res.output).toContain("app.ts:3");
    expect(res.output).toContain("line3");
  });

  it("visual_verify fetches a local HTTP server", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(
          "<html><head><title>Live</title></head><body><div id='app'></div></body></html>",
          { headers: { "content-type": "text/html" } }
        );
      },
    });

    try {
      const res = await visualVerifyTool.execute(
        { target: `http://127.0.0.1:${server.port}/`, expectedSelector: "id='app'" },
        { cwd: dir }
      );
      expect(res.success).toBe(true);
      expect(res.metadata?.title).toBe("Live");
      expect(res.metadata?.statusCode).toBe(200);
    } finally {
      server.stop(true);
    }
  });
});
