import { OpenAICompatProvider } from "./openai-compat.js";

export interface DeepSeekConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

export class DeepSeekProvider extends OpenAICompatProvider {
  constructor(config: DeepSeekConfig = {}) {
    const apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY || "";
    super({
      id: "deepseek",
      name: "DeepSeek (Cloud)",
      baseURL: config.baseURL || "https://api.deepseek.com",
      apiKey,
      defaultModel: config.defaultModel || "deepseek-chat",
    });
  }

  override async isAvailable(): Promise<boolean> {
    if (!this.client.apiKey || this.client.apiKey === "dummy-key-for-local") {
      return false;
    }
    return super.isAvailable();
  }
}
