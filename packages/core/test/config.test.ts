import { describe, expect, it, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigStore, DEFAULT_CONFIG } from "../src/config/config.js";

describe("ConfigStore", () => {
  const tmpDirs: string[] = [];

  const createTempDir = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-config-test-"));
    tmpDirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    for (const d of tmpDirs) {
      await fs.rm(d, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("returns default config when file does not exist", async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, "config.json");
    const store = new ConfigStore(configPath);

    expect(await store.exists()).toBe(false);
    expect(await store.isSetupCompleted()).toBe(false);

    const cfg = await store.load();
    expect(cfg.theme).toBe("cyberpunk");
    expect(cfg.provider).toBe("ollama");
    expect(cfg.setupCompleted).toBe(false);
  });

  it("saves and loads updated configuration with merged keys", async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, "config.json");
    const store = new ConfigStore(configPath);

    await store.save({
      theme: "ocean",
      provider: "deepseek",
      model: "deepseek-chat",
      apiKeys: {
        deepseek: "sk-test-12345",
      },
      setupCompleted: true,
    });

    expect(await store.exists()).toBe(true);
    expect(await store.isSetupCompleted()).toBe(true);

    const loaded = await store.load();
    expect(loaded.theme).toBe("ocean");
    expect(loaded.provider).toBe("deepseek");
    expect(loaded.model).toBe("deepseek-chat");
    expect(loaded.apiKeys.deepseek).toBe("sk-test-12345");
    expect(loaded.setupCompleted).toBe(true);
    // Unmodified defaults should remain
    expect(loaded.permissionLevel).toBe(DEFAULT_CONFIG.permissionLevel);
  });

  it("throws on corrupt config instead of silently wiping it", async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, "config.json");
    await fs.writeFile(configPath, "{not valid json", "utf-8");
    const store = new ConfigStore(configPath);
    await expect(store.load()).rejects.toThrow(/Corrupt config/);
  });

  it("coerces invalid field values to defaults", async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, "config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        theme: "nonsense",
        provider: "martian",
        model: 42,
        permissionLevel: 99,
        setupCompleted: "false",
        apiKeys: "not-an-object",
      }),
      "utf-8"
    );

    const store = new ConfigStore(configPath);
    const cfg = await store.load();
    expect(cfg.theme).toBe(DEFAULT_CONFIG.theme);
    expect(cfg.provider).toBe(DEFAULT_CONFIG.provider);
    expect(cfg.model).toBe(DEFAULT_CONFIG.model);
    expect(cfg.permissionLevel).toBe(DEFAULT_CONFIG.permissionLevel);
    expect(cfg.setupCompleted).toBe(false);
    expect(cfg.apiKeys).toEqual({
      deepseek: undefined,
      openai: undefined,
      anthropic: undefined,
    });
  });

  it("writes atomically with 0600 permissions and does not clobber keys", async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, "config.json");
    const store = new ConfigStore(configPath);

    await store.save({ apiKeys: { deepseek: "sk-secret" } });
    await store.save({ theme: "ocean" });

    const mode = (await fs.stat(configPath)).mode & 0o777;
    expect(mode).toBe(0o600);

    const cfg = await store.load();
    expect(cfg.theme).toBe("ocean");
    expect(cfg.apiKeys.deepseek).toBe("sk-secret");

    const leftovers = (await fs.readdir(dir)).filter((f) => f.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("does not share the default apiKeys object by reference", async () => {
    const dir = await createTempDir();
    const store = new ConfigStore(path.join(dir, "config.json"));
    const cfg = await store.load();
    cfg.apiKeys.deepseek = "mutated";
    expect(DEFAULT_CONFIG.apiKeys.deepseek).toBeUndefined();
  });
});
