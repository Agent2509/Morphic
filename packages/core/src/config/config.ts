import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { MorphicError } from "@morphic/shared";

export type ThemeName = "cyberpunk" | "minimal" | "ocean" | "sunset";

const THEMES: readonly ThemeName[] = ["cyberpunk", "minimal", "ocean", "sunset"];
const PROVIDERS = ["ollama", "deepseek", "openai", "anthropic"] as const;
type ProviderName = (typeof PROVIDERS)[number];

export interface MorphicConfig {
  version: string;
  theme: ThemeName;
  provider: ProviderName;
  model: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  permissionLevel: number;
  apiKeys: {
    deepseek?: string;
    openai?: string;
    anthropic?: string;
  };
  setupCompleted: boolean;
}

export const DEFAULT_CONFIG: MorphicConfig = {
  version: "1.0",
  theme: "cyberpunk",
  provider: "ollama",
  model: "qwen2.5-coder:7b",
  permissionLevel: 2,
  apiKeys: {},
  setupCompleted: false,
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function coerceConfig(value: unknown): MorphicConfig {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  const theme = THEMES.includes(raw.theme as ThemeName)
    ? (raw.theme as ThemeName)
    : DEFAULT_CONFIG.theme;
  const provider = (PROVIDERS as readonly string[]).includes(raw.provider as string)
    ? (raw.provider as ProviderName)
    : DEFAULT_CONFIG.provider;
  const permissionLevel =
    typeof raw.permissionLevel === "number" &&
    Number.isInteger(raw.permissionLevel) &&
    raw.permissionLevel >= 1 &&
    raw.permissionLevel <= 4
      ? raw.permissionLevel
      : DEFAULT_CONFIG.permissionLevel;

  const apiKeysRaw =
    raw.apiKeys && typeof raw.apiKeys === "object"
      ? (raw.apiKeys as Record<string, unknown>)
      : {};

  return {
    version: asString(raw.version) ?? DEFAULT_CONFIG.version,
    theme,
    provider,
    model: asString(raw.model) ?? DEFAULT_CONFIG.model,
    fallbackProvider: asString(raw.fallbackProvider),
    fallbackModel: asString(raw.fallbackModel),
    permissionLevel,
    apiKeys: {
      deepseek: asString(apiKeysRaw.deepseek),
      openai: asString(apiKeysRaw.openai),
      anthropic: asString(apiKeysRaw.anthropic),
    },
    setupCompleted: raw.setupCompleted === true,
  };
}

export class ConfigStore {
  constructor(private customPath?: string) {}

  getConfigPath(): string {
    return this.customPath || path.join(os.homedir(), ".morphic", "config.json");
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.getConfigPath());
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<MorphicConfig> {
    let data: string;
    try {
      data = await fs.readFile(this.getConfigPath(), "utf-8");
    } catch (err: any) {
      if (err?.code === "ENOENT") return structuredClone(DEFAULT_CONFIG);
      throw new MorphicError(
        `Unable to read config: ${err?.message || err}`,
        "CONFIG_READ_ERROR"
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err: any) {
      throw new MorphicError(
        `Corrupt config at ${this.getConfigPath()}: ${err?.message || err}`,
        "CONFIG_CORRUPT"
      );
    }

    return coerceConfig(parsed);
  }

  async save(updates: Partial<MorphicConfig>): Promise<string> {
    const current = await this.load();
    const updated = coerceConfig({
      ...current,
      ...updates,
      apiKeys: {
        ...current.apiKeys,
        ...(updates.apiKeys || {}),
      },
    });

    const targetPath = this.getConfigPath();
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Atomic write: temp file + rename, then lock down permissions.
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(updated, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    await fs.rename(tmpPath, targetPath);
    try {
      await fs.chmod(targetPath, 0o600);
    } catch {
      // best effort (e.g. unsupported filesystem)
    }

    return targetPath;
  }

  async isSetupCompleted(): Promise<boolean> {
    const cfg = await this.load();
    return cfg.setupCompleted;
  }
}
