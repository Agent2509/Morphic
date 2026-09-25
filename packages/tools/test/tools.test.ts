import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { readFileTool } from "../src/code/read.js";
import { editFileTool } from "../src/code/edit.js";
import { createFileTool } from "../src/code/create.js";
import { grepSearchTool } from "../src/search/grep.js";
import { shellExecTool } from "../src/exec/shell.js";

describe("Core Tools", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-tools-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("create_file and read_file should work as expected", async () => {
    const filePath = "nested/test.txt";
    const content = "Line 1: Hello\nLine 2: World\nLine 3: Morphic";

    // Create file
    const createResult = await createFileTool.execute(
      { path: filePath, content },
      { cwd: tmpDir }
    );
    expect(createResult.success).toBe(true);

    // Read full file
    const readResult = await readFileTool.execute(
      { path: filePath },
      { cwd: tmpDir }
    );
    expect(readResult.success).toBe(true);
    expect(readResult.output).toContain("1: Line 1: Hello");
    expect(readResult.output).toContain("3: Line 3: Morphic");

    // Read range
    const readRange = await readFileTool.execute(
      { path: filePath, startLine: 2, endLine: 2 },
      { cwd: tmpDir }
    );
    expect(readRange.success).toBe(true);
    expect(readRange.output).toBe("2: Line 2: World");
  });

  it("edit_file replaces unique occurrences cleanly", async () => {
    const filePath = "sample.ts";
    const initialContent = "function calculate() {\n  const x = 1;\n  return x;\n}\n";

    await createFileTool.execute(
      { path: filePath, content: initialContent },
      { cwd: tmpDir }
    );

    // Perform exact edit
    const editRes = await editFileTool.execute(
      {
        path: filePath,
        oldStr: "  const x = 1;\n  return x;",
        newStr: "  const x = 42;\n  return x * 2;",
      },
      { cwd: tmpDir }
    );

    expect(editRes.success).toBe(true);

    const afterRead = await readFileTool.execute({ path: filePath }, { cwd: tmpDir });
    expect(afterRead.output).toContain("const x = 42;");
    expect(afterRead.output).toContain("return x * 2;");
  });

  it("edit_file fails if oldStr is not found", async () => {
    const filePath = "sample.txt";
    await createFileTool.execute({ path: filePath, content: "abc" }, { cwd: tmpDir });

    const editRes = await editFileTool.execute(
      { path: filePath, oldStr: "def", newStr: "xyz" },
      { cwd: tmpDir }
    );

    expect(editRes.success).toBe(false);
    expect(editRes.error).toContain("Could not find exact match");
  });

  it("grep_search finds occurrences across files", async () => {
    await createFileTool.execute(
      { path: "file1.txt", content: "apple banana cherry" },
      { cwd: tmpDir }
    );
    await createFileTool.execute(
      { path: "file2.txt", content: "dragonfruit apple elderberry" },
      { cwd: tmpDir }
    );

    const grepRes = await grepSearchTool.execute(
      { query: "apple", path: tmpDir },
      { cwd: tmpDir }
    );

    expect(grepRes.success).toBe(true);
    expect(grepRes.output).toContain("file1.txt");
    expect(grepRes.output).toContain("file2.txt");
  });

  it("shell_exec runs command and captures output", async () => {
    const shellRes = await shellExecTool.execute(
      { command: "echo 'hello from shell'" },
      { cwd: tmpDir }
    );

    expect(shellRes.success).toBe(true);
    expect(shellRes.output).toBe("hello from shell");
  });

  it("shell_exec tolerates null/zero optional args from small models", async () => {
    const shellRes = await shellExecTool.execute(
      { command: "echo 'ok'", cwd: null as any, timeoutMs: 0 as any },
      { cwd: tmpDir }
    );

    expect(shellRes.success).toBe(true);
    expect(shellRes.output).toBe("ok");
  });
});
