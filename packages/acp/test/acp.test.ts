import { describe, expect, it } from "bun:test";
import { AcpServer } from "../src/index.js";
import type { AcpNotification } from "../src/types.js";

describe("AcpServer", () => {
  it("handles initialize request with protocol capabilities", async () => {
    const server = new AcpServer();
    const res = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "vscode", version: "1.0" } },
    });

    expect(res.error).toBeUndefined();
    expect(res.result.serverInfo.name).toBe("morphic-acp");
    expect(res.result.capabilities.streaming).toBe(true);
    expect(res.result.capabilities.multiAgent).toBe(true);
  });

  it("creates a session and processes a prompt", async () => {
    const notifications: AcpNotification[] = [];
    const server = new AcpServer({
      onNotification: (n) => notifications.push(n),
    });

    // 1. Create session
    const sessionRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "session/new",
      params: { singleAgent: true, permissionLevel: 4 },
    });

    expect(sessionRes.result.sessionId).toBeDefined();
    const sessionId = sessionRes.result.sessionId;

    // 2. Execute prompt
    const promptRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "session/prompt",
      params: {
        sessionId,
        prompt: "Say hello",
      },
    });

    expect(promptRes.error).toBeUndefined();
    expect(promptRes.result.output).toBeDefined();
  });

  it("handles raw JSON-RPC messages and invalid requests", async () => {
    const server = new AcpServer();
    const rawRes = await server.handleMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 42,
        method: "initialize",
      })
    );

    expect(rawRes).not.toBeNull();
    const parsed = JSON.parse(rawRes!);
    expect(parsed.id).toBe(42);
    expect(parsed.result.serverInfo.name).toBe("morphic-acp");

    // Invalid method
    const invalidRes = await server.handleMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 99,
        method: "unknown/method",
      })
    );
    const parsedInvalid = JSON.parse(invalidRes!);
    expect(parsedInvalid.error.code).toBe(-32601);
  });
});
