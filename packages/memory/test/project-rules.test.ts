import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectRulesParser, KnowledgeGraph } from "../src/index.js";

describe("ProjectRulesParser", () => {
  let dir: string;
  const parser = new ProjectRulesParser();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-rules-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("parses rules and common commands from markdown", () => {
    const md = `# Guidelines
- Never use console.log
- Always write tests

## Test Commands
- \`bun test\`: run the suite
\`bun run typecheck\`
`;
    const rules = parser.parseMarkdown(md, "PROJECT.md");
    expect(rules.rules.length).toBeGreaterThanOrEqual(2);
    expect(rules.commonCommands?.["bun test"]).toBe("run the suite");
    expect(rules.commonCommands?.["bun run typecheck"]).toBe("");

    const snippet = parser.toContextSnippet(rules);
    expect(snippet).toContain("PROJECT INSTRUCTIONS & RULES");
    expect(snippet).toContain("Always write tests");
    expect(snippet).toContain("Common Commands");
    expect(snippet).toContain("bun test");
  });

  it("returns empty snippet when there is nothing to report", () => {
    const rules = parser.parseRulesContent("# Title\njust prose", "EMPTY.md");
    expect(parser.toContextSnippet(rules)).toBe("");
  });

  it("loads rules from a project directory", async () => {
    await fs.writeFile(
      path.join(dir, "CLAUDE.md"),
      "# Rules\n- Do not edit generated files\n",
      "utf-8"
    );
    const rules = await parser.loadRules(dir);
    expect(rules).not.toBeNull();
    expect(rules!.projectName).toBe("CLAUDE.md");
    expect(rules!.rules[0].description).toContain("Do not edit generated files");

    expect(await parser.loadRules(path.join(dir, "missing"))).toBeNull();
  });

  it("populates the graph idempotently", () => {
    const graph = new KnowledgeGraph();
    const rules = parser.parseMarkdown("# Rules\n- A rule\n- Another rule", "P.md");

    parser.populateGraph(rules, graph);
    const firstEdges = graph.getEdgeCount();
    parser.populateGraph(rules, graph);

    expect(graph.getEdgeCount()).toBe(firstEdges);
    expect(graph.findByType("rule").length).toBe(2);
  });
});
