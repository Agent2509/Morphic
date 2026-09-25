import { describe, expect, it } from "bun:test";
import { PipelineCoordinator } from "../src/coordinator.js";
import type { ModelProvider, ChatMessage } from "@morphic/providers";

describe("PipelineCoordinator", () => {
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
      const response = "[REVIEW_STATUS: APPROVED] [TEST_STATUS: PASSED] Code verified and working.";
      onChunk?.({ content: response });
      return {
        content: response,
        finish_reason: "stop",
        model: "mock-model",
      };
    },
  };

  it("scales pipeline roles adaptively based on complexity", () => {
    const coordinator = new PipelineCoordinator({ provider: mockProvider });

    // Simple (1-3) -> Coder only
    expect(coordinator.selectPipelineRoles(1)).toEqual(["coder"]);
    expect(coordinator.selectPipelineRoles(3)).toEqual(["coder"]);

    // Medium (4-6) -> Planner -> Coder -> Tester
    expect(coordinator.selectPipelineRoles(4)).toEqual(["planner", "coder", "tester"]);
    expect(coordinator.selectPipelineRoles(6)).toEqual(["planner", "coder", "tester"]);

    // Complex (7-10) -> All 5 agents
    expect(coordinator.selectPipelineRoles(7)).toEqual([
      "planner",
      "researcher",
      "coder",
      "reviewer",
      "tester",
    ]);
    expect(coordinator.selectPipelineRoles(10)).toEqual([
      "planner",
      "researcher",
      "coder",
      "reviewer",
      "tester",
    ]);
  });

  it("executes multi-agent pipeline and records stage progression", async () => {
    const coordinator = new PipelineCoordinator({ provider: mockProvider });
    const startedRoles: string[] = [];
    const finishedRoles: string[] = [];

    const result = await coordinator.run("Refactor database connections", 8, {
      onAgentStart: (role) => startedRoles.push(role),
      onAgentFinish: (role) => finishedRoles.push(role),
    });

    expect(result).toBeTruthy();
    expect(startedRoles).toEqual([
      "planner",
      "researcher",
      "coder",
      "reviewer",
      "tester",
    ]);
    expect(finishedRoles).toEqual([
      "planner",
      "researcher",
      "coder",
      "reviewer",
      "tester",
    ]);
  });

  it("handles retry loop when reviewer rejects initial changes", async () => {
    let reviewCount = 0;

    const retryMockProvider: ModelProvider = {
      id: "retry-mock",
      name: "Retry Mock Provider",
      async isAvailable() {
        return true;
      },
      async listModels() {
        return [{ id: "mock", name: "Mock" }];
      },
      async chat() {
        throw new Error("not used");
      },
      async chatStream(messages: ChatMessage[]) {
        const sysPrompt = messages.find((m) => m.role === "system")?.content || "";
        let content = "Default response";

        if (sysPrompt.includes("Reviewer Agent")) {
          reviewCount++;
          if (reviewCount === 1) {
            content = "[REVIEW_STATUS: REJECTED] Critical syntax error on line 42";
          } else {
            content = "[REVIEW_STATUS: APPROVED] Code looks great now.";
          }
        } else if (sysPrompt.includes("Tester Agent")) {
          content = "[TEST_STATUS: PASSED] All tests green.";
        }

        return {
          content,
          finish_reason: "stop",
          model: "mock",
        };
      },
    };

    const coordinator = new PipelineCoordinator({
      provider: retryMockProvider,
      maxRetries: 2,
    });

    let retryTriggered = false;
    await coordinator.run("Fix authentication bug", 8, {
      onRetry: (role, reason, count) => {
        retryTriggered = true;
        expect(role).toBe("reviewer");
        expect(count).toBe(1);
      },
    });

    expect(retryTriggered).toBe(true);
    expect(reviewCount).toBe(2);
  });

  it("returns a failed outcome and emits onError when an agent throws", async () => {
    const throwingProvider: ModelProvider = {
      id: "boom",
      name: "Boom",
      async isAvailable() {
        return true;
      },
      async listModels() {
        return [];
      },
      async chat() {
        throw new Error("not used");
      },
      async chatStream() {
        throw new Error("provider exploded");
      },
    };

    const coordinator = new PipelineCoordinator({ provider: throwingProvider });
    let errored: Error | null = null;
    const outcome = await coordinator.run("do something", 5, {
      onError: (e) => {
        errored = e;
      },
    });

    expect(outcome.success).toBe(false);
    expect(outcome.failedRole).toBeDefined();
    expect(errored).not.toBeNull();
  });
});
