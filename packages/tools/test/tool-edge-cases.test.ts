import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { readFileTool } from "../src/code/read.js";
import { editFileTool } from "../src/code/edit.js";
import { createFileTool } from "../src/code/create.js";
import { grepSearchTool } from "../src/search/grep.js";
import { lspQueryTool } from "../src/search/lsp.js";
import { visualVerifyTool } from "../src/visual/verify.js";
import { astRewriteTool } from "../src/ast/rewrite.js";

describe("FS tool edge cases", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-edge-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("read_file handles missing files, directories, bad ranges and EOF", async () => {
    expect((await readFileTool.execute({ path: "nope.txt" }, { cwd: dir })).success).toBe(false);

    await fs.mkdir(path.join(dir, "subdir"));
    expect((await readFileTool.execute({ path: "subdir" }, { cwd: dir })).success).toBe(false);

    await fs.writeFile(path.join(dir, "a.txt"), "l1\nl2\nl3", "utf-8");
    const badRange = await readFileTool.execute(
      { path: "a.txt", startLine: 3, endLine: 1 },
      { cwd: dir }
    );
    expect(badRange.success).toBe(false);

    const beyond = await readFileTool.execute({ path: "a.txt", startLine: 99 }, { cwd: dir });
    expect(beyond.success).toBe(true);
    expect(beyond.output).toContain("beyond file end");

    const range = await readFileTool.execute({ path: "a.txt", startLine: 2, endLine: 3 }, { cwd: dir });
    expect(range.output).toBe("2: l2\n3: l3");
  });

  it("create_file respects overwrite and creates parent dirs", async () => {
    const first = await createFileTool.execute(
      { path: "deep/nested/x.txt", content: "one" },
      { cwd: dir }
    );
    expect(first.success).toBe(true);

    const noOverwrite = await createFileTool.execute(
      { path: "deep/nested/x.txt", content: "two" },
      { cwd: dir }
    );
    expect(noOverwrite.success).toBe(false);
    expect(noOverwrite.error).toContain("already exists");

    const overwrite = await createFileTool.execute(
      { path: "deep/nested/x.txt", content: "two", overwrite: true },
      { cwd: dir }
    );
    expect(overwrite.success).toBe(true);
    expect(await fs.readFile(path.join(dir, "deep/nested/x.txt"), "utf-8")).toBe("two");
  });

  it("edit_file rejects non-unique matches and preserves CRLF", async () => {
    await fs.writeFile(path.join(dir, "dup.txt"), "abc abc", "utf-8");
    const dup = await editFileTool.execute(
      { path: "dup.txt", oldStr: "abc", newStr: "x" },
      { cwd: dir }
    );
    expect(dup.success).toBe(false);
    expect(dup.error).toContain("occurrences");

    await fs.writeFile(path.join(dir, "crlf.txt"), "a\r\nb\r\nc", "utf-8");
    const edited = await editFileTool.execute(
      { path: "crlf.txt", oldStr: "b", newStr: "B" },
      { cwd: dir }
    );
    expect(edited.success).toBe(true);
    expect(await fs.readFile(path.join(dir, "crlf.txt"), "utf-8")).toBe("a\r\nB\r\nc");
  });

  it("grep_search handles no-match, case-insensitivity, limits and traversal", async () => {
    await fs.writeFile(path.join(dir, "f.txt"), "Apple\nbanana\nAPPLE", "utf-8");

    const insensitive = await grepSearchTool.execute(
      { query: "apple", caseInsensitive: true },
      { cwd: dir }
    );
    expect(insensitive.success).toBe(true);
    expect(insensitive.output).toContain("APPLE");

    const limited = await grepSearchTool.execute(
      { query: "a", maxResults: 1 },
      { cwd: dir }
    );
    expect(limited.metadata?.count).toBeLessThanOrEqual(1);

    const none = await grepSearchTool.execute({ query: "zzzz" }, { cwd: dir });
    expect(none.output).toContain("No matches found");

    const traversal = await grepSearchTool.execute({ query: "x", path: "../" }, { cwd: dir });
    expect(traversal.success).toBe(false);
  });

  it("lsp_query finds definitions/references and rejects escapes", async () => {
    await fs.writeFile(
      path.join(dir, "m.ts"),
      "export function calc(): number { return 1; }\ncalc();\n",
      "utf-8"
    );

    const def = await lspQueryTool.execute({ symbol: "calc", action: "definition" }, { cwd: dir });
    expect(def.success).toBe(true);
    expect(def.output).toContain("function calc");

    const refs = await lspQueryTool.execute({ symbol: "calc", action: "references" }, { cwd: dir });
    expect(refs.metadata?.count).toBeGreaterThanOrEqual(2);

    const unknown = await lspQueryTool.execute({ symbol: "nope", action: "definition" }, { cwd: dir });
    expect(unknown.output).toContain("No definition found");

    const escape = await lspQueryTool.execute(
      { symbol: "calc", action: "definition", path: "../" },
      { cwd: dir }
    );
    expect(escape.success).toBe(false);
  });

  it("visual_verify validates local files and refuses remote URLs", async () => {
    await fs.writeFile(
      path.join(dir, "index.html"),
      "<html><head><title>Hi</title></head><body><div id='app'></div></body></html>",
      "utf-8"
    );

    const ok = await visualVerifyTool.execute(
      { target: "index.html", expectedSelector: "id='app'" },
      { cwd: dir }
    );
    expect(ok.success).toBe(true);
    expect(ok.metadata?.title).toBe("Hi");

    const missing = await visualVerifyTool.execute(
      { target: "index.html", expectedSelector: "id='missing'" },
      { cwd: dir }
    );
    expect(missing.success).toBe(false);

    const remote = await visualVerifyTool.execute(
      { target: "https://example.com" },
      { cwd: dir }
    );
    expect(remote.success).toBe(false);
    expect(remote.error).toContain("non-local");
  });

  it("visual_verify selector matching supports id/class/tag/attr", async () => {
    const html = `<html><body><div id="app" class="root main" data-role="shell"><span>hi</span></div></body></html>`;
    await fs.writeFile(path.join(dir, "sel.html"), html, "utf-8");

    for (const selector of ["#app", ".main", "div", "[data-role=shell]", "id='app'"]) {
      const res = await visualVerifyTool.execute(
        { target: "sel.html", expectedSelector: selector },
        { cwd: dir }
      );
      expect(res.success).toBe(true);
    }

    const miss = await visualVerifyTool.execute(
      { target: "sel.html", expectedSelector: "#nope" },
      { cwd: dir }
    );
    expect(miss.success).toBe(false);
  });

  it("ast_rewrite handles metavariable prefixes correctly", async () => {
    await fs.writeFile(path.join(dir, "r.txt"), "foo and bar", "utf-8");
    const res = await astRewriteTool.execute(
      { path: "r.txt", pattern: "$A and $AB", replacement: "$AB($A)" },
      { cwd: dir }
    );
    expect(res.success).toBe(true);
    expect(await fs.readFile(path.join(dir, "r.txt"), "utf-8")).toBe("bar(foo)");
  });

  it("edit_file treats $& as a literal replacement", async () => {
    await fs.writeFile(path.join(dir, "p.txt"), "price = 1", "utf-8");
    const res = await editFileTool.execute(
      { path: "p.txt", oldStr: "price", newStr: "cost=$&" },
      { cwd: dir }
    );
    expect(res.success).toBe(true);
    expect(await fs.readFile(path.join(dir, "p.txt"), "utf-8")).toBe("cost=$& = 1");
  });

  it("rejects empty edit/ast patterns", async () => {
    await fs.writeFile(path.join(dir, "e.txt"), "abc", "utf-8");
    expect((await editFileTool.execute({ path: "e.txt", oldStr: "", newStr: "x" }, { cwd: dir })).success).toBe(false);
    expect((await astRewriteTool.execute({ path: "e.txt", pattern: "", replacement: "x" }, { cwd: dir })).success).toBe(false);
    expect(await fs.readFile(path.join(dir, "e.txt"), "utf-8")).toBe("abc");
  });

  it("ast_rewrite maps duplicate metavariables to the right captures", async () => {
    await fs.writeFile(path.join(dir, "d.txt"), "a foo a b", "utf-8");
    const res = await astRewriteTool.execute(
      { path: "d.txt", pattern: "$A foo $A $B", replacement: "$B-$A" },
      { cwd: dir }
    );
    expect(res.success).toBe(true);
    expect(await fs.readFile(path.join(dir, "d.txt"), "utf-8")).toBe("b-a");
  });
});
