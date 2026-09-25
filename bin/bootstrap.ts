import { ConfigStore, DEFAULT_CONFIG, type MorphicConfig } from "@morphic/core";

export async function loadConfig(): Promise<MorphicConfig> {
  const store = new ConfigStore();
  try {
    return await store.load();
  } catch (err: any) {
    console.warn(`\n⚠️  ${err?.message || err}\n   Using default configuration.\n`);
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function applyApiKeysToEnv(config: MorphicConfig): void {
  if (config.apiKeys?.deepseek && !process.env.DEEPSEEK_API_KEY) {
    process.env.DEEPSEEK_API_KEY = config.apiKeys.deepseek;
  }
}
