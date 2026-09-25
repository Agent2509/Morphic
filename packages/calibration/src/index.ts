import { HardwareProfiler } from "./profiler.js";
import { ModelBenchmarker, type BenchmarkProgress } from "./benchmarker.js";
import { TierClassifier, TIER_NAMES } from "./tier.js";
import { ModelRecommender } from "./recommender.js";
import { ThermalMonitor } from "./thermal.js";
import { PowerManager } from "./power.js";
import { ProfileStore } from "./profile.js";
import { SmartRouter } from "./router.js";
import { OllamaProvider } from "@morphic/providers";
import type { HardwareProfile } from "./types.js";

export * from "./types.js";
export * from "./profiler.js";
export * from "./benchmarker.js";
export * from "./tier.js";
export * from "./recommender.js";
export * from "./thermal.js";
export * from "./power.js";
export * from "./profile.js";
export * from "./router.js";

export interface CalibrationOptions {
  projectDir?: string;
  quick?: boolean;
  onProgress?: (progress: BenchmarkProgress) => void;
  saveProjectProfile?: boolean;
}

export async function calibrateSystem(
  options: CalibrationOptions = {}
): Promise<HardwareProfile> {
  const projectDir = options.projectDir || process.cwd();
  const profiler = new HardwareProfiler();
  const benchmarker = new ModelBenchmarker();
  const tierClassifier = new TierClassifier();
  const powerManager = new PowerManager();
  const profileStore = new ProfileStore();
  const ollamaProvider = new OllamaProvider();

  // 1. Hardware Profiling
  options.onProgress?.({
    stage: "ollama_discovery",
    message: "Scanning CPU, RAM, GPU, disk, and operating system...",
    progressPct: 10,
  });
  const specs = await profiler.profileAll(projectDir);

  // 2. Ollama & Model Discovery
  const isOllamaRunning = await ollamaProvider.isAvailable();
  let modelBenchmarks: Record<string, any> = {};
  let cloudBenchmarks: Record<string, any> = {};
  let availableModelNames: string[] = [];

  if (isOllamaRunning) {
    const list = await ollamaProvider.listModels();
    availableModelNames = list.map((m) => m.name);

    // 3. Benchmarking
    const suite = await benchmarker.runSuite(
      ollamaProvider,
      options.onProgress,
      options.quick
    );
    modelBenchmarks = suite.models;
    cloudBenchmarks = suite.cloud;
  } else {
    options.onProgress?.({
      stage: "ollama_discovery",
      message: "Ollama not running locally; skipping inference benchmarks.",
      progressPct: 80,
    });
    const cloudBench = await benchmarker.benchmarkCloud();
    cloudBenchmarks = { deepseek: cloudBench };
  }

  // 4. Tier Classification
  const classification = tierClassifier.classify(specs, availableModelNames);

  // 5. Battery Adaptation
  const powerStatus = await powerManager.getStatus();
  const adaptedTier = powerManager.adaptTier(classification.tier, powerStatus);

  const profile: HardwareProfile = {
    version: "1.0",
    calibratedAt: new Date().toISOString(),
    tier: adaptedTier,
    tierName: TIER_NAMES[adaptedTier],
    hardware: specs,
    ollama: {
      installed: isOllamaRunning,
      models: modelBenchmarks,
    },
    cloudProviders: cloudBenchmarks,
    runtimeConfig: classification.config,
  };

  // 6. Save Profile
  await profileStore.save(profile, projectDir, {
    skipProject: options.saveProjectProfile === false,
  });

  const recommendation = new ModelRecommender().recommend(adaptedTier, specs);

  options.onProgress?.({
    stage: "done",
    message: `Calibration complete! Machine classified as ${profile.tier} (${profile.tierName}). Recommended: ${recommendation.pullCommand}`,
    progressPct: 100,
  });

  return profile;
}
