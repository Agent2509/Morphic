import { describe, expect, it } from "bun:test";
import { MorphicMcpClient } from "../src/index.js";

describe("MCP HTTP transport", () => {
  it("connects, discovers and calls tools over HTTP", async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const msg: any = await req.json();
        if (msg.id === undefined) {
          return new Response("", { status: 202 });
        }
        let result: any;
        if (msg.method === "initialize") {
          result = { protocolVersion: "2024-11-05", serverInfo: { name: "http-mock", version: "1" } };
        } else if (msg.method === "tools/list") {
          result = {
            tools: [{ name: "ping", description: "Ping", inputSchema: { type: "object", properties: {} } }],
          };
        } else if (msg.method === "tools/call") {
          result = { content: [{ type: "text", text: "pong-http" }] };
        }
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    try {
      const client = new MorphicMcpClient("http", { url: `http://127.0.0.1:${server.port}` });
      await client.connect();
      expect(client.getDiscoveredTools()).toHaveLength(1);

      const tool = client.toMorphicTools()[0];
      expect(tool.name).toBe("http_ping");
      const res = await tool.execute({}, { cwd: process.cwd() });
      expect(res.success).toBe(true);
      expect(res.output).toContain("pong-http");

      client.close();
    } finally {
      server.stop(true);
    }
  });
});
