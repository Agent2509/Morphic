import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { KnowledgeGraph } from "./graph.js";
import type { ProjectRules } from "./types.js";

export class ProjectRulesParser {
  async loadRules(projectDir: string = process.cwd()): Promise<ProjectRules | null> {
    const candidates = [
      path.join(projectDir, "PROJECT.md"),
      path.join(projectDir, "CLAUDE.md"),
      path.join(projectDir, "MORPHIC.md"),
    ];

    for (const file of candidates) {
      try {
        const content = await fs.readFile(file, "utf-8");
        return this.parseMarkdown(content, path.basename(file));
      } catch {
        // try next
      }
    }

    return null;
  }

  parseMarkdown(content: string, fileName: string): ProjectRules {
    const lines = content.split("\n");
    const rules: ProjectRules["rules"] = [];
    const commonCommands: Record<string, string> = {};

    let currentSection = "";

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith("#")) {
        currentSection = line.replace(/^#+\s*/, "").toLowerCase();
        continue;
      }

      if (line.startsWith("- ") || line.startsWith("* ")) {
        const item = line.replace(/^[-*]\s*/, "");
        if (currentSection.includes("rule") || currentSection.includes("decision") || currentSection.includes("guideline")) {
          rules.push({
            category: "style",
            description: item,
          });
        } else if (currentSection.includes("command") || currentSection.includes("test") || currentSection.includes("script")) {
          rules.push({
            category: "command",
            description: item,
          });
        } else {
          rules.push({
            category: "architecture",
            description: item,
          });
        }
      }

      // Detect commands like `bun test` or `- \`npm run build\`: compiles
      const codeMatch = line.match(/^(?:[-*]\s*)?`([^`]+)`\s*(?:[:-]\s*(.+))?$/);
      if (codeMatch) {
        commonCommands[codeMatch[1]] = codeMatch[2]?.trim() || "";
      }
    }

    return {
      projectName: fileName,
      rules,
      commonCommands,
    };
  }

  populateGraph(rules: ProjectRules, graph: KnowledgeGraph): void {
    const rootNodeId = `project:${rules.projectName || "root"}`;
    graph.addNode({
      id: rootNodeId,
      type: "module",
      label: rules.projectName || "Project Root",
    });

    for (let i = 0; i < rules.rules.length; i++) {
      const rule = rules.rules[i];
      const ruleId = `${rootNodeId}:rule:${i}`;
      graph.addNode({
        id: ruleId,
        type: "rule",
        label: rule.description,
        data: { category: rule.category },
      });

      graph.addEdge({
        source: rootNodeId,
        target: ruleId,
        type: "enforces",
      });
    }
  }

  parseRulesContent(content: string, fileName: string = "PROJECT.md"): ProjectRules {
    return this.parseMarkdown(content, fileName);
  }

  toContextSnippet(rules: ProjectRules): string {
    if (!rules) return "";
    const hasRules = rules.rules.length > 0;
    const hasCommands = rules.commonCommands && Object.keys(rules.commonCommands).length > 0;
    if (!hasRules && !hasCommands) return "";

    let snippet = `### PROJECT INSTRUCTIONS & RULES (${rules.projectName}):\n`;
    for (const rule of rules.rules) {
      snippet += `  - [${rule.category.toUpperCase()}] ${rule.description}\n`;
    }

    if (hasCommands) {
      snippet += `\nCommon Commands:\n`;
      for (const [cmd, desc] of Object.entries(rules.commonCommands!)) {
        snippet += `  • \`${cmd}\`${desc ? `: ${desc}` : ""}\n`;
      }
    }

    return snippet;
  }
}
