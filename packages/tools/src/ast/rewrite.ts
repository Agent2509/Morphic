import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { resolveSafePath } from "../path-utils.js";

const AstRewriteSchema = z.object({
  path: z.string().describe("Relative or absolute path to the file to transform"),
  pattern: z.string().min(1).describe("Structural pattern to match (can use metavariables like $A, $B)"),
  replacement: z.string().describe("Replacement template utilizing the metavariables"),
});

export const astRewriteTool: Tool<typeof AstRewriteSchema> = {
  name: "ast_rewrite",
  description: "Perform structural AST pattern search and replace on code files using metavariables ($A, $B).",
  category: "edit",
  parameters: AstRewriteSchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    const resolved = await resolveSafePath(context.cwd, args.path);
    if (!resolved.ok) {
      return { success: false, output: "", error: resolved.error };
    }
    const filePath = resolved.abs;
    if (!args.pattern) {
      return { success: false, output: "", error: "AST pattern must not be empty." };
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");

      // Escape the pattern, then substitute metavariables in place. The regex
      // greedily captures the full name ($AB, not $A + B). Duplicate names reuse
      // a non-capturing group so later capture indices stay correct.
      const escapedPattern = args.pattern.replace(/([.*+?^${}()|[\]\\])/g, "\\$1");
      const groupIndex = new Map<string, number>();
      let captureCount = 0;
      const regexStr = escapedPattern.replace(
        /\\\$([A-Za-z0-9_]+)/g,
        (_full, name: string) => {
          if (groupIndex.has(name)) {
            return "(?:[^,\\s()]+)";
          }
          captureCount++;
          groupIndex.set(name, captureCount);
          return "([^,\\s()]+)";
        }
      );

      const matchRegex = new RegExp(regexStr, "g");
      let replacementsCount = 0;

      // Replace longest names first in the replacement to avoid $A clobbering $AB.
      const replacementVars = [...groupIndex.entries()].sort(
        (a, b) => b[0].length - a[0].length
      );

      const newContent = content.replace(matchRegex, (...matchArgs) => {
        replacementsCount++;
        let replaced = args.replacement;
        for (const [name, group] of replacementVars) {
          const capturedVal = matchArgs[group];
          if (capturedVal === undefined) continue;
          // Function form prevents `$&`/`$1` in captured text from expanding.
          replaced = replaced.replaceAll(`$${name}`, () => capturedVal);
        }
        return replaced;
      });

      if (replacementsCount === 0) {
        return {
          success: false,
          output: "",
          error: `No matches found for AST pattern: ${args.pattern}`,
        };
      }

      await fs.writeFile(filePath, newContent, "utf-8");

      return {
        success: true,
        output: `Successfully applied AST rewrite (${replacementsCount} matches replaced in ${path.relative(context.cwd, filePath)})`,
        metadata: { replacementsCount, path: filePath },
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `AST rewrite failed: ${err.message}`,
      };
    }
  },
};
