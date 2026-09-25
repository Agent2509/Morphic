import { describe, expect, it } from "bun:test";
import { TierClassifier } from "../src/tier.js";
import { ModelRecommender } from "../src/recommender.js";
import type { HardwareSpecs } from "../src/types.js";

describe("TierClassifier & Recommender", () => {
  const classifier = new TierClassifier();
  const recommender = new ModelRecommender();

  const devMachineSpecs: HardwareSpecs = {
    cpu: {
      model: "Intel(R) Core(TM) i9-13900H",
      cores: 14,
      threads: 20,
      maxMhz: 5400,
      architecture: "x64",
    },
    ram: {
      totalGb: 31.1,
      availableGb: 21.4,
      swapGb: 16.0,
    },
    gpu: {
      type: "integrated",
      vendor: "intel",
      model: "Intel Iris Xe Graphics",
      vramGb: 0,
      cudaAvailable: false,
      rocmAvailable: false,
    },
    disk: {
      type: "nvme",
      freeGb: 513,
      totalGb: 612,
    },
    os: {
      platform: "linux",
      release: "7.2.5",
      distro: "Fedora Linux 44",
      containerRuntime: "podman",
    },
  };

  it("classifies dev machine (i9-13900H, 32GB RAM) as Tier 4 (Power)", () => {
    const result = classifier.classify(devMachineSpecs, ["fauma:3b", "llama3.1:latest"]);
    expect(result.tier).toBe("T4");
    expect(result.tierName).toBe("Power");
    expect(result.config.contextWindow).toBe(32768);
    expect(result.config.primaryLocalModel).toBe("llama3.1:latest");
  });

  it("classifies budget 8GB machine as Tier 2 (Light)", () => {
    const budgetSpecs: HardwareSpecs = {
      ...devMachineSpecs,
      cpu: { ...devMachineSpecs.cpu, cores: 4 },
      ram: { totalGb: 7.8, availableGb: 4.2, swapGb: 2.0 },
    };

    const result = classifier.classify(budgetSpecs, ["qwen2.5-coder:1.5b"]);
    expect(result.tier).toBe("T2");
    expect(result.tierName).toBe("Light");
    expect(result.config.contextWindow).toBe(8192);
  });

  it("classifies high-end NVIDIA GPU workstation as Tier 5 (Beast)", () => {
    const beastSpecs: HardwareSpecs = {
      ...devMachineSpecs,
      ram: { totalGb: 64, availableGb: 50, swapGb: 32 },
      gpu: {
        type: "discrete",
        vendor: "nvidia",
        model: "NVIDIA GeForce RTX 4090",
        vramGb: 24,
        cudaAvailable: true,
        rocmAvailable: false,
      },
    };

    const result = classifier.classify(beastSpecs, ["qwen2.5-coder:32b"]);
    expect(result.tier).toBe("T5");
    expect(result.tierName).toBe("Beast");
    expect(result.config.contextWindow).toBe(65536);
  });

  it("recommends appropriate models for T4 tier", () => {
    const rec = recommender.recommend("T4", devMachineSpecs);
    expect(rec.recommendedCodingModel).toBe("qwen2.5-coder:7b");
    expect(rec.pullCommand).toContain("ollama pull qwen2.5-coder:7b");
  });

  it("never routes to a model that is not installed", () => {
    const result = classifier.classify(devMachineSpecs, ["ayaanmed:latest"]);
    expect(result.config.primaryLocalModel).toBe("ayaanmed:latest");
    expect(result.config.fastLocalModel).toBe("ayaanmed:latest");
  });
});
