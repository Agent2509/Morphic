import type { ModelProvider } from "./types.js";
import { OllamaProvider } from "./ollama.js";
import { DeepSeekProvider } from "./deepseek.js";

export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();
  private defaultProviderId = "ollama";

  constructor() {
    this.register(new OllamaProvider());
    this.register(new DeepSeekProvider());
  }

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  list(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  getDefault(): ModelProvider {
    const provider = this.providers.get(this.defaultProviderId);
    if (!provider) {
      const first = this.providers.values().next().value;
      if (!first) throw new Error("No providers registered in ProviderRegistry");
      return first;
    }
    return provider;
  }

  setDefault(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Provider '${id}' not found`);
    }
    this.defaultProviderId = id;
  }
}
