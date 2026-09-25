import { describe, expect, it } from "bun:test";
import { ModelRecommender } from "../src/recommender.js";
import { TierClassifier } from "../src/tier.js";
import type { HardwareSpecs } from "../src/types.js";

const baseSpecs: HardwareSpecs = {
  cpu: { model: "cpu", cores: 8, threads: 16, maxMhz: 4000, architecture: "x64" },
  ram: { totalGb: 32, availableGb: 24, swapGb: 8 },
  gpu: { type: "integrated", vendor: "intel", vramGb: 0, cudaAvailable: false, rocmAvailable: false },
  disk: { type: "nvme", freeGb: 500, totalGb: 600 },
  os: { platform: "linux", release: "1", distro: "Fedora" },
};

describe("ModelRecommender", () => {
  const recommender = new ModelRecommender();

  it("returns a recommendation for every tier", () => {
    for (const tier of ["T1", "T2", "T3", "T4", "T5"] as const) {
      const rec = recommender.recommend(tier, baseSpecs);
      expect(rec.recommendedCodingModel).toBeTruthy();
      expect(rec.rationale).toBeTruthy();
      expect(typeof rec.pullCommand).toBe("string");
    }
  });
});

describe("TierClassifier coverage", () => {
  const classifier = new TierClassifier();

  it("classifies T1 for tiny machines", () => {
    const result = classifier.classify({
      ...baseSpecs,
      cpu: { ...baseSpecs.cpu, cores: 1 },
      ram: { totalGb: 2, availableGb: 1, swapGb: 0 },
    });
    expect(result.tier).toBe("T1");
    expect(result.config.primaryLocalModel).toBe("none");
  });

  it("classifies T3 for mid-range machines", () => {
    const result = classifier.classify(
      {
        ...baseSpecs,
        cpu: { ...baseSpecs.cpu, cores: 4 },
        ram: { totalGb: 16, availableGb: 10, swapGb: 4 },
      },
      ["fauma:3b", "qwen2.5-coder:3b"]
    );
    expect(result.tier).toBe("T3");
    expect(result.config.primaryLocalModel).toBe("qwen2.5-coder:3b");
  });

  it("classifies T5 and picks the largest installed coder model", () => {
    const result = classifier.classify(
      {
        ...baseSpecs,
        ram: { totalGb: 64, availableGb: 60, swapGb: 16 },
      },
      ["qwen2.5-coder:7b", "qwen2.5-coder:14b"]
    );
    expect(result.tier).toBe("T5");
    expect(result.config.primaryLocalModel).toBe("qwen2.5-coder:14b");
  });
});
