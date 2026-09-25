import type {
  HardwareSpecs,
  HardwareTier,
  HardwareTierName,
  RuntimeConfig,
} from "./types.js";

export interface TierClassification {
  tier: HardwareTier;
  tierName: HardwareTierName;
  config: RuntimeConfig;
  rationale: string;
}

export const TIER_NAMES: Record<HardwareTier, HardwareTierName> = {
  T1: "Ultra-Light",
  T2: "Light",
  T3: "Standard",
  T4: "Power",
  T5: "Beast",
};

export class TierClassifier {
  classify(specs: HardwareSpecs, availableModels: string[] = []): TierClassification {
    const { cpu, ram, gpu } = specs;

    // Check for T5 (Beast)
    if (
      (gpu.cudaAvailable && gpu.vramGb >= 8) ||
      (gpu.vendor === "apple" && gpu.vramGb >= 32) ||
      ram.totalGb >= 64
    ) {
      return {
        tier: "T5",
        tierName: "Beast",
        rationale: `High-end hardware detected (${ram.totalGb}GB RAM, ${gpu.vramGb}GB VRAM). Capable of running large 14B-32B local models with 64K+ context.`,
        config: {
          primaryLocalModel: this.pickModel(availableModels, ["qwen2.5-coder:32b", "qwen2.5-coder:14b", "llama3.1:latest"], "llama3.1:latest"),
          fastLocalModel: this.pickModel(availableModels, ["fauma:3b", "qwen2.5-coder:3b", "llama3.1:latest"], "fauma:3b"),
          cloudFallbackModel: "deepseek-chat",
          contextWindow: 65536,
          maxOutputTokens: 8192,
          maxParallelTools: 12,
          routingThresholdComplexity: 7,
          preferCloudAboveComplexity: 8,
        },
      };
    }

    // Check for T4 (Power) - e.g. dev machine (32GB RAM, 14 cores)
    if (ram.totalGb >= 24 && cpu.cores >= 8) {
      return {
        tier: "T4",
        tierName: "Power",
        rationale: `Power workstation/laptop detected (${ram.totalGb}GB RAM, ${cpu.cores} cores). Optimal for 7B-8B local models at 32K context with cloud fallback for complex tasks.`,
        config: {
          primaryLocalModel: this.pickModel(availableModels, ["qwen2.5-coder:7b", "llama3.1:latest", "llama3.1:8b"], "qwen2.5-coder:7b"),
          fastLocalModel: this.pickModel(availableModels, ["fauma:3b", "qwen2.5-coder:3b"], "fauma:3b"),
          cloudFallbackModel: "deepseek-chat",
          contextWindow: 32768,
          maxOutputTokens: 4096,
          maxParallelTools: 8,
          routingThresholdComplexity: 5,
          preferCloudAboveComplexity: 7,
        },
      };
    }

    // Check for T3 (Standard)
    if (ram.totalGb >= 14 && cpu.cores >= 4) {
      return {
        tier: "T3",
        tierName: "Standard",
        rationale: `Standard machine detected (${ram.totalGb}GB RAM, ${cpu.cores} cores). Fast with 3B-7B models at 16K context.`,
        config: {
          primaryLocalModel: this.pickModel(availableModels, ["qwen2.5-coder:3b", "fauma:3b", "llama3.1:latest"], "fauma:3b"),
          fastLocalModel: this.pickModel(availableModels, ["fauma:3b", "qwen2.5-coder:1.5b"], "fauma:3b"),
          cloudFallbackModel: "deepseek-chat",
          contextWindow: 16384,
          maxOutputTokens: 4096,
          maxParallelTools: 4,
          routingThresholdComplexity: 4,
          preferCloudAboveComplexity: 6,
        },
      };
    }

    // Check for T2 (Light)
    if (ram.totalGb >= 6 && cpu.cores >= 2) {
      return {
        tier: "T2",
        tierName: "Light",
        rationale: `Lightweight machine (${ram.totalGb}GB RAM). Suited for 1B-2B models at 8K context.`,
        config: {
          primaryLocalModel: this.pickModel(availableModels, ["qwen2.5-coder:1.5b", "fauma:3b"], "fauma:3b"),
          fastLocalModel: this.pickModel(availableModels, ["qwen2.5-coder:0.5b", "fauma:3b"], "fauma:3b"),
          cloudFallbackModel: "deepseek-chat",
          contextWindow: 8192,
          maxOutputTokens: 2048,
          maxParallelTools: 2,
          routingThresholdComplexity: 3,
          preferCloudAboveComplexity: 5,
        },
      };
    }

    // T1 (Ultra-Light)
    return {
      tier: "T1",
      tierName: "Ultra-Light",
      rationale: `Minimal resources (${ram.totalGb}GB RAM, ${cpu.cores} cores). Local inference disabled; cloud-first routing.`,
      config: {
        primaryLocalModel: "none",
        fastLocalModel: "none",
        cloudFallbackModel: "deepseek-chat",
        contextWindow: 4096,
        maxOutputTokens: 2048,
        maxParallelTools: 1,
        routingThresholdComplexity: 1,
        preferCloudAboveComplexity: 2,
      },
    };
  }

  private pickModel(available: string[], preferred: string[], fallback: string): string {
    // Exact matches only: never route to a model that is not installed.
    for (const pref of preferred) {
      if (available.includes(pref)) return pref;
    }
    if (available.length === 0) return "none";
    if (available.includes(fallback)) return fallback;
    return available[0];
  }
}
