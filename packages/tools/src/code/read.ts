import { z } from "zod";
import * as fs from "node:fs/promises";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { resolveSafePath } from "../path-utils.js";

const ReadFileSchema = z.object({
  path: z.string().describe("The relative or absolute path of the file to read"),
  startLine: z.coerce.number().int().positive().optional().describe("1-indexed starting line number (optional)"),
  endLine: z.coerce.number().int().positive().optional().describe("1-indexed ending line number (optional)"),
});

export const readFileTool: Tool<typeof ReadFileSchema> = {
  name: "read_file",
  description: "Read the contents of a file from disk with optional line ranges and line numbers.",
  category: "read",
  parameters: ReadFileSchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    const resolved = await resolveSafePath(context.cwd, args.path);
    if (!resolved.ok) {
      return { success: false, output: "", error: resolved.error };
    }
    const fullPath = resolved.abs;

    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        return {
          success: false,
          output: "",
          error: `Path '${args.path}' is a directory, not a file.`,
        };
      }

      const MAX_FILE_BYTES = 10 * 1024 * 1024;
      if (stats.size > MAX_FILE_BYTES) {
        return {
          success: false,
          output: "",
          error: `File '${args.path}' is too large (${Math.round(stats.size / (1024 * 1024))}MB > 10MB limit).`,
        };
      }

      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n");
      const totalLines = lines.length;

      const start = args.startLine ? Math.max(1, args.startLine) : 1;
      const end = args.endLine ? Math.min(totalLines, args.endLine) : totalLines;

      if (start > totalLines) {
        return {
          success: true,
          output: `File has ${totalLines} lines. Requested start line ${start} is beyond file end.`,
        };
      }

      if (end < start) {
        return {
          success: false,
          output: "",
          error: `Invalid line range: endLine (${end}) is before startLine (${start}).`,
        };
      }

      const selectedLines = lines.slice(start - 1, end);
      const numberedContent = selectedLines
        .map((line, idx) => `${start + idx}: ${line}`)
        .join("\n");

      return {
        success: true,
        output: numberedContent,
        metadata: {
          path: fullPath,
          totalLines,
          startLine: start,
          endLine: end,
        },
      };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return {
          success: false,
          output: "",
          error: `File not found: ${args.path}`,
        };
      }
      return {
        success: false,
        output: "",
        error: `Failed to read file ${args.path}: ${err.message}`,
      };
    }
  },
};
