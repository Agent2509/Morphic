import type { HttpServerConfig, McpTransport } from "../types.js";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  result?: any;
  error?: { code: number; message: string };
}

function parseSseForId(text: string, id: number | string): JsonRpcMessage | null {
  let fallback: JsonRpcMessage | null = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const msg = JSON.parse(data) as JsonRpcMessage;
      if (msg.id === id) return msg;
      if (msg.id !== undefined && !fallback) fallback = msg;
    } catch {
      // ignore non-JSON SSE data
    }
  }
  return fallback;
}

export class HttpTransport implements McpTransport {
  private nextId = 1;
  private closed = false;

  constructor(private config: HttpServerConfig) {}

  start(): void {
    this.closed = false;
  }

  close(): void {
    this.closed = true;
  }

  notify(method: string, params?: any): void {
    if (this.closed) return;
    void this.post({ jsonrpc: "2.0", method, params }).catch(() => {});
  }

  async send(method: string, params?: any): Promise<any> {
    if (this.closed) {
      throw new Error("MCP HTTP transport closed");
    }
    const id = this.nextId++;
    const msg = await this.post({ jsonrpc: "2.0", id, method, params });
    if (!msg) return undefined;
    if (msg.error) {
      throw new Error(`MCP error ${msg.error.code}: ${msg.error.message}`);
    }
    return msg.result;
  }

  private async post(body: Record<string, any>): Promise<JsonRpcMessage | null> {
    const res = await fetch(this.config.url, {
      method: "POST",
      headers: {
        ...(this.config.headers || {}),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`MCP HTTP request failed with status ${res.status}`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      const text = await res.text();
      return parseSseForId(text, body.id);
    }
    const text = await res.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as JsonRpcMessage;
  }
}
