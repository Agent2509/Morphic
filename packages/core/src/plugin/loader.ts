import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ToolRegistry } from "@morphic/tools";
import type { Tool } from "@morphic/tools";
import { consoleLogger, type Logger } from "@morphic/shared";

export interface MorphicPlugin {
  name?: string;
  version?: string;
  tools?: Tool[];
  register?: (context: { tools: ToolRegistry }) => void | Promise<void>;
}

const VALID_CATEGORIES = new Set(["read", "edit", "exec", "custom"]);

function isValidTool(value: unknown): value is Tool {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, any>;
  return (
    typeof t.name === "string" &&
    t.name.length > 0 &&
    typeof t.description === "string" &&
    VALID_CATEGORIES.has(t.category) &&
    t.parameters &&
    typeof t.parameters.safeParse === "function" &&
    typeof t.execute === "function"
  );
}

export class PluginLoader {
  constructor(
    private pluginDir: string = path.join(process.cwd(), ".morphic", "plugins"),
    private logger: Logger = consoleLogger
  ) {}

  async loadPlugins(tools: ToolRegistry): Promise<string[]> {
    const loadedPluginNames: string[] = [];

    let entries;
    try {
      entries = await fs.readdir(this.pluginDir, { withFileTypes: true });
    } catch {
      return loadedPluginNames;
    }

    for (const entry of entries) {
      // Reject symlinks so plugins cannot point outside the plugin directory.
      if (!entry.isFile()) continue;
      if (!/\.(ts|js|mjs)$/.test(entry.name)) continue;

      const fullPath = path.join(this.pluginDir, entry.name);
      try {
        const mod = await import(fullPath);
        const plugin: MorphicPlugin = mod.default || mod;

        if (plugin.tools !== undefined && !Array.isArray(plugin.tools)) {
          throw new Error("plugin.tools must be an array");
        }
        for (const tool of plugin.tools || []) {
          if (!isValidTool(tool)) {
            throw new Error(`invalid tool definition: ${typeof tool}`);
          }
        }

        // Stage registrations so a failing plugin cannot leave partial state.
        const staging = new ToolRegistry();
        for (const tool of plugin.tools || []) {
          staging.register(tool);
        }
        if (typeof plugin.register === "function") {
          await plugin.register({ tools: staging });
        }

        for (const tool of staging.list()) {
          tools.register(tool);
        }

        loadedPluginNames.push(plugin.name || entry.name);
      } catch (err: any) {
        this.logger.warn(`[PluginLoader] Failed to load plugin ${entry.name}: ${err.message}`);
      }
    }

    return loadedPluginNames;
  }
}
