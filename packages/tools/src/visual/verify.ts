import { z } from "zod";
import * as fs from "node:fs/promises";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { resolveSafePath } from "../path-utils.js";

const VisualVerifySchema = z.object({
  target: z.string().describe("URL (e.g. http://localhost:3000) or path to local HTML file"),
  expectedSelector: z.string().optional().describe("Optional DOM tag, class, or id expected to be present"),
});

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "[::1]"]);
const MAX_BODY_BYTES = 5 * 1024 * 1024;

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }
  const decoder = new TextDecoder();
  let out = "";
  while (out.length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  try {
    await reader.cancel();
  } catch {
    // ignore
  }
  return out.slice(0, maxBytes);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Lightweight selector check against raw HTML: supports #id, .class,
 * [attr=value], and bare tag names.
 */
export function selectorMatches(content: string, selector: string): boolean {
  const sel = selector.trim();
  if (!sel) return true;

  if (sel.startsWith("#")) {
    const id = escapeRegExp(sel.slice(1));
    return new RegExp(`id\\s*=\\s*["']${id}["']`, "i").test(content);
  }
  if (sel.startsWith(".")) {
    const cls = escapeRegExp(sel.slice(1));
    return new RegExp(`class\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["']`, "i").test(content);
  }
  const attr = sel.match(/^\[?([\w-]+)\s*=\s*["']?([^"'\]]+)["']?\]?$/);
  if (attr && (sel.startsWith("[") || sel.includes("="))) {
    const [, name, value] = attr;
    return new RegExp(`${escapeRegExp(name)}\\s*=\\s*["']?${escapeRegExp(value)}`, "i").test(content);
  }
  const tag = escapeRegExp(sel.replace(/^<|>$/g, ""));
  return new RegExp(`<${tag}[\\s/>]`, "i").test(content);
}

export const visualVerifyTool: Tool<typeof VisualVerifySchema> = {
  name: "visual_verify",
  description: "Verify frontend web application status, HTML rendering health, and detect console errors or missing assets.",
  category: "read",
  parameters: VisualVerifySchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    try {
      let content = "";
      let statusCode = 200;

      if (args.target.startsWith("http://") || args.target.startsWith("https://")) {
        let url: URL;
        try {
          url = new URL(args.target);
        } catch {
          return { success: false, output: "", error: `Invalid URL: ${args.target}` };
        }

        if (!LOCAL_HOSTNAMES.has(url.hostname)) {
          return {
            success: false,
            output: "",
            error: `Refusing to fetch non-local URL '${args.target}'. visual_verify only permits localhost targets.`,
          };
        }

        const timeout = AbortSignal.timeout(15000);
        const signal = context.signal
          ? AbortSignal.any([timeout, context.signal])
          : timeout;

        const response = await fetch(url, {
          method: "GET",
          redirect: "manual",
          signal,
        });
        statusCode = response.status;
        content = await readCapped(response, MAX_BODY_BYTES);
      } else {
        const resolved = await resolveSafePath(context.cwd, args.target);
        if (!resolved.ok) {
          return { success: false, output: "", error: resolved.error };
        }
        const stat = await fs.stat(resolved.abs);
        if (stat.size > MAX_BODY_BYTES) {
          return {
            success: false,
            output: "",
            error: `Target file is too large (${Math.round(stat.size / (1024 * 1024))}MB > 5MB limit).`,
          };
        }
        content = await fs.readFile(resolved.abs, "utf-8");
      }

      // Check for common frontend fatal errors in rendered HTML
      const fatalErrors: string[] = [];
      if (content.includes("Uncaught Exception") || content.includes("Uncaught TypeError")) {
        fatalErrors.push("Render output contains Uncaught TypeError");
      }
      if (content.includes("500 Internal Server Error")) {
        fatalErrors.push("500 Internal Server Error detected");
      }

      // Extract title
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : "(No title found)";

      // Check expectedSelector if provided
      let selectorFound = true;
      if (args.expectedSelector) {
        selectorFound = selectorMatches(content, args.expectedSelector);
      }

      const success = statusCode >= 200 && statusCode < 400 && fatalErrors.length === 0 && selectorFound;

      return {
        success,
        output: [
          `Target: ${args.target}`,
          `Status: ${statusCode}`,
          `Page Title: ${title}`,
          `Content Length: ${content.length} bytes`,
          args.expectedSelector ? `Selector '${args.expectedSelector}': ${selectorFound ? "FOUND" : "NOT FOUND"}` : "",
          fatalErrors.length > 0 ? `Errors: ${fatalErrors.join("; ")}` : "No critical rendering errors detected.",
        ].filter(Boolean).join("\n"),
        metadata: {
          statusCode,
          title,
          contentLength: content.length,
          fatalErrors,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Visual verification failed: ${err.message}`,
      };
    }
  },
};
