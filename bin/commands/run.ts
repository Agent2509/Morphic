import type { Command } from "commander";
import * as os from "node:os";
import { isGitRepo, resolveStartupPaths } from "../startup.js";
import { loadConfig, applyApiKeysToEnv } from "../bootstrap.js";
import { ProviderRegistry } from "@morphic/providers";
import { createDefaultToolRegistry } from "@morphic/tools";
import {
  AgentController,
  ConfigStore,
  PermissionEngine,
  PermissionLevel,
  PluginLoader,
  type MorphicConfig,
} from "@morphic/core";
import {
  ProfileStore,
  SmartRouter,
  calibrateSystem,
  type HardwareProfile,
} from "@morphic/calibration";
import { PipelineCoordinator } from "@morphic/agents";
import {
  ShadowGit,
  SQLiteSessionStore,
  ProjectRulesParser,
} from "@morphic/memory";
import { McpConfigLoader, MorphicMcpClient } from "@morphic/mcp";
import { TelemetryReporter } from "@morphic/safety";
import { startUI, startSetupWizard } from "@morphic/ui";

export function registerRunCommand(program: Command): void {
  program
    .option("-m, --model <name>", "Model identifier to use")
    .option("-p, --provider <name>", "LLM provider ('ollama' or 'deepseek')")
    .option("-l, --permission-level <level>", "Permission level: 1 (Strict), 2 (Standard), 3 (Relaxed), 4 (Auto)")
    .option("--auto", "Shortcut for Permission Level 4 (Auto-approve)")
    .option("--single-agent", "Disable 5-agent pipeline and run single agent only")
    .option("--calibrate", "Force calibration before launching")
    .option("--setup", "Force interactive setup wizard before launching")
    .option("--sandbox", "Execute shell commands inside isolated Podman rootless container", false)
    .argument("[prompt...]", "Initial prompt to execute")
    .action(async (promptParts, options) => {
      const initialPrompt = promptParts.length > 0 ? promptParts.join(" ") : undefined;

      const configStore = new ConfigStore();
      let config: MorphicConfig = await loadConfig();
      const isSetupDone = config.setupCompleted;

      // Launch setup wizard if first-time run or requested via --setup
      if ((!isSetupDone || options.setup) && process.stdin.isTTY && !initialPrompt) {
        const wizard = startSetupWizard({
          onComplete: () => {
            wizard.unmount();
          },
          onExit: () => {
            wizard.unmount();
            process.exit(0);
          },
        });
        await wizard.waitUntilExit();
      }

      // Reload in case the setup wizard just wrote a new config.
      config = await loadConfig();
      applyApiKeysToEnv(config);

      const profileStore = new ProfileStore();
      let profile: HardwareProfile | null = await profileStore.load();
      const inGit = isGitRepo(process.cwd());
      const startupPaths = resolveStartupPaths(process.cwd(), os.homedir(), inGit);

      if (options.calibrate) {
        // Explicit --calibrate flag: always run full benchmark
        console.log("\n🔧 Calibration requested. Running full hardware benchmark...\n");
        profile = await calibrateSystem({
          quick: true,
          saveProjectProfile: startupPaths.writeProjectProfile,
          onProgress: (p) => {
            console.log(`[${p.progressPct}%] ${p.message}`);
          },
        });
        console.log(`\n✔ Classified as ${profile.tier} (${profile.tierName})\n`);
      } else if (!profile) {
        // No profile anywhere (neither project nor global): first-ever run
        console.log("\n🔧 First launch detected — no hardware profile found. Running auto-calibration...\n");
        profile = await calibrateSystem({
          quick: true,
          saveProjectProfile: startupPaths.writeProjectProfile,
          onProgress: (p) => {
            console.log(`[${p.progressPct}%] ${p.message}`);
          },
        });
        console.log(`\n✔ Classified as ${profile.tier} (${profile.tierName})\n`);
      } else if (startupPaths.writeProjectProfile) {
        // Profile loaded (possibly from global). Ensure a project-local copy exists
        // so per-project overrides are possible, without re-benchmarking.
        const hasProjectProfile = await profileStore.hasProjectProfile(process.cwd());
        if (!hasProjectProfile) {
          try {
            await profileStore.save(profile, process.cwd());
          } catch {
            // non-fatal: project dir might be read-only
          }
        }
      }

      // Honor the wizard's chosen cloud fallback model.
      if (profile && config.fallbackModel && config.fallbackProvider === "deepseek") {
        profile.runtimeConfig.cloudFallbackModel = config.fallbackModel;
      }

      const chosenProvider = options.provider || config.provider || "ollama";      const providerRegistry = new ProviderRegistry();
      const provider = providerRegistry.get(chosenProvider);

      if (!provider) {
        console.error(`Error: Provider '${chosenProvider}' not recognized. Available: ollama, deepseek`);
        process.exit(1);
      }

      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        if (chosenProvider === "ollama") {
          console.warn("\n⚠️  Warning: Ollama does not seem to be running on http://localhost:11434.");
          console.warn("   Run 'ollama serve' in another terminal if local requests fail.\n");
        } else if (chosenProvider === "deepseek") {
          console.warn("\n⚠️  Warning: DEEPSEEK_API_KEY is not set or invalid.\n");
        }
      }

      let permLevel = options.permissionLevel
        ? parseInt(options.permissionLevel, 10)
        : config.permissionLevel || PermissionLevel.Standard;
      if (options.auto) {
        permLevel = PermissionLevel.Auto;
      } else if (isNaN(permLevel) || permLevel < 1 || permLevel > 4) {
        permLevel = PermissionLevel.Standard;
      }

      const permissionEngine = new PermissionEngine(permLevel);
      const toolRegistry = createDefaultToolRegistry();

      // ACP/plugins/MCP execute workspace-controlled code, so they are opt-in.
      const trusted = process.env.MORPHIC_TRUST_WORKSPACE === "1";

      // Load MCP tools if configured in .morphic/mcp.json
      const mcpLoader = new McpConfigLoader();
      const mcpConfig = await mcpLoader.loadConfig(process.cwd());
      const mcpClients: MorphicMcpClient[] = [];

      if (trusted) {
        for (const [serverName, serverCfg] of Object.entries(mcpConfig.mcpServers)) {
          try {
            const client = new MorphicMcpClient(serverName, serverCfg);
            await client.connect();
            for (const t of client.toMorphicTools()) {
              toolRegistry.register(t);
            }
            mcpClients.push(client);
          } catch (err: any) {
            console.warn(`⚠️  Failed to connect to MCP server '${serverName}': ${err.message}`);
          }
        }
      } else if (Object.keys(mcpConfig.mcpServers).length > 0) {
        console.warn(
          "\n⚠️  MCP servers and workspace plugins are disabled. Set MORPHIC_TRUST_WORKSPACE=1 to enable them.\n"
        );
      }

      // Load custom plugins from .morphic/plugins/
      if (trusted) {
        const pluginLoader = new PluginLoader();
        await pluginLoader.loadPlugins(toolRegistry);
      }

      let selectedModel =
        options.model ||
        config.model ||
        profile?.runtimeConfig?.primaryLocalModel ||
        (provider as any).defaultModel ||
        "llama3.1:latest";

      // Never route to a model that is not actually installed locally.
      if (provider.id === "ollama") {
        try {
          const models = await provider.listModels();
          const installed = models.map((m) => m.id).filter(Boolean);
          if (installed.length > 0 && !installed.includes(selectedModel)) {
            console.warn(
              `\n⚠️  Model '${selectedModel}' is not installed. Falling back to '${installed[0]}'.\n`
            );
            selectedModel = installed[0];
          }
        } catch {
          // ignore; provider will error later if unusable
        }
      }

      const controller = new AgentController({
        provider,
        tools: toolRegistry,
        permissions: permissionEngine,
        model: selectedModel,
        cwd: process.cwd(),
        sandbox: Boolean(options.sandbox),
      });

      // Shadow Git snapshot engine for atomic rollback (git repos only)
      const shadowGit = startupPaths.shadowGitDir
        ? new ShadowGit(startupPaths.shadowGitDir)
        : null;
      if (shadowGit) {
        await shadowGit.init();
        await shadowGit.snapshot("Pre-turn baseline");
      }

      // Load Project Rules (PROJECT.md, CLAUDE.md, MORPHIC.md)
      const rulesParser = new ProjectRulesParser();
      const rules = await rulesParser.loadRules(process.cwd());
      if (rules && rules.rules.length > 0) {
        const rulesSnippet = rulesParser.toContextSnippet(rules);
        const basePrompt = controller.getContext().getMessages()[0]?.content || "";
        controller.getContext().setSystemPrompt(`${basePrompt}\n\n${rulesSnippet}`);
      }

      // Initialize SQLite Session Store (project-local in git repos, global otherwise)
      const sessionStore = new SQLiteSessionStore(startupPaths.sessionDbPath);
      await sessionStore.saveSession({
        id: `sess_${Date.now()}`,
        title: initialPrompt ? initialPrompt.slice(0, 50) : "Interactive Session",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tier: profile?.tier || "T4",
        provider: provider.name,
        model: selectedModel,
      });

      // Telemetry recorder (opt-in)
      const telemetry = new TelemetryReporter(process.cwd(), false);
      await telemetry.record({
        event: "session_start",
        tier: profile?.tier,
        primaryModel: selectedModel,
        os: profile?.hardware.os.platform,
        cpuCores: profile?.hardware.cpu.cores,
        ramGb: profile?.hardware.ram.totalGb,
      });

      const coordinator = options.singleAgent
        ? undefined
        : new PipelineCoordinator({
            provider,
            permissions: permissionEngine,
            cwd: process.cwd(),
            sandbox: Boolean(options.sandbox),
            models: {
              planner: selectedModel,
              researcher: selectedModel,
              coder: selectedModel,
              reviewer: selectedModel,
              tester: selectedModel,
            },
          });

      const smartRouter = new SmartRouter();
      const tierBadge = profile ? `${profile.tier} ${profile.tierName}` : undefined;

      let exiting = false;
      let appInstance: ReturnType<typeof startUI> | null = null;

      const cleanup = (code = 0) => {
        if (exiting) return;
        exiting = true;
        for (const client of mcpClients) {
          try {
            client.close();
          } catch {
            // ignore
          }
        }
        try {
          sessionStore.close();
        } catch {
          // ignore
        }
        try {
          appInstance?.unmount();
        } catch {
          // ignore
        }
        process.exit(code);
      };

      process.once("SIGINT", () => cleanup(0));
      process.once("SIGTERM", () => cleanup(0));

      // Non-interactive mode: no Ink TUI when stdin is not a TTY (pipes, CI, scripts).
      if (!process.stdin.isTTY) {
        let promptToRun = initialPrompt;
        if (!promptToRun) {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }
            const piped = Buffer.concat(chunks).toString("utf-8").trim();
            if (piped) {
              promptToRun = piped;
            }
          } catch {
            // ignore stdin read error
          }
        }

        if (!promptToRun) {
          console.error(
            "No prompt provided and stdin is not a TTY. Provide a prompt, e.g. morphic --auto \"...\""
          );
          cleanup(1);
          return;
        }

        try {
          if (coordinator) {
            const complexity = smartRouter.classifyComplexity(promptToRun);
            const outcome = await coordinator.run(promptToRun, complexity, {
              onToken: (token) => process.stdout.write(token),
              onAgentStart: (role) => process.stderr.write(`\n[agent:${role}]\n`),
              onStatusChange: (status) => process.stderr.write(`\n[${status}]\n`),
            });
            process.stdout.write("\n");
            cleanup(outcome.success ? 0 : 1);
          } else {
            await controller.run(promptToRun, {
              onToken: (token) => process.stdout.write(token),
              onToolStart: (_id, name) => process.stderr.write(`\n[tool:${name}] `),
              onStatusChange: (status) => process.stderr.write(`\n[${status}]\n`),
            });
            process.stdout.write("\n");
            cleanup(0);
          }
        } catch (err: any) {
          console.error(`\nError: ${err?.message || String(err)}`);
          cleanup(1);
        }
        return;
      }

      appInstance = startUI({
        controller,
        coordinator,
        providerName: provider.name,
        modelName: selectedModel,
        themeName: config.theme,
        tier: tierBadge,
        router: smartRouter,
        profile: profile || undefined,
        initialPrompt,
        providerResolver: (id: string) => providerRegistry.get(id),
        onUndo: async () =>
          shadowGit
            ? shadowGit.undo()
            : { success: false, message: "Not in a git repository; /undo is unavailable." },
        onExit: () => cleanup(0),
      });

      await appInstance.waitUntilExit();
      cleanup(0);
    });
}
