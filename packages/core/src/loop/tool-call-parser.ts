import type { ToolCall } from "@morphic/providers";

interface ObjectSpan {
  text: string;
  start: number;
  end: number;
}

function extractBalancedObjectsWithSpans(text: string): ObjectSpan[] {
  const out: ObjectSpan[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          out.push({ text: text.slice(start, i + 1), start, end: i + 1 });
          start = -1;
        }
      }
    }
  }

  return out;
}

function extractBalancedObjects(text: string): string[] {
  return extractBalancedObjectsWithSpans(text).map((s) => s.text);
}

function toToolCall(
  value: unknown,
  isKnownTool: (name: string) => boolean
): ToolCall | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, any>;

  const fn = obj.function && typeof obj.function === "object" ? obj.function : undefined;
  const name = obj.name ?? obj.tool ?? obj.tool_name ?? fn?.name;
  if (typeof name !== "string" || !isKnownTool(name)) return null;

  let args = obj.parameters ?? obj.arguments ?? obj.args ?? fn?.arguments ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  } else if (!args || typeof args !== "object") {
    args = {};
  }

  return {
    id: "",
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

export function parseToolCallsFromText(
  content: string,
  isKnownTool: (name: string) => boolean,
  maxCalls: number = 8
): ToolCall[] {
  if (!content) return [];

  const calls: ToolCall[] = [];
  const seen = new Set<string>();

  for (const candidate of extractBalancedObjects(content)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }

    const values = Array.isArray(parsed) ? parsed : [parsed];
    for (const value of values) {
      const call = toToolCall(value, isKnownTool);
      if (!call) continue;

      const key = `${call.function.name}:${call.function.arguments}`;
      if (seen.has(key)) continue;
      seen.add(key);

      call.id = `textcall_${calls.length}_${Date.now()}`;
      calls.push(call);
      if (calls.length >= maxCalls) return calls;
    }
  }

  return calls;
}

export function stripToolCallsFromText(
  content: string,
  isKnownTool: (name: string) => boolean
): string {
  if (!content) return "";

  const spansToRemove: { start: number; end: number }[] = [];
  for (const span of extractBalancedObjectsWithSpans(content)) {
    try {
      const parsed = JSON.parse(span.text);
      const values = Array.isArray(parsed) ? parsed : [parsed];
      let hasTool = false;
      for (const val of values) {
        if (toToolCall(val, isKnownTool)) {
          hasTool = true;
          break;
        }
      }
      if (hasTool) {
        spansToRemove.push({ start: span.start, end: span.end });
      }
    } catch {
      continue;
    }
  }

  if (spansToRemove.length === 0) return content;

  // Remove spans from back to front to keep character offsets valid
  spansToRemove.sort((a, b) => b.start - a.start);
  let cleaned = content;
  for (const span of spansToRemove) {
    cleaned = cleaned.slice(0, span.start) + cleaned.slice(span.end);
  }

  // Also clean up any empty markdown fences (e.g. ```json \n ```) leftover
  cleaned = cleaned.replace(/```(?:json)?\s*```/g, "");

  return cleaned.trim();
}
