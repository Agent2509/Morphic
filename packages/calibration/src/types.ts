export type HardwareTier = "T1" | "T2" | "T3" | "T4" | "T5";
export type HardwareTierName =
  | "Ultra-Light"
  | "Light"
  | "Standard"
  | "Power"
  | "Beast";

export interface CPUSpec {
  model: string;
  cores: number;
  threads: number;
  maxMhz: number;
  architecture: string;
}

export interface RAMSpec {
  totalGb: number;
  availableGb: number;
  swapGb: number;
}

export interface GPUSpec {
  type: "none" | "integrated" | "discrete";
  vendor: "nvidia" | "amd" | "intel" | "apple" | "none";
  model?: string;
  vramGb: number;
  cudaAvailable: boolean;
  rocmAvailable: boolean;
}

export interface DiskSpec {
  type: "nvme" | "ssd" | "hdd";
  freeGb: number;
  totalGb: number;
}

export interface OSSpec {
  platform: string;
  release: string;
  distro: string;
  containerRuntime?: string;
}

export interface HardwareSpecs {
  cpu: CPUSpec;
  ram: RAMSpec;
  gpu: GPUSpec;
  disk: DiskSpec;
  os: OSSpec;
}

export interface ModelBenchmark {
  sizeGb: number;
  throughputTps: number;
  coldStartSeconds: number;
  codeQualityScore?: number;
  editFormatScore?: number;
  benchmarked?: boolean;
  sizeEstimated?: boolean;
}

export interface CloudBenchmark {
  available: boolean;
  latencyMs: number;
}

export interface RuntimeConfig {
  primaryLocalModel: string;
  fastLocalModel: string;
  cloudFallbackModel: string;
  contextWindow: number;
  maxOutputTokens: number;
  maxParallelTools: number;
  routingThresholdComplexity: number;
  preferCloudAboveComplexity: number;
}

export interface HardwareProfile {
  version: string;
  calibratedAt: string;
  tier: HardwareTier;
  tierName: HardwareTierName;
  hardware: HardwareSpecs;
  ollama: {
    installed: boolean;
    version?: string;
    models: Record<string, ModelBenchmark>;
  };
  cloudProviders: {
    deepseek?: CloudBenchmark;
  };
  runtimeConfig: RuntimeConfig;
}

export interface ThermalStatus {
  tempCelsius: number;
  status: "normal" | "warm" | "hot" | "critical";
  throttleAction: "none" | "downgrade" | "reduce" | "pause";
}

export interface PowerStatus {
  onBattery: boolean;
  percent: number;
  charging: boolean;
}

export interface RoutingDecision {
  route: "local" | "cloud";
  model: string;
  providerId: string;
  complexity: number;
  reason: string;
}
