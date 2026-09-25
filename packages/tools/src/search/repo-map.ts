import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { walkFiles } from "@morphic/shared";

export interface FileSymbolInfo {
  path: string;
  relPath: string;
  exports: string[];
  imports: string[];
  declarations: string[];
  pageRank: number;
}

export class RepoMapGenerator {
  private codeExtensions = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".py",
    ".go",
    ".rs",
    ".md",
    ".json",
  ]);

  async scanFiles(rootDir: string): Promise<string[]> {
    return walkFiles(rootDir, { extensions: this.codeExtensions });
  }

  extractSymbols(content: string): { exports: string[]; imports: string[]; declarations: string[] } {
    const exports: string[] = [];
    const imports: string[] = [];
    const declarations: string[] = [];

    const lines = content.split("\n");

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Match imports: import ... from "..."
      const importMatch = line.match(/import\s+(?:\{([^}]+)\}|(\w+)|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        if (importMatch[1]) {
          const names = importMatch[1].split(",").map((s) => s.trim().split(" as ")[0].trim());
          imports.push(...names);
        } else if (importMatch[2]) {
          imports.push(importMatch[2]);
        } else if (importMatch[3]) {
          imports.push(importMatch[3]);
        }
      }

      // Re-exports: treat exported names as imports (out-edge) + exports (provider).
      const reexportMatch = line.match(/^export\s+(?:\*|\{([^}]+)\})\s+from\s+['"][^'"]+['"]/);
      if (reexportMatch) {
        if (reexportMatch[1]) {
          const names = reexportMatch[1].split(",").map((s) => s.trim().split(" as ").pop()!.trim());
          for (const name of names) {
            if (!name) continue;
            exports.push(name);
            imports.push(name);
          }
        }
      }

      // Match exports
      const exportDeclMatch = line.match(
        /export\s+(?:default\s+)?(?:async\s+)?(function|class|interface|type|const|enum|let)\s+([A-Za-z0-9_$]+)/
      );
      if (exportDeclMatch) {
        const kind = exportDeclMatch[1];
        const name = exportDeclMatch[2];
        exports.push(name);
        declarations.push(`${kind} ${name}`);
        continue;
      }

      // Non-exported top-level declarations
      const declMatch = line.match(
        /^(?:async\s+)?(function|class|interface|type|const|enum)\s+([A-Za-z0-9_$]+)/
      );
      if (declMatch) {
        const kind = declMatch[1];
        const name = declMatch[2];
        declarations.push(`${kind} ${name}`);
      }
    }

    return { exports, imports, declarations };
  }

  computePageRank(
    files: Map<string, FileSymbolInfo>,
    iterations: number = 20,
    damping: number = 0.85
  ): void {
    const filePaths = Array.from(files.keys());
    const n = filePaths.length;
    if (n === 0) return;

    for (const file of files.values()) {
      file.pageRank = 1 / n;
    }

    // symbol -> provider (first definition wins, deterministic).
    const symbolToProvider = new Map<string, string>();
    for (const [pathKey, info] of files.entries()) {
      for (const sym of info.exports) {
        if (!symbolToProvider.has(sym)) symbolToProvider.set(sym, pathKey);
      }
    }

    // Resolve internal out-edges and incoming edges.
    const outEdges = new Map<string, Set<string>>();
    const incomingEdges = new Map<string, Set<string>>();
    for (const pathKey of filePaths) {
      outEdges.set(pathKey, new Set());
      incomingEdges.set(pathKey, new Set());
    }

    for (const [consumerPath, info] of files.entries()) {
      for (const imp of info.imports) {
        const provider = symbolToProvider.get(imp);
        if (provider && provider !== consumerPath) {
          outEdges.get(consumerPath)!.add(provider);
          incomingEdges.get(provider)!.add(consumerPath);
        }
      }
    }

    for (let it = 0; it < iterations; it++) {
      let danglingSum = 0;
      for (const pathKey of filePaths) {
        if (outEdges.get(pathKey)!.size === 0) {
          danglingSum += files.get(pathKey)?.pageRank || 0;
        }
      }
      const danglingShare = (damping * danglingSum) / n;

      const nextRanks = new Map<string, number>();
      for (const pathKey of filePaths) {
        let sum = 0;
        for (const caller of incomingEdges.get(pathKey)!) {
          const callerOut = outEdges.get(caller)!.size;
          if (callerOut > 0) {
            sum += (files.get(caller)?.pageRank || 0) / callerOut;
          }
        }
        nextRanks.set(pathKey, (1 - damping) / n + damping * sum + danglingShare);
      }

      for (const [pathKey, rank] of nextRanks.entries()) {
        const f = files.get(pathKey);
        if (f) f.pageRank = rank;
      }
    }
  }

  async generateMap(
    rootDir: string = process.cwd(),
    maxTokens: number = 2048,
    focusPath?: string
  ): Promise<string> {
    const filePaths = await this.scanFiles(rootDir);
    const files = new Map<string, FileSymbolInfo>();

    for (const fp of filePaths) {
      try {
        const content = await fs.readFile(fp, "utf-8");
        const relPath = path.relative(rootDir, fp);
        const { exports, imports, declarations } = this.extractSymbols(content);

        files.set(fp, {
          path: fp,
          relPath,
          exports,
          imports,
          declarations,
          pageRank: 0,
        });
      } catch {
        // ignore
      }
    }

    this.computePageRank(files);

    // Boost files matching focusPath if provided
    if (focusPath) {
      for (const f of files.values()) {
        if (f.relPath.includes(focusPath)) {
          f.pageRank *= 3.0;
        }
      }
    }

    // Sort files by PageRank descending
    const sortedFiles = Array.from(files.values()).sort(
      (a, b) => b.pageRank - a.pageRank
    );

    const charBudget = maxTokens * 4;
    let result = "";

    for (const f of sortedFiles) {
      let fileChunk = `${f.relPath}:\n`;
      if (f.declarations.length > 0) {
        fileChunk += f.declarations.map((d) => `  │ ${d}`).join("\n") + "\n";
      } else {
        fileChunk += `  │ (declarations hidden/none)\n`;
      }

      if ((result + fileChunk).length > charBudget) {
        // Always surface at least the top-ranked file, truncated if needed.
        if (result.length === 0) {
          result += fileChunk.slice(0, Math.max(0, charBudget));
        }
        break;
      }
      result += fileChunk;
    }

    return result.trim() || "No codebase symbols found.";
  }
}

const RepoMapSchema = z.object({
  maxTokens: z
    .coerce.number()
    .int()
    .positive()
    .optional()
    .describe("Max token budget for repo map representation (default: 2048)"),
  focusPath: z
    .string()
    .optional()
    .describe("Optional path or directory to prioritize and rank higher in the map"),
});

export const repoMapTool: Tool<typeof RepoMapSchema> = {
  name: "repo_map",
  description:
    "Generate a PageRank-weighted architectural map of the codebase symbols, interfaces, and declarations fitted to a token budget.",
  category: "read",
  parameters: RepoMapSchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    const generator = new RepoMapGenerator();
    try {
      const output = await generator.generateMap(
        context.cwd,
        args.maxTokens || 2048,
        args.focusPath
      );
      return {
        success: true,
        output,
        metadata: { budget: args.maxTokens || 2048 },
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Failed to generate repo map: ${err.message}`,
      };
    }
  },
};
