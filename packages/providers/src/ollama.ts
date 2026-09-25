import { OpenAICompatProvider } from "./openai-compat.js";
import type { ModelInfo } from "./types.js";

export interface OllamaConfig {
  baseURL?: string;
  defaultModel?: string;
}

export class OllamaProvider extends OpenAICompatProvider {
  private nativeBaseURL: string;

  constructor(config: OllamaConfig = {}) {
    const baseURL = config.baseURL || "http://localhost:11434/v1";
    super({
      id: "ollama",
      name: "Ollama (Local)",
      baseURL,
      apiKey: "ollama",
      defaultModel: config.defaultModel || "llama3.1:latest",
    });
    this.nativeBaseURL = baseURL.replace(/\/v1\/?$/, "");
  }

  override async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.nativeBaseURL}/api/tags`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  override async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.nativeBaseURL}/api/tags`, { method: "GET" });
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: Array<{ name: string; size: number; details?: { family: string } }> };
      if (!data.models) return [];
      return data.models.map((m) => ({
        id: m.name,
        name: m.name,
        sizeBytes: m.size,
        family: m.details?.family,
      }));
    } catch {
      return super.listModels();
    }
  }
}
