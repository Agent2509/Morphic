import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { resolveSafePath } from "../path-utils.js";

const CreateFileSchema = z.object({
  path: z.string().describe("The path of the file to create"),
  content: z.string().describe("The text content to write into the file"),
  overwrite: z
    .boolean()
    .optional()
    .describe("Set to true if you explicitly want to overwrite an existing file (default: false)"),
});

export const createFileTool: Tool<typeof CreateFileSchema> = {
  name: "create_file",
  description: "Create a new file on disk with given content. Automatically creates parent directories.",
  category: "edit",
  parameters: CreateFileSchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    const resolved = await resolveSafePath(context.cwd, args.path);
    if (!resolved.ok) {
      return { success: false, output: "", error: resolved.error };
    }
    const fullPath = resolved.abs;

    try {
      try {
        await fs.access(fullPath);
        if (!args.overwrite) {
          return {
            success: false,
            output: "",
            error: `File already exists at '${args.path}'. Set overwrite: true or use edit_file.`,
          };
        }
      } catch {
        // File does not exist, proceed
      }

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, args.content, "utf-8");

      return {
        success: true,
        output: `Successfully created file '${args.path}' (${args.content.length} bytes).`,
        metadata: {
          path: fullPath,
          bytes: args.content.length,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Failed to create file '${args.path}': ${err.message}`,
      };
    }
  },
};
