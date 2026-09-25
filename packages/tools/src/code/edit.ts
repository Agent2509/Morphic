import { z } from "zod";
import * as fs from "node:fs/promises";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { resolveSafePath } from "../path-utils.js";

const EditFileSchema = z.object({
  path: z.string().describe("The relative or absolute path of the file to edit"),
  oldStr: z.string().min(1).describe("The exact text to find in the file. Must match uniquely."),
  newStr: z.string().describe("The replacement text that will replace oldStr"),
});

export const editFileTool: Tool<typeof EditFileSchema> = {
  name: "edit_file",
  description: "Edit a file by replacing an exact unique occurrence of oldStr with newStr.",
  category: "edit",
  parameters: EditFileSchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    const resolved = await resolveSafePath(context.cwd, args.path);
    if (!resolved.ok) {
      return { success: false, output: "", error: resolved.error };
    }
    const fullPath = resolved.abs;
    if (!args.oldStr) {
      return { success: false, output: "", error: "oldStr must not be empty." };
    }

    try {
      const content = await fs.readFile(fullPath, "utf-8");

      // Only collapse line endings when the file is consistently CRLF; mixed
      // endings are left untouched to avoid rewriting unrelated lines.
      const crlfCount = (content.match(/\r\n/g) || []).length;
      const lfCount = (content.match(/\n/g) || []).length;
      const usesCrlf = crlfCount > 0 && crlfCount === lfCount;

      const normalizedContent = usesCrlf ? content.replace(/\r\n/g, "\n") : content;
      const normalizedOld = args.oldStr.replace(/\r\n/g, "\n");
      const normalizedNew = args.newStr.replace(/\r\n/g, "\n");

      const occurrences = normalizedContent.split(normalizedOld).length - 1;

      if (occurrences === 0) {
        return {
          success: false,
          output: "",
          error: `Could not find exact match for oldStr in '${args.path}'. Ensure oldStr matches lines and whitespace exactly.`,
        };
      }

      if (occurrences > 1) {
        return {
          success: false,
          output: "",
          error: `Found ${occurrences} occurrences of oldStr in '${args.path}'. oldStr must be unique; include more surrounding lines of context.`,
        };
      }

      // Function form prevents `$&`/`$1` in newStr from being expanded.
      let updatedContent = normalizedContent.replace(normalizedOld, () => normalizedNew);
      if (usesCrlf) {
        updatedContent = updatedContent.replace(/\n/g, "\r\n");
      }
      await fs.writeFile(fullPath, updatedContent, "utf-8");

      return {
        success: true,
        output: `Successfully updated '${args.path}'.`,
        metadata: {
          path: fullPath,
          replacedBytes: args.oldStr.length,
          newBytes: args.newStr.length,
        },
      };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return {
          success: false,
          output: "",
          error: `File not found: ${args.path}. Use create_file to create new files.`,
        };
      }
      return {
        success: false,
        output: "",
        error: `Failed to edit file '${args.path}': ${err.message}`,
      };
    }
  },
};
