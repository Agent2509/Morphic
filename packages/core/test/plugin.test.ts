import { describe, expect, it, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PluginLoader } from "../src/plugin/loader.js";
import { createDefaultToolRegistry } from "@morphic/tools";
import type { Tool } from "@morphic/tools";

describe("PluginLoader", () => {
  const tmpDirs: string[] = [];

  const createTempDir = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-plugin-test-"));
    tmpDirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    for (const d of tmpDirs) {
      await fs.rm(d, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("handles empty or non-existent plugin directory gracefully", async () => {
    const nonExistent = path.join(os.tmpdir(), `non-existent-${Date.now()}`);
    const loader = new PluginLoader(nonExistent);
    const registry = createDefaultToolRegistry();

    const loaded = await loader.loadPlugins(registry);
    expect(loaded).toEqual([]);
  });

  it("loads community plugins from directory and registers custom tools", async () => {
    const dir = await createTempDir();

    // Write a mock plugin file
    const pluginCode = `
      export default {
        name: "test-plugin",
        version: "1.0.0",
        tools: [
          {
            name: "echo_custom",
            description: "Custom plugin echo",
            category: "custom",
            parameters: {
              _def: { typeName: "ZodObject" },
              parse: (v) => v,
              safeParse: (v) => ({ success: true, data: v })
            },
            async execute(args) {
              return { success: true, output: "Plugin says: " + JSON.stringify(args) };
            }
          }
        ],
        register({ tools }) {
          // Can also register imperatively
        }
      };
    `;

    await fs.writeFile(path.join(dir, "my-plugin.ts"), pluginCode, "utf-8");

    const loader = new PluginLoader(dir);
    const registry = createDefaultToolRegistry();

    const loaded = await loader.loadPlugins(registry);
    expect(loaded).toContain("test-plugin");

    const customTool = registry.get("echo_custom");
    expect(customTool).toBeDefined();
    expect(customTool?.description).toBe("Custom plugin echo");

    const execResult = await customTool!.execute({ message: "hello" }, { cwd: dir });
    expect(execResult.success).toBe(true);
    expect(execResult.output).toContain("Plugin says:");
  });

  it("rejects plugins with invalid tool definitions", async () => {
    const dir = await createTempDir();
    const pluginCode = `
      export default {
        name: "bad-plugin",
        tools: [
          { name: "no_category", description: "x", async execute() {} }
        ]
      };
    `;
    await fs.writeFile(path.join(dir, "bad-plugin.ts"), pluginCode, "utf-8");

    const loader = new PluginLoader(dir);
    const registry = createDefaultToolRegistry();
    const loaded = await loader.loadPlugins(registry);

    expect(loaded).not.toContain("bad-plugin");
    expect(registry.get("no_category")).toBeUndefined();
  });

  it("ignores symlinked plugin files", async () => {
    const dir = await createTempDir();
    const outside = await createTempDir();
    const real = path.join(outside, "evil.ts");
    await fs.writeFile(real, "export default { name: 'evil' };", "utf-8");
    try {
      await fs.symlink(real, path.join(dir, "link.ts"));
    } catch {
      return; // symlinks unsupported
    }

    const loader = new PluginLoader(dir);
    const registry = createDefaultToolRegistry();
    expect(await loader.loadPlugins(registry)).toEqual([]);
  });
});
