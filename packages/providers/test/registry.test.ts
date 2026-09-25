import { describe, expect, it } from "bun:test";
import { ProviderRegistry } from "../src/registry.js";

describe("ProviderRegistry", () => {
  it("registers ollama and deepseek", () => {
    const registry = new ProviderRegistry();
    expect(registry.get("ollama")?.id).toBe("ollama");
    expect(registry.get("deepseek")?.id).toBe("deepseek");
    expect(registry.list().length).toBeGreaterThanOrEqual(2);
  });

  it("returns undefined for unknown providers", () => {
    const registry = new ProviderRegistry();
    expect(registry.get("martian")).toBeUndefined();
  });

  it("supports default provider selection", () => {
    const registry = new ProviderRegistry();
    expect(registry.getDefault().id).toBe("ollama");
    registry.setDefault("deepseek");
    expect(registry.getDefault().id).toBe("deepseek");
    expect(() => registry.setDefault("nope")).toThrow();
  });
});
