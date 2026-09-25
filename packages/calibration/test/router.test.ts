import { describe, expect, it } from "bun:test";
import { SmartRouter } from "../src/router.js";
import type { HardwareProfile } from "../src/types.js";

describe("SmartRouter", () => {
  const normalThermal = {
    getStatus: async () => ({ tempCelsius: 45, status: "normal", throttleAction: "none" }),
  } as any;
  const acPower = {
    getStatus: async () => ({ onBattery: false, percent: 90, charging: true }),
  } as any;
  const router = new SmartRouter(normalThermal, acPower);

  const mockProfile: HardwareProfile = {
    version: "1.0",
    calibratedAt: new Date().toISOString(),
    tier: "T4",
    tierName: "Power",
    hardware: {
      cpu: { model: "i9", cores: 14, threads: 20, maxMhz: 5400, architecture: "x64" },
      ram: { totalGb: 32, availableGb: 22, swapGb: 16 },
      gpu: { type: "integrated", vendor: "intel", vramGb: 0, cudaAvailable: false, rocmAvailable: false },
      disk: { type: "nvme", freeGb: 500, totalGb: 600 },
      os: { platform: "linux", release: "7.0", distro: "Fedora" },
    },
    ollama: {
      installed: true,
      models: {
        "llama3.1:latest": { sizeGb: 4.9, throughputTps: 8.5, coldStartSeconds: 4.0 },
        "fauma:3b": { sizeGb: 2.0, throughputTps: 19.5, coldStartSeconds: 2.0 },
      },
    },
    cloudProviders: {
      deepseek: { available: true, latencyMs: 300 },
    },
    runtimeConfig: {
      primaryLocalModel: "llama3.1:latest",
      fastLocalModel: "fauma:3b",
      cloudFallbackModel: "deepseek-chat",
      contextWindow: 32768,
      maxOutputTokens: 4096,
      maxParallelTools: 8,
      routingThresholdComplexity: 5,
      preferCloudAboveComplexity: 7,
    },
  };

  it("classifies simple tasks with low complexity (1-3)", () => {
    expect(router.classifyComplexity("Fix typo in app.py")).toBeLessThanOrEqual(3);
    expect(router.classifyComplexity("Rename variable count to totalItems")).toBeLessThanOrEqual(3);
    expect(router.classifyComplexity("Explain what this function does")).toBeLessThanOrEqual(3);
  });

  it("classifies complex architectural tasks with high complexity (7-10)", () => {
    expect(
      router.classifyComplexity("Refactor the authentication architecture across multiple files to handle race conditions")
    ).toBeGreaterThanOrEqual(7);
  });

  it("routes simple tasks locally", async () => {
    const decision = await router.decideRoute("Fix typo in README.md", mockProfile);
    expect(decision.route).toBe("local");
    expect(decision.providerId).toBe("ollama");
  });

  it("routes complex tasks to cloud fallback", async () => {
    const decision = await router.decideRoute(
      "Refactor authentication across multiple files and redesign security layer to fix race conditions",
      mockProfile
    );
    expect(decision.route).toBe("cloud");
    expect(decision.providerId).toBe("deepseek");
  });

  it("falls back to local when cloud is forced but unavailable", async () => {
    const prev = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      const noCloud: HardwareProfile = {
        ...mockProfile,
        cloudProviders: { deepseek: { available: false, latencyMs: 0 } },
      };
      const decision = await router.decideRoute("Fix typo", noCloud, { forceCloud: true });
      expect(decision.route).toBe("local");
      expect(decision.providerId).toBe("ollama");
    } finally {
      if (prev !== undefined) process.env.DEEPSEEK_API_KEY = prev;
    }
  });

  it("uses cloud for T1 forced-local configurations without a local model", async () => {
    const prev = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
    try {
      const t1: HardwareProfile = {
        ...mockProfile,
        tier: "T1",
        tierName: "Ultra-Light",
        runtimeConfig: {
          ...mockProfile.runtimeConfig,
          primaryLocalModel: "none",
          fastLocalModel: "none",
        },
      };
      const decision = await router.decideRoute("Fix typo", t1, { forceLocal: true });
      expect(decision.route).toBe("cloud");
    } finally {
      if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = prev;
    }
  });
});
