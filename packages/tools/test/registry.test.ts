import { describe, expect, it } from "bun:test";
import { ToolRegistry } from "../src/registry.js";
import { createDefaultToolRegistry, readFileTool } from "../src/index.js";

const ctx = { cwd: process.cwd() };

describe("ToolRegistry", () => {
  it("reports unknown tools with available names", async () => {
    const registry = createDefaultToolRegistry();
    const res = await registry.execute("nope", {}, ctx);
    expect(res.success).toBe(false);
    expect(res.error).toContain("not found");
    expect(res.error).toContain("read_file");
  });

  it("returns a parse error for malformed argument JSON", async () => {
    const registry = createDefaultToolRegistry();
    const res = await registry.execute("read_file", "{not json", ctx);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Failed to parse");
  });

  it("returns a validation error for schema violations", async () => {
    const registry = createDefaultToolRegistry();
    const res = await registry.execute("read_file", {}, ctx);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Validation error");
  });

  it("overwrites duplicate registrations (last wins)", () => {
    const registry = new ToolRegistry();
    const a = { ...readFileTool, description: "first" };
    const b = { ...readFileTool, description: "second" };
    registry.register(a);
    registry.register(b);
    expect(registry.get("read_file")?.description).toBe("second");
    expect(registry.list()).toHaveLength(1);
  });

  it("serializes tools to OpenAI function schemas", () => {
    const registry = createDefaultToolRegistry();
    const tools = registry.toOpenAITools();
    expect(tools.length).toBeGreaterThan(0);
    const readTool = tools.find((t) => t.function.name === "read_file");
    expect(readTool?.type).toBe("function");
    expect(readTool?.function.parameters).toBeDefined();
    expect((readTool?.function.parameters as any).$schema).toBeUndefined();
  });
});
