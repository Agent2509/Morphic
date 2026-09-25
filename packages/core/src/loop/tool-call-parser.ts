import type { ToolCall } from "@morphic/providers";

function extractBalancedObjects(text: string): string[] {
  const out: string[] = [];
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
          out.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  return out;
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
