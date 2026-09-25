import { describe, expect, it } from "bun:test";
import { createDefaultToolRegistry } from "@morphic/tools";
import { AgentController, PermissionEngine, PermissionLevel } from "../src/index.js";

function makeTools() {
  return createDefaultToolRegistry();
}

function makeProvider(
  chatStream: (messages: any[], options: any, onChunk?: any) => Promise<any>
) {
  return {
    id: "mock",
    name: "Mock",
    isAvailable: async () => true,
    listModels: async () => [],
    chat: async () => {
      throw new Error("not used");
    },
    chatStream,
  } as any;
}

const toolCall = (name: string, args: any = {}) => ({
  id: `c_${name}`,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});

describe("AgentController loop", () => {
  it("stops at max turns", async () => {
    const controller = new AgentController({
      provider: makeProvider(async () => ({
        content: "",
        tool_calls: [toolCall("read_file", { path: "nope.txt" })],
        finish_reason: "tool_calls",
        model: "mock",
      })),
      tools: makeTools(),
      permissions: new PermissionEngine(PermissionLevel.Auto),
      maxTurns: 2,
    });

    const result = await controller.run("go");
    expect(result).toContain("maximum allowed turns");
  });

  it("feeds unknown-tool errors back to the model", async () => {
    let call = 0;
    const finished: any[] = [];
    const controller = new AgentController({
      provider: makeProvider(async () => {
        call++;
        return call === 1
          ? {
              content: "",
              tool_calls: [toolCall("does_not_exist")],
              finish_reason: "tool_calls",
              model: "mock",
            }
          : { content: "done", finish_reason: "stop", model: "mock" };
      }),
      tools: makeTools(),
      permissions: new PermissionEngine(PermissionLevel.Auto),
    });

    const result = await controller.run("go", {
      onToolFinish: (_id, _name, res) => finished.push(res),
    });
    expect(result).toBe("done");
    expect(finished[0].success).toBe(false);
    expect(finished[0].error).toContain("not found");
  });

  it("retries without tools when the provider rejects tool schemas", async () => {
    let call = 0;
    const controller = new AgentController({
      provider: makeProvider(async (_messages, options, onChunk) => {
        call++;
        if (call === 1 && options?.tools) {
          throw new Error("This model does not support tools");
        }
        onChunk?.({ content: "streamed " });
        return { content: "plain answer", finish_reason: "stop", model: "mock" };
      }),
      tools: makeTools(),
      permissions: new PermissionEngine(PermissionLevel.Auto),
    });

    const tokens: string[] = [];
    const result = await controller.run("go", { onToken: (t) => tokens.push(t) });
    expect(result).toBe("plain answer");
    expect(tokens).toContain("streamed ");
  });

  it("exposes accessors and setters", () => {
    const controller = new AgentController({
      provider: makeProvider(async () => ({ content: "x", finish_reason: "stop", model: "m" })),
      tools: makeTools(),
    });
    expect(controller.getContext()).toBeDefined();
    expect(controller.getPermissions()).toBeDefined();
    expect(controller.getTools()).toBeDefined();
    expect(() => controller.setProvider(makeProvider(async () => ({})))).not.toThrow();
    expect(() => controller.setModel("m2")).not.toThrow();
    expect(() => controller.setSignal(new AbortController().signal)).not.toThrow();
  });

  it("recovers tool calls embedded as JSON text", async () => {
    let call = 0;
    const finished: any[] = [];
    const controller = new AgentController({
      provider: makeProvider(async () => {
        call++;
        return call === 1
          ? {
              content: 'Sure. {"name": "read_file", "arguments": {"path": "nope.txt"}}',
              finish_reason: "stop",
              model: "mock",
            }
          : { content: "final", finish_reason: "stop", model: "mock" };
      }),
      tools: makeTools(),
      permissions: new PermissionEngine(PermissionLevel.Auto),
    });

    const result = await controller.run("go", {
      onToolFinish: (_id, _name, res) => finished.push(res),
    });
    expect(result).toBe("final");
    expect(finished).toHaveLength(1);
  });

  it("emits status and error events", async () => {
    const statuses: string[] = [];
    const controller = new AgentController({
      provider: makeProvider(async () => {
        throw new Error("boom");
      }),
      tools: makeTools(),
      permissions: new PermissionEngine(PermissionLevel.Auto),
    });

    let errored = false;
    await expect(
      controller.run("go", {
        onStatusChange: (s) => statuses.push(s),
        onError: () => {
          errored = true;
        },
      })
    ).rejects.toThrow("boom");
    expect(errored).toBe(true);
    expect(statuses).toContain("Error");
  });
});
