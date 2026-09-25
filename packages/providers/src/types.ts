export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface CompletionChunk {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
  finish_reason?: string | null;
}

export interface CompletionResult {
  content: string;
  tool_calls?: ToolCall[];
  finish_reason: string;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  sizeBytes?: number;
  family?: string;
}

export interface ModelProvider {
  id: string;
  name: string;
  isAvailable(): Promise<boolean>;
  listModels(): Promise<ModelInfo[]>;
  chat(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
  chatStream(
    messages: ChatMessage[],
    options?: CompletionOptions,
    onChunk?: (chunk: CompletionChunk) => void
  ): Promise<CompletionResult>;
}
