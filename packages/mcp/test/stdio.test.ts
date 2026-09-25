import { describe, expect, it } from "bun:test";
import { StdioTransport, buildChildEnv } from "../src/transport/stdio.js";

describe("MCP child environment", () => {
  it("does not leak arbitrary secrets into child processes", () => {
    process.env.MORPHIC_TEST_SECRET = "super-secret-value";
    try {
      const env = buildChildEnv({ CUSTOM: "yes" });
      expect(env.MORPHIC_TEST_SECRET).toBeUndefined();
      expect(env.CUSTOM).toBe("yes");
      expect(env.PATH).toBeDefined();
    } finally {
      delete process.env.MORPHIC_TEST_SECRET;
    }
  });
});

describe("StdioTransport failure handling", () => {
  it("rejects pending requests when closed", async () => {
    const transport = new StdioTransport({ command: "sleep", args: ["5"] });
    transport.start();
    const pending = transport.send("never/responds", {});
    transport.close();
    await expect(pending).rejects.toThrow("MCP transport closed");
  });

  it("rejects when the server binary cannot be spawned", async () => {
    const transport = new StdioTransport({
      command: "definitely-not-a-real-binary-morphic-xyz",
    });
    transport.start();
    await expect(transport.send("initialize", {})).rejects.toThrow();
    transport.close();
  });

  it("writes notifications without awaiting a response", () => {
    const transport = new StdioTransport({ command: "sleep", args: ["5"] });
    expect(() => transport.notify("notifications/initialized", {})).not.toThrow();
    transport.close();
  });
});
