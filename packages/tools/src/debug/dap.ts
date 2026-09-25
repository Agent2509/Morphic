import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { resolveSafePath } from "../path-utils.js";

const DapDebugSchema = z.object({
  stackTrace: z.string().describe("The error message and stack trace to inspect"),
});

export const dapDebugTool: Tool<typeof DapDebugSchema> = {
  name: "dap_inspect",
  description: "Debug Adapter Protocol inspection: parses runtime stack traces, locates the exact failing source lines, and extracts contextual code frames.",
  category: "read",
  parameters: DapDebugSchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    try {
      const lines = args.stackTrace.split("\n");
      const frames: Array<{ file: string; line: number; col?: number; snippet?: string }> = [];

      // Regex matching common stack frames:
      // at Object.<anonymous> (/path/to/file.ts:42:15)
      // at /path/to/file.ts:42:15
      const frameRegex = /(?:at\s+(?:.*?\s+)?\(?|\s+)([^\s()]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?\)?/;

      for (const l of lines) {
        const match = l.match(frameRegex);
        if (match) {
          const filePath = match[1];
          const lineNum = parseInt(match[2], 10);
          const colNum = match[3] ? parseInt(match[3], 10) : undefined;

          // Exclude internal node_modules/bun runtime frames if possible
          if (!filePath.includes("node_modules") && !filePath.includes(".bun")) {
            frames.push({
              file: filePath,
              line: lineNum,
              col: colNum,
            });
          }
        }
      }

      if (frames.length === 0) {
        return {
          success: true,
          output: "No workspace source frames found in stack trace.",
        };
      }

      // Read top frame for code context
      const top = frames[0];
      const resolved = await resolveSafePath(context.cwd, top.file);

      let contextSnippet = "";
      if (resolved.ok) {
        try {
          const source = await fs.readFile(resolved.abs, "utf-8");
          const srcLines = source.split("\n");
          const start = Math.max(0, top.line - 3);
          const end = Math.min(srcLines.length, top.line + 2);

          contextSnippet = srcLines
            .slice(start, end)
            .map((code, idx) => {
              const currentLine = start + idx + 1;
              const marker = currentLine === top.line ? " >> " : "    ";
              return `${marker}${currentLine}: ${code}`;
            })
            .join("\n");
        } catch {
          // file unreadable
        }
      }

      const displayPath = (file: string): string => {
        const rel = path.relative(context.cwd, path.resolve(context.cwd, file));
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          return `${path.basename(file)} (outside workspace)`;
        }
        return file;
      };

      const report = [
        `DAP Inspection Report:`,
        `Primary Failure Location: ${displayPath(top.file)}:${top.line}${top.col ? `:${top.col}` : ""}`,
        contextSnippet ? `\nCode Context:\n${contextSnippet}` : "",
        `\nTotal Source Frames: ${frames.length}`,
        ...frames.map((f, i) => `  [${i}] ${displayPath(f.file)}:${f.line}`),
      ].filter(Boolean).join("\n");

      return {
        success: true,
        output: report,
        metadata: { topFrame: { ...top, file: displayPath(top.file) }, frameCount: frames.length },
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `DAP inspection failed: ${err.message}`,
      };
    }
  },
};
