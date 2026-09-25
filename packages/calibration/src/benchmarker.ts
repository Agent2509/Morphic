import type { ModelBenchmark, CloudBenchmark } from "./types.js";
import { OllamaProvider } from "@morphic/providers";

export interface BenchmarkProgress {
  stage: "ollama_discovery" | "model_bench" | "cloud_bench" | "done";
  model?: string;
  message: string;
  progressPct: number;
}

export class ModelBenchmarker {
  async benchmarkLocalModel(
    provider: OllamaProvider,
    modelName: string,
    quick: boolean = false
  ): Promise<ModelBenchmark> {
    const prompt = quick
      ? "Write 1 line of TS: const add = (a: number, b: number) => a + b;"
      : "Write a TypeScript function reverseArray<T>(items: T[]): T[] that returns reversed array.";

    const startTime = performance.now();
    let firstTokenTime = 0;
    let tokenCount = 0;
    let fullOutput = "";

    try {
      await provider.chatStream(
        [{ role: "user", content: prompt }],
        { model: modelName, maxTokens: quick ? 30 : 80 },
        (chunk) => {
          if (!firstTokenTime && chunk.content) {
            firstTokenTime = performance.now();
          }
          if (chunk.content) {
            fullOutput += chunk.content;
            // Approximate token count (~4 chars per token)
            tokenCount += Math.ceil(chunk.content.length / 4);
          }
        }
      );

      const endTime = performance.now();
      const coldStartSeconds = firstTokenTime
        ? Math.round(((firstTokenTime - startTime) / 1000) * 10) / 10
        : Math.round(((endTime - startTime) / 1000) * 10) / 10;

      const generationSeconds = Math.max(0.1, (endTime - (firstTokenTime || startTime)) / 1000);
      const throughputTps = Math.round((tokenCount / generationSeconds) * 10) / 10;

      // Basic quality check: did it write code?
      const hasCode = fullOutput.includes("function") || fullOutput.includes("const ") || fullOutput.includes("=>");
      const codeQualityScore = hasCode ? 0.85 : 0.5;

      return {
        sizeGb: modelName.includes("3b") ? 2.0 : modelName.includes("8b") || modelName.includes("llama3.1") ? 4.9 : 3.5,
        throughputTps: Math.max(1.0, throughputTps),
        coldStartSeconds,
        codeQualityScore,
        editFormatScore: 0.7,
        benchmarked: true,
      };
    } catch {
      // In case of error or timeout, return conservative defaults and mark them
      // as unmeasured so routing does not treat them as real benchmarks.
      return {
        sizeGb: 4.0,
        throughputTps: 8.0,
        coldStartSeconds: 5.0,
        codeQualityScore: 0.7,
        editFormatScore: 0.6,
        benchmarked: false,
      };
    }
  }

  async benchmarkCloud(apiKey?: string): Promise<CloudBenchmark> {
    const key = apiKey || process.env.DEEPSEEK_API_KEY;
    if (!key) {
      return { available: false, latencyMs: 0 };
    }

    const start = performance.now();
    try {
      const res = await fetch("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(4000),
      });
      const latencyMs = Math.round(performance.now() - start);
      return {
        available: res.ok,
        latencyMs,
      };
    } catch {
      return { available: false, latencyMs: 0 };
    }
  }

  async runSuite(
    ollamaProvider: OllamaProvider,
    onProgress?: (progress: BenchmarkProgress) => void,
    quick: boolean = false
  ): Promise<{
    models: Record<string, ModelBenchmark>;
    cloud: { deepseek?: CloudBenchmark };
  }> {
    onProgress?.({
      stage: "ollama_discovery",
      message: "Checking local Ollama models...",
      progressPct: 15,
    });

    const modelsList = await ollamaProvider.listModels();
    const modelBenchmarks: Record<string, ModelBenchmark> = {};

    const targetModels = modelsList.map((m) => m.name);
    // Focus on 2 models max to keep calibration under 15-20s
    const benchList = targetModels.slice(0, 2);

    for (let i = 0; i < benchList.length; i++) {
      const modelName = benchList[i];
      const pct = 20 + Math.round(((i + 1) / (benchList.length + 1)) * 60);

      onProgress?.({
        stage: "model_bench",
        model: modelName,
        message: `Benchmarking ${modelName}...`,
        progressPct: pct,
      });

      const bench = await this.benchmarkLocalModel(ollamaProvider, modelName, quick);
      modelBenchmarks[modelName] = bench;
    }

    onProgress?.({
      stage: "cloud_bench",
      message: "Testing cloud API connectivity...",
      progressPct: 90,
    });

    const cloudBench = await this.benchmarkCloud();

    onProgress?.({
      stage: "done",
      message: "Benchmark suite completed.",
      progressPct: 100,
    });

    return {
      models: modelBenchmarks,
      cloud: {
        deepseek: cloudBench,
      },
    };
  }
}
