import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { resolveSafePath } from "../path-utils.js";
import { walkFiles } from "@morphic/shared";

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const RG_TIMEOUT_MS = 15000;

const GrepSearchSchema = z.object({
  query: z.string().min(1).describe("The literal text to search for"),
  path: z.string().optional().describe("Directory or file path to search within (default: '.')"),
  caseInsensitive: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase() === "true" : v),
      z.boolean().optional()
    )
    .describe("Whether search should be case-insensitive (default: false)"),
  maxResults: z.coerce.number().int().positive().optional().describe("Maximum number of matches to return (default: 50)"),
});

function runRipgrep(
  args: string[],
  signal: AbortSignal | undefined
): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("rg", args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onAbort = () => {
      proc.kill("SIGKILL");
      finish(null);
    };

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };

    proc.stdout.on("data", (d) => {
      if (out.length < MAX_OUTPUT_BYTES) out += d.toString();
    });
    proc.on("error", () => finish(null));
    proc.on("close", (code) => {
      finish(code === 0 || code === 1 ? out.trim() : null);
    });

    timer = setTimeout(() => {
      proc.kill("SIGKILL");
      finish(null);
    }, RG_TIMEOUT_MS);

    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export const grepSearchTool: Tool<typeof GrepSearchSchema> = {
  name: "grep_search",
  description: "Search for a literal text string across project files, returning matching lines and file paths.",
  category: "read",
  parameters: GrepSearchSchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    const resolvedRoot = await resolveSafePath(context.cwd, args.path || ".");
    if (!resolvedRoot.ok) {
      return { success: false, output: "", error: resolvedRoot.error };
    }
    const searchRoot = resolvedRoot.abs;
    const maxResults = args.maxResults || 50;

    // Prefer ripgrep; --fixed-strings keeps semantics identical to the fallback.
    const rgArgs = ["--line-number", "--no-heading", "--color", "never", "--no-config", "--fixed-strings"];
    if (args.caseInsensitive) rgArgs.push("-i");
    rgArgs.push("--max-count", String(maxResults), "--", args.query, searchRoot);

    const rgResult = await runRipgrep(rgArgs, context.signal);
    if (rgResult !== null) {
      if (!rgResult) {
        return { success: true, output: `No matches found for '${args.query}' in '${args.path || "."}'.` };
      }
      const lines = rgResult.split("\n").slice(0, maxResults);
      return {
        success: true,
        output: lines.join("\n"),
        metadata: { count: lines.length, engine: "ripgrep" },
      };
    }

    // Native fallback
    const results: string[] = [];
    const ignoreDirs = new Set(["node_modules", ".git", "dist", ".next", ".turbo", "build", "coverage", ".bun", ".morphic"]);
    const needle = args.caseInsensitive ? args.query.toLowerCase() : args.query;

    let files: string[];
    try {
      files = await walkFiles(searchRoot, { ignoreDirs, signal: context.signal });
    } catch (err: any) {
      return { success: false, output: "", error: `Search failed in '${args.path || "."}': ${err.message}` };
    }

    for (const file of files) {
      if (context.signal?.aborted || results.length >= maxResults) break;
      try {
        const stat = await fs.stat(file);
        if (stat.size > MAX_FILE_BYTES) continue;
        const content = await fs.readFile(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          const target = args.caseInsensitive ? lines[i].toLowerCase() : lines[i];
          if (target.includes(needle)) {
            results.push(`${path.relative(context.cwd, file)}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      } catch {
        // Skip binary or unreadable files
      }
    }

    if (results.length === 0) {
      return { success: true, output: `No matches found for '${args.query}' in '${args.path || "."}'.` };
    }

    return {
      success: true,
      output: results.join("\n"),
      metadata: { count: results.length, engine: "native-scan" },
    };
  },
};
