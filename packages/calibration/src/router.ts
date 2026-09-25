import type { HardwareProfile, RoutingDecision } from "./types.js";
import { ThermalMonitor } from "./thermal.js";
import { PowerManager } from "./power.js";

export class SmartRouter {
  private thermalMonitor: ThermalMonitor;
  private powerManager: PowerManager;

  constructor(thermal?: ThermalMonitor, power?: PowerManager) {
    this.thermalMonitor = thermal || new ThermalMonitor();
    this.powerManager = power || new PowerManager();
  }

  classifyComplexity(prompt: string, fileCount: number = 1): number {
    const text = prompt.toLowerCase();
    let score = 2; // base score

    // Keywords signaling high complexity
    const complexKeywords = [
      "refactor",
      "architecture",
      "redesign",
      "across files",
      "multiple files",
      "race condition",
      "concurrency",
      "deadlock",
      "security audit",
      "vulnerability",
      "migrate",
      "microservice",
      "system design",
      "standalone app",
      "full stack",
      "fullstack",
      "pipeline",
      "end-to-end",
      "end to end",
      "persistence",
      "database",
      "cli app",
    ];

    // Keywords signaling medium complexity
    const mediumKeywords = [
      "implement",
      "create feature",
      "write test",
      "unit test",
      "integration test",
      "error handling",
      "optimize",
      "benchmark",
      "debug",
      "fix bug",
      "todo app",
      "cli tool",
      "test script",
      "rest api",
      "endpoint",
      "server",
      "crud",
      "auth",
    ];

    // Keywords signaling simple tasks
    const simpleKeywords = [
      "rename",
      "typo",
      "docstring",
      "comment",
      "explain",
      "what does",
      "read",
      "print",
      "format",
    ];

    for (const kw of complexKeywords) {
      if (text.includes(kw)) score += 4;
    }

    for (const kw of mediumKeywords) {
      if (text.includes(kw)) score += 2;
    }

    for (const kw of simpleKeywords) {
      if (text.includes(kw)) score -= 1;
    }

    if (fileCount > 3) {
      score += 3;
    } else if (fileCount > 1) {
      score += 1;
    }

    // Long prompts usually contain complex requirements
    if (prompt.length > 500) score += 2;
    else if (prompt.length > 200) score += 1;

    return Math.min(10, Math.max(1, score));
  }

  isActionableTask(prompt: string): boolean {
    const text = prompt.toLowerCase();
    const actionWords = [
      "create",
      "write",
      "edit",
      "modify",
      "update",
      "build",
      "implement",
      "fix",
      "delete",
      "remove",
      "add",
      "generate",
      "refactor",
      "test",
      "run",
      "exec",
      "script",
      "todo",
    ];
    return actionWords.some((w) => {
      const regex = new RegExp(`\\b${w}\\b`, "i");
      return regex.test(text);
    });
  }

  async decideRoute(
    prompt: string,
    profile: HardwareProfile,
    options?: { forceLocal?: boolean; forceCloud?: boolean; fileCount?: number }
  ): Promise<RoutingDecision> {
    const complexity = this.classifyComplexity(prompt, options?.fileCount);
    const cloudAvailable =
      Boolean(process.env.DEEPSEEK_API_KEY) ||
      Boolean(profile.cloudProviders.deepseek?.available);
    const cloudModel = profile.runtimeConfig.cloudFallbackModel || "deepseek-chat";

    const cloudRoute = (reason: string): RoutingDecision => ({
      route: "cloud",
      providerId: "deepseek",
      model: cloudModel,
      complexity,
      reason,
    });

    const localRoute = (model: string | undefined, reason: string): RoutingDecision => {
      const effective = model && model.length > 0 ? model : "none";
      if ((effective === "none" || profile.ollama.installed === false) && cloudAvailable) {
        return cloudRoute(`${reason} (local model unavailable; using cloud)`);
      }
      return { route: "local", providerId: "ollama", model: effective, complexity, reason };
    };

    if (options?.forceCloud) {
      if (cloudAvailable) {
        return cloudRoute("User explicitly requested cloud model.");
      }
      return localRoute(
        profile.runtimeConfig.primaryLocalModel,
        "Cloud was requested but no cloud provider is configured; falling back to local."
      );
    }

    if (options?.forceLocal || !cloudAvailable) {
      const isActionable = this.isActionableTask(prompt);
      const model =
        complexity <= 2 && !isActionable && profile.runtimeConfig.fastLocalModel !== "none"
          ? profile.runtimeConfig.fastLocalModel
          : profile.runtimeConfig.primaryLocalModel;

      return localRoute(
        model,
        !cloudAvailable
          ? "Cloud provider not available or configured. Running locally on Ollama."
          : "User explicitly requested local model."
      );
    }

    const thermal = await this.thermalMonitor.getStatus();
    const power = await this.powerManager.getStatus();

    // Thermal throttling override: CPU too hot
    if (thermal.throttleAction === "pause" || thermal.throttleAction === "reduce") {
      return {
        route: "cloud",
        providerId: "deepseek",
        model: profile.runtimeConfig.cloudFallbackModel || "deepseek-chat",
        complexity,
        reason: `CPU temperature is high (${thermal.tempCelsius}°C, ${thermal.status}). Offloading to cloud to cool down.`,
      };
    }

    if (thermal.throttleAction === "downgrade") {
      return localRoute(
        profile.runtimeConfig.fastLocalModel,
        `CPU is warm (${thermal.tempCelsius}°C). Downgrading to the faster, lighter local model.`
      );
    }

    // Power saving override: low battery
    if (power.onBattery && power.percent < 25) {
      return {
        route: "cloud",
        providerId: "deepseek",
        model: profile.runtimeConfig.cloudFallbackModel || "deepseek-chat",
        complexity,
        reason: `Battery low (${power.percent}%). Routing to cloud to preserve battery life.`,
      };
    }

    // Complexity tier routing
    const simpleCutoff = Math.max(1, profile.runtimeConfig.routingThresholdComplexity - 2);
    if (complexity <= simpleCutoff) {
      const isActionable = this.isActionableTask(prompt);
      const model =
        !isActionable && profile.runtimeConfig.fastLocalModel !== "none"
          ? profile.runtimeConfig.fastLocalModel
          : profile.runtimeConfig.primaryLocalModel;
      return localRoute(
        model,
        `Simple task (Complexity ${complexity}/10). Local model is fast and free.`
      );
    }

    if (complexity >= profile.runtimeConfig.preferCloudAboveComplexity) {
      return {
        route: "cloud",
        providerId: "deepseek",
        model: profile.runtimeConfig.cloudFallbackModel || "deepseek-chat",
        complexity,
        reason: `Complex task (Complexity ${complexity}/10). Offloaded to cloud for superior reasoning and accuracy.`,
      };
    }

    // Medium complexity (4-6): Decision Matrix
    let cloudScore = 0;
    const primaryBench = profile.ollama.models[profile.runtimeConfig.primaryLocalModel];
    const localTps = primaryBench?.benchmarked === false ? undefined : primaryBench?.throughputTps;
    if (localTps === undefined || localTps < 8) cloudScore += 2;
    if (power.onBattery) cloudScore += 1;
    if (thermal.tempCelsius > 75) cloudScore += 1;
    if (complexity >= 5) cloudScore += 1;

    if (cloudScore >= 3) {
      return {
        route: "cloud",
        providerId: "deepseek",
        model: profile.runtimeConfig.cloudFallbackModel || "deepseek-chat",
        complexity,
        reason: `Medium task (Complexity ${complexity}/10). Selected cloud based on system load and speed metrics.`,
      };
    }

    return localRoute(
      profile.runtimeConfig.primaryLocalModel,
      `Medium task (Complexity ${complexity}/10). Primary local model meets speed and quality criteria.`
    );
  }
}
