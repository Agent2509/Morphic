import OpenAI from "openai";
import type {
  ChatMessage,
  CompletionChunk,
  CompletionOptions,
  CompletionResult,
  ModelInfo,
  ModelProvider,
  ToolCall,
} from "./types.js";

export interface OpenAICompatConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
  defaultModel: string;
}

export class OpenAICompatProvider implements ModelProvider {
  public readonly id: string;
  public readonly name: string;
  protected client: OpenAI;
  public defaultModel: string;

  constructor(config: OpenAICompatConfig) {
    this.id = config.id;
    this.name = config.name;
    this.defaultModel = config.defaultModel;
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey || "dummy-key-for-local",
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.client.models.list();
      return response.data.map((m) => ({
        id: m.id,
        name: m.id,
      }));
    } catch (err) {
      return [];
    }
  }

  async chat(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    const tools = options?.tools && options.tools.length > 0 ? options.tools : undefined;

    const response = await this.client.chat.completions.create({
      model,
      messages: messages as any,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens,
      tools: tools as any,
      stream: false,
    }, { signal: options?.signal });

    const choice = response.choices?.[0];
    if (!choice) {
      return {
        content: "",
        finish_reason: "stop",
        model: response.model,
      };
    }
    const message = choice.message;

    const toolCalls: ToolCall[] | undefined = message.tool_calls?.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    return {
      content: message.content || "",
      tool_calls: toolCalls,
      finish_reason: choice.finish_reason || (toolCalls && toolCalls.length > 0 ? "tool_calls" : "stop"),
      model: response.model,
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async chatStream(
    messages: ChatMessage[],
    options?: CompletionOptions,
    onChunk?: (chunk: CompletionChunk) => void
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    const tools = options?.tools && options.tools.length > 0 ? options.tools : undefined;

    const stream = await this.client.chat.completions.create({
      model,
      messages: messages as any,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens,
      tools: tools as any,
      stream: true,
      stream_options: { include_usage: true },
    }, { signal: options?.signal });

    let fullContent = "";
    let finishReason = "stop";
    let modelName = model;
    let callIdCounter = 0;
    let usage: CompletionResult["usage"];
    let fallbackIdx = 0;
    const accumulatedTools: Record<
      number,
      { id: string; name: string; arguments: string }
    > = {};

    const findIndexById = (id: string): number | undefined => {
      for (const [key, value] of Object.entries(accumulatedTools)) {
        if (value.id === id) return Number(key);
      }
      return undefined;
    };

    try {
      for await (const chunk of stream) {
        if (chunk.model) modelName = chunk.model;
        if ((chunk as any).usage) {
          const u = (chunk as any).usage;
          usage = {
            prompt_tokens: u.prompt_tokens,
            completion_tokens: u.completion_tokens,
            total_tokens: u.total_tokens,
          };
        }
        const choice = chunk.choices[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta;
        const chunkData: CompletionChunk = {
          finish_reason: choice.finish_reason,
        };

        if (delta.content) {
          fullContent += delta.content;
          chunkData.content = delta.content;
        }

        if (delta.tool_calls && delta.tool_calls.length > 0) {
          chunkData.tool_calls = delta.tool_calls;
          for (const tc of delta.tool_calls) {
            let idx: number;
            if (typeof tc.index === "number") {
              idx = tc.index;
            } else if (tc.id) {
              idx = findIndexById(tc.id) ?? fallbackIdx++;
            } else {
              idx = fallbackIdx > 0 ? fallbackIdx - 1 : 0;
            }

            if (!accumulatedTools[idx]) {
              accumulatedTools[idx] = {
                id: tc.id || `call_${idx}_${++callIdCounter}`,
                name: tc.function?.name || "",
                arguments: tc.function?.arguments || "",
              };
            } else {
              if (tc.id) accumulatedTools[idx].id = tc.id;
              // Some providers resend the full name on every delta; only set once.
              if (tc.function?.name && !accumulatedTools[idx].name) {
                accumulatedTools[idx].name = tc.function.name;
              }
              const incoming = tc.function?.arguments;
              if (incoming) {
                const existing = accumulatedTools[idx].arguments;
                if (!existing || incoming.startsWith(existing)) {
                  // First delta or a provider resending the full argument string.
                  accumulatedTools[idx].arguments = incoming;
                } else if (incoming !== existing) {
                  accumulatedTools[idx].arguments += incoming;
                }
              }
            }
          }
        }

        if (onChunk) {
          onChunk(chunkData);
        }
      }
    } catch (err) {
      const controller = (stream as any).controller;
      if (controller && typeof controller.abort === "function") {
        try {
          controller.abort();
        } catch {
          // ignore
        }
      }
      throw err;
    }

    const toolCalls: ToolCall[] = Object.keys(accumulatedTools)
      .map(Number)
      .sort((a, b) => a - b)
      .map((idx) => ({
        id: accumulatedTools[idx].id,
        type: "function" as const,
        function: {
          name: accumulatedTools[idx].name,
          arguments: accumulatedTools[idx].arguments,
        },
      }));

    return {
      content: fullContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      finish_reason: finishReason,
      model: modelName,
      usage,
    };
  }
}
