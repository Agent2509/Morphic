import { describe, expect, it } from "bun:test";
import { ResearcherAgent } from "../src/roles/researcher.js";
import type { ModelProvider, ChatMessage } from "@morphic/providers";

const mockProvider: ModelProvider = {
  id: "mock",
  name: "Mock",
  async isAvailable() {
    return true;
  },
  async listModels() {
    return [{ id: "m", name: "m" }];
  },
  async chat() {
    throw new Error("not used");
  },
  async chatStream(_messages: ChatMessage[], _options?: any, onChunk?: any) {
    const response = "Key symbols: Engine, CoreConfig.";
    onChunk?.({ content: response });
    return { content: response, finish_reason: "stop", model: "mock" };
  },
};

describe("ResearcherAgent", () => {
  it("carries the plan forward and produces research findings", async () => {
    const researcher = new ResearcherAgent({ provider: mockProvider });
    const handoff = await researcher.process({
      from: "planner",
      to: "researcher",
      summary: "Inspect the engine module",
      plan: { steps: [{ description: "read engine", files: ["engine.ts"], complexity: 3 }] },
      action: "proceed",
    });

    expect(handoff.from).toBe("researcher");
    expect(handoff.to).toBe("coder");
    expect(handoff.plan?.steps[0].description).toBe("read engine");
    expect(handoff.research?.contextNotes[0]).toContain("Engine");
    expect(handoff.action).toBe("proceed");
  });

  it("works without an incoming plan", async () => {
    const researcher = new ResearcherAgent({ provider: mockProvider });
    const handoff = await researcher.process({
      from: "planner",
      to: "researcher",
      summary: "",
      action: "proceed",
    });
    expect(handoff.research).toBeDefined();
    expect(handoff.research?.relevantFiles).toEqual([]);
  });
});
