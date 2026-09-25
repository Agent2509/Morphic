import { describe, expect, it } from "bun:test";
import { ContextCompactor } from "../src/context/compactor.js";
import type { ChatMessage } from "@morphic/providers";

describe("ContextCompactor", () => {
  it("estimates token counts accurately", () => {
    const compactor = new ContextCompactor({ maxTokens: 1000 });
    const messages: ChatMessage[] = [
      { role: "system", content: "You are Morphic." },
      { role: "user", content: "Hello world" },
    ];

    const estimate = compactor.estimateTokens(messages);
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(50);
  });

  it("detects when compaction is required based on token limit", () => {
    const compactor = new ContextCompactor({ maxTokens: 100 });
    const smallMessages: ChatMessage[] = [
      { role: "system", content: "Short prompt" },
      { role: "user", content: "Hi" },
    ];
    expect(compactor.needsCompaction(smallMessages)).toBe(false);

    const largeMessages: ChatMessage[] = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "A".repeat(500) },
    ];
    expect(compactor.needsCompaction(largeMessages)).toBe(true);
  });

  it("compacts older history while preserving system prompt, recent turns, and errors", () => {
    const compactor = new ContextCompactor({
      maxTokens: 5000,
      preserveRecentCount: 2,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: "System Base Prompt" },
      { role: "user", content: "First task: setup database" },
      { role: "assistant", content: "Database setup started." },
      { role: "user", content: "Second task: run migration" },
      { role: "assistant", content: "Error: Migration failed on line 42" },
      { role: "user", content: "Third task: fix migration" },
      { role: "assistant", content: "Migration fixed." },
      { role: "user", content: "Recent turn 1: check status" },
      { role: "assistant", content: "Recent turn 2: status is healthy." },
    ];

    const result = compactor.compact(messages);

    expect(result.summarizedCount).toBe(6); // 7 working - 2 recent
    expect(result.compactedMessages.length).toBe(3); // system(summary) + 2 recent

    // The summary is folded into the single leading system message.
    const system = result.compactedMessages[0].content as string;
    expect(system).toContain("System Base Prompt");
    expect(system).toContain("Error: Migration failed");
    expect(system).toContain("First task");
    expect(result.compactedMessages.filter((m) => m.role === "system")).toHaveLength(1);

    // Preserves recent messages
    expect(result.compactedMessages[1].content).toBe("Recent turn 1: check status");
    expect(result.compactedMessages[2].content).toBe("Recent turn 2: status is healthy.");
  });
});
