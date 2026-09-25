import { describe, expect, it } from "bun:test";
import { PermissionLevel } from "@morphic/core";
import { AcpServer } from "../src/index.js";
import type { AcpNotification } from "../src/types.js";

describe("AcpServer extended", () => {
  it("reports a parse error for invalid JSON", async () => {
    const server = new AcpServer();
    const res = await server.handleMessage("not json at all");
    const parsed = JSON.parse(res!);
    expect(parsed.error.code).toBe(-32700);
  });

  it("requires the auth token when configured", async () => {
    const server = new AcpServer({ authToken: "secret-token" });
    const denied = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });
    expect(denied.error?.code).toBe(-32001);

    const allowed = await server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { authToken: "secret-token" },
    });
    expect(allowed.error).toBeUndefined();
    expect(allowed.result.serverInfo.name).toBe("morphic-acp");
  });

  it("ignores client permission levels and rejects cwd escapes", async () => {
    const server = new AcpServer({ cwd: process.cwd() });
    const escape = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "session/new",
      params: { singleAgent: true, permissionLevel: 4, cwd: "../" },
    });
    expect(escape.error?.code).toBe(-32602);
  });

  it("errors on unknown sessions and missing params", async () => {
    const server = new AcpServer();
    const missing = await server.handleMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/prompt", params: {} })
    );
    expect(JSON.parse(missing!).error).toBeDefined();

    const unknown = await server.handleMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "session/prompt",
        params: { sessionId: "ghost", prompt: "hi" },
      })
    );
    expect(JSON.parse(unknown!).error.message).toContain("ghost");
  });

  it("streams tokens for a single-agent session and handles cancel/close", async () => {
    const notifications: AcpNotification[] = [];
    const server = new AcpServer({ onNotification: (n) => notifications.push(n) });

    const created = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "session/new",
      params: { singleAgent: true, permissionLevel: 4 },
    });
    const sessionId = created.result.sessionId;

    const prompt = await server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: { sessionId, prompt: "hello" },
    });
    expect(prompt.error).toBeUndefined();
    expect(prompt.result.output).toBeTruthy();
    expect(notifications.some((n) => n.method === "session/token")).toBe(true);

    // Invalid permission response
    const badPerm = await server.handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "permission/response",
      params: { sessionId, requestId: "nope", allowed: true },
    });
    expect(badPerm.error?.code).toBe(-32602);

    const cancel = await server.handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "session/cancel",
      params: { sessionId },
    });
    expect(cancel.result.success).toBe(true);

    // A cancelled session is removed, so a further prompt fails.
    server.closeAll();
    const afterClose = await server.handleRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "session/prompt",
      params: { sessionId, prompt: "again" },
    });
    expect(afterClose.error).toBeDefined();
  });

  it("runs a multi-agent session without an explicit provider", async () => {
    const server = new AcpServer();
    const created = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "session/new",
      params: { singleAgent: false, permissionLevel: 4 },
    });
    const sessionId = created.result.sessionId;

    const prompt = await server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: { sessionId, prompt: "Refactor the whole architecture across multiple files" },
    });
    expect(prompt.error).toBeUndefined();
    expect(prompt.result.output).toBeTruthy();
  });

  it("supports replacing the notification handler", async () => {
    const received: AcpNotification[] = [];
    const server = new AcpServer();
    server.setNotificationHandler((n) => received.push(n));

    const created = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "session/new",
      params: { singleAgent: true, permissionLevel: 4 },
    });
    await server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: { sessionId: created.result.sessionId, prompt: "hi" },
    });
    expect(received.some((n) => n.method === "session/token")).toBe(true);
  });

  it("round-trips a permission request for a strict session", async () => {
    let calls = 0;
    const provider: any = {
      id: "perm-mock",
      name: "Perm Mock",
      isAvailable: async () => true,
      listModels: async () => [],
      chat: async () => {
        throw new Error("not used");
      },
      chatStream: async () => {
        calls++;
        if (calls === 1) {
          return {
            content: "",
            tool_calls: [
              {
                id: "c1",
                type: "function",
                function: { name: "read_file", arguments: JSON.stringify({ path: "x.txt" }) },
              },
            ],
            finish_reason: "tool_calls",
            model: "perm-mock",
          };
        }
        return { content: "approved-done", finish_reason: "stop", model: "perm-mock" };
      },
    };

    let sessionId = "";
    let requestId = "";
    let releasePermission: () => void = () => {};
    const permissionRequested = new Promise<void>((resolve) => {
      releasePermission = resolve;
    });

    const server = new AcpServer({
      defaultProvider: provider,
      permissionLevel: PermissionLevel.Strict,
      onNotification: (n) => {
        if (n.method === "permission/request") {
          requestId = n.params.requestId;
          releasePermission();
        }
      },
    });

    const created = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "session/new",
      params: { singleAgent: true, permissionLevel: 1 },
    });
    sessionId = created.result.sessionId;

    const promptPromise = server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: { sessionId, prompt: "read the file" },
    });

    await permissionRequested;
    const decision = await server.handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "permission/response",
      params: { sessionId, requestId, allowed: true },
    });
    expect(decision.result.success).toBe(true);

    const result = await promptPromise;
    expect(result.result.output).toBe("approved-done");
    server.closeAll();
  });
});
