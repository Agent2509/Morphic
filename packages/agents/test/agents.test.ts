import { describe, expect, it } from "bun:test";
import { PlannerAgent } from "../src/roles/planner.js";
import { ResearcherAgent } from "../src/roles/researcher.js";
import { CoderAgent } from "../src/roles/coder.js";
import { ReviewerAgent } from "../src/roles/reviewer.js";
import { TesterAgent } from "../src/roles/tester.js";
import type { ModelProvider, ChatMessage } from "@morphic/providers";

describe("Multi-Agent Roles", () => {
  const mockProvider: ModelProvider = {
    id: "mock",
    name: "Mock Provider",
    async isAvailable() {
      return true;
    },
    async listModels() {
      return [{ id: "mock-model", name: "Mock" }];
    },
    async chat() {
      throw new Error("not used");
    },
    async chatStream(messages: ChatMessage[], options?: any, onChunk?: any) {
      const response = "Completed agent work successfully.";
      onChunk?.({ content: response });
      return {
        content: response,
        finish_reason: "stop",
        model: "mock-model",
      };
    },
  };

  it("ReviewerAgent has STRICTLY read-only tools", () => {
    const reviewer = new ReviewerAgent({ provider: mockProvider });
    const tools = (reviewer as any).tools.list().map((t: any) => t.name);

    expect(tools).toContain("read_file");
    expect(tools).toContain("grep_search");
    expect(tools).not.toContain("edit_file");
    expect(tools).not.toContain("create_file");
    expect(tools).not.toContain("shell_exec");
  });

  it("PlannerAgent creates plan handoff", async () => {
    const planner = new PlannerAgent({ provider: mockProvider });
    const handoff = await planner.process({
      from: "planner",
      to: "planner",
      summary: "Add auth middleware",
      action: "proceed",
    });

    expect(handoff.from).toBe("planner");
    expect(handoff.to).toBe("researcher");
    expect(handoff.action).toBe("proceed");
    expect(handoff.plan).toBeDefined();
  });

  it("ResearcherAgent creates research handoff", async () => {
    const researcher = new ResearcherAgent({ provider: mockProvider });
    const handoff = await researcher.process({
      from: "planner",
      to: "researcher",
      summary: "Plan: Inspect middleware.ts",
      action: "proceed",
    });

    expect(handoff.from).toBe("researcher");
    expect(handoff.to).toBe("coder");
    expect(handoff.research).toBeDefined();
  });

  it("CoderAgent implements changes handoff", async () => {
    const coder = new CoderAgent({ provider: mockProvider });
    const handoff = await coder.process({
      from: "researcher",
      to: "coder",
      summary: "Context: middleware.ts needs token check",
      action: "proceed",
    });

    expect(handoff.from).toBe("coder");
    expect(handoff.to).toBe("reviewer");
    expect(handoff.codeChanges).toBeDefined();
  });

  it("TesterAgent returns verification handoff", async () => {
    const tester = new TesterAgent({ provider: mockProvider });
    const handoff = await tester.process({
      from: "reviewer",
      to: "tester",
      summary: "Code reviewed. Run tests.",
      action: "proceed",
    });

    expect(handoff.from).toBe("tester");
    expect(handoff.to).toBe("user");
    expect(handoff.testResults).toBeDefined();
  });
});
