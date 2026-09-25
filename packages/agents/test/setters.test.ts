import { describe, expect, it } from "bun:test";
import { CoderAgent } from "../src/roles/coder.js";
import { PipelineCoordinator } from "../src/coordinator.js";
import type { ModelProvider, ChatMessage } from "@morphic/providers";

const providerA: ModelProvider = {
  id: "a",
  name: "A",
  async isAvailable() {
    return true;
  },
  async listModels() {
    return [];
  },
  async chat() {
    throw new Error("not used");
  },
  async chatStream(_m: ChatMessage[]) {
    return { content: "ok", finish_reason: "stop", model: "a" };
  },
};

const providerB: ModelProvider = { ...providerA, id: "b", name: "B" };

describe("Agent configuration setters", () => {
  it("updates an individual agent's model and provider", () => {
    const coder = new CoderAgent({ provider: providerA, model: "first" });
    expect(coder.model).toBe("first");
    coder.setModel("second");
    expect(coder.model).toBe("second");
    expect(() => coder.setProvider(providerB)).not.toThrow();
  });

  it("updates models per role and swaps the coordinator provider", () => {
    const coordinator = new PipelineCoordinator({
      provider: providerA,
      models: { coder: "c", planner: "p" },
    });
    expect(() => coordinator.setModelForRole("coder", "c2")).not.toThrow();
    expect(() => coordinator.setModelForRole("tester", "t2")).not.toThrow();
    expect(() => coordinator.setProvider(providerB)).not.toThrow();
  });
});
