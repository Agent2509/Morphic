import type { HardwareSpecs, HardwareTier } from "./types.js";

export interface ModelRecommendation {
  recommendedCodingModel: string;
  recommendedFastModel: string;
  pullCommand: string;
  rationale: string;
}

export class ModelRecommender {
  recommend(tier: HardwareTier, specs: HardwareSpecs): ModelRecommendation {
    switch (tier) {
      case "T5":
        return {
          recommendedCodingModel: "qwen2.5-coder:32b",
          recommendedFastModel: "qwen2.5-coder:7b",
          pullCommand: "ollama pull qwen2.5-coder:32b",
          rationale: "Your machine has the GPU VRAM or system RAM to run near-cloud quality 32B models locally.",
        };

      case "T4":
        return {
          recommendedCodingModel: "qwen2.5-coder:7b",
          recommendedFastModel: "fauma:3b",
          pullCommand: "ollama pull qwen2.5-coder:7b",
          rationale: "With 32GB RAM and a high-core CPU, 7B models offer the highest coding accuracy at ~10 tok/s on CPU.",
        };

      case "T3":
        return {
          recommendedCodingModel: "qwen2.5-coder:3b",
          recommendedFastModel: "qwen2.5-coder:1.5b",
          pullCommand: "ollama pull qwen2.5-coder:3b",
          rationale: "3B models hit the sweet spot between ~20 tok/s speed and strong code generation on 16GB RAM machines.",
        };

      case "T2":
        return {
          recommendedCodingModel: "qwen2.5-coder:1.5b",
          recommendedFastModel: "qwen2.5-coder:0.5b",
          pullCommand: "ollama pull qwen2.5-coder:1.5b",
          rationale: "1.5B model provides lightweight local code assistance without exhausting 8GB RAM.",
        };

      case "T1":
      default:
        return {
          recommendedCodingModel: "none",
          recommendedFastModel: "none",
          pullCommand: "# Cloud models recommended for T1 machines",
          rationale: "System RAM is too constrained for reliable local model execution. Use cloud providers.",
        };
    }
  }
}
