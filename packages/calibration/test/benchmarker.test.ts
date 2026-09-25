import { describe, expect, it } from "bun:test";
import { ModelBenchmarker } from "../src/benchmarker.js";

function fakeProvider(content: string) {
  return {
    chatStream: async (_messages: any, _options: any, onChunk: any) => {
      onChunk?.({ content });
      return { content, finish_reason: "stop", model: "fake" };
    },
  } as any;
}

describe("ModelBenchmarker", () => {
  it("records a real benchmark with measured size", async () => {
    const bench = await new ModelBenchmarker().benchmarkLocalModel(
      fakeProvider("export function f(){ return 1; }"),
      "qwen2.5-coder:7b",
      true,
      4_700_000_000
    );
    expect(bench.benchmarked).toBe(true);
    expect(bench.sizeEstimated).toBe(false);
    expect(bench.sizeGb).toBeCloseTo(4.7, 1);
    expect(bench.throughputTps).toBeGreaterThan(0);
  });

  it("marks size as estimated when the provider does not report it", async () => {
    const bench = await new ModelBenchmarker().benchmarkLocalModel(
      fakeProvider("const x = 1;"),
      "some-model",
      true
    );
    expect(bench.benchmarked).toBe(true);
    expect(bench.sizeEstimated).toBe(true);
  });

  it("marks failures as unbenchmarked instead of fabricating metrics", async () => {
    const failing = {
      chatStream: async () => {
        throw new Error("model crashed");
      },
    } as any;
    const bench = await new ModelBenchmarker().benchmarkLocalModel(failing, "broken", true);
    expect(bench.benchmarked).toBe(false);
  });
});
