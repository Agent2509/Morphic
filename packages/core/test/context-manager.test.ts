import { describe, expect, it } from "bun:test";
import { ContextManager } from "../src/index.js";

function assertNoOrphans(messages: any[]): void {
  const assistantCallIds = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) assistantCallIds.add(tc.id);
    }
  }
  const toolCallIds = new Set(
    messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id)
  );

  for (const id of toolCallIds) {
    expect(assistantCallIds.has(id)).toBe(true);
  }
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        expect(toolCallIds.has(tc.id)).toBe(true);
      }
    }
  }
}

describe("ContextManager budget trimming", () => {
  it("never orphans tool results or assistant tool calls", () => {
    const ctx = new ContextManager({ maxTokens: 80, systemPrompt: "sys" });

    for (let i = 0; i < 6; i++) {
      ctx.addUserMessage(`turn ${i} ` + "u".repeat(120));
      ctx.addAssistantMessage("", [
        { id: `call_${i}`, type: "function", function: { name: "f", arguments: "{}" } },
      ]);
      ctx.addToolResult(`call_${i}`, "f", `result ${i} ` + "r".repeat(120));
    }

    const messages = ctx.getMessages();
    expect(messages.length).toBeGreaterThan(1);
    assertNoOrphans(messages);
    expect(messages[0].role).toBe("system");
  });

  it("keeps the active single turn even when over budget", () => {
    const ctx = new ContextManager({ maxTokens: 20, systemPrompt: "sys" });
    ctx.addUserMessage("x".repeat(400));
    ctx.addAssistantMessage("", [
      { id: "call_a", type: "function", function: { name: "f", arguments: "{}" } },
    ]);
    ctx.addToolResult("call_a", "f", "y".repeat(400));

    const messages = ctx.getMessages();
    expect(messages.some((m) => m.role === "user")).toBe(true);
    assertNoOrphans(messages);
  });

  it("updates and restores the system prompt", () => {
    const ctx = new ContextManager({ systemPrompt: "original" });
    ctx.setSystemPrompt("updated");
    expect(ctx.getMessages()[0].content).toBe("updated");

    ctx.clear();
    expect(ctx.getMessages()).toHaveLength(1);
    expect(ctx.getMessages()[0].role).toBe("system");
    expect(ctx.getMessages()[0].content).toBe("updated");
  });

  it("prepends a system prompt when none exists", () => {
    const ctx = new ContextManager({ systemPrompt: "s" });
    (ctx as any).messages = [{ role: "user", content: "hi" }];
    ctx.setSystemPrompt("injected");
    expect(ctx.getMessages()[0]).toEqual({ role: "system", content: "injected" });
  });
});
