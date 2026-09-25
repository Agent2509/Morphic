import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { resolveSafePath } from "../path-utils.js";
import { walkFiles } from "@morphic/shared";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"]);

const LspQuerySchema = z.object({
  symbol: z.string().min(1).describe("The function, class, type, or variable symbol to look up"),
  action: z
    .enum(["definition", "references"])
    .describe("Whether to find definition or all references of the symbol"),
  path: z.string().optional().describe("Optional path hint to restrict search"),
});

export const lspQueryTool: Tool<typeof LspQuerySchema> = {
  name: "lsp_query",
  description: "Find the definition or references of any symbol (function, class, type, interface) across the codebase.",
  category: "read",
  parameters: LspQuerySchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    const resolved = await resolveSafePath(context.cwd, args.path || ".");
    if (!resolved.ok) {
      return { success: false, output: "", error: resolved.error };
    }
    const searchRoot = resolved.abs;
    const symbol = escapeRegExp(args.symbol);
    const defRegex = new RegExp(
      `\\b(function|class|interface|type|const|let|enum|def)\\s+${symbol}\\b`
    );
    const refRegex = new RegExp(`\\b${symbol}\\b`);

    const results: string[] = [];
    let files: string[];
    try {
      files = await walkFiles(searchRoot, {
        extensions: CODE_EXTENSIONS,
        signal: context.signal,
      });
    } catch (err: any) {
      return { success: false, output: "", error: `LSP query failed: ${err.message}` };
    }

    for (const file of files) {
      if (context.signal?.aborted || results.length >= 25) break;
      try {
        const content = await fs.readFile(file, "utf-8");
        const lines = content.split("\n");
        const rel = path.relative(context.cwd, file);
        const matcher = args.action === "definition" ? defRegex : refRegex;
        for (let i = 0; i < lines.length && results.length < 25; i++) {
          if (matcher.test(lines[i])) {
            results.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      } catch {
        // ignore unreadable files
      }
    }

    if (results.length === 0) {
      return {
        success: true,
        output: `No ${args.action} found for symbol '${args.symbol}'.`,
      };
    }

    return {
      success: true,
      output: results.join("\n"),
      metadata: { count: results.length, symbol: args.symbol, action: args.action },
    };
  },
};
