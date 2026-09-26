import type { ModelProvider, ToolCall } from "@morphic/providers";
import { type ToolRegistry, type ToolResult } from "@morphic/tools";
import { PermissionEngine } from "../permission/engine.js";
import { ContextManager } from "../context/manager.js";
import { parseToolCallsFromText, stripToolCallsFromText } from "./tool-call-parser.js";

export interface AgentEvents {
  onToken?: (token: string) => void;
  onToolStart?: (callId: string, name: string, args: any) => void;
  onToolFinish?: (callId: string, name: string, result: ToolResult) => void;
  onStatusChange?: (status: string) => void;
  onError?: (err: Error) => void;
}

export interface AgentControllerOptions {
  provider: ModelProvider;
  tools: ToolRegistry;
  permissions?: PermissionEngine;
  context?: ContextManager;
  cwd?: string;
  maxTurns?: number;
  model?: string;
  sandbox?: boolean;
  signal?: AbortSignal;
}

export class AgentController {
  private provider: ModelProvider;
  private tools: ToolRegistry;
  private permissions: PermissionEngine;
  private context: ContextManager;
  private cwd: string;
  private maxTurns: number;
  private model?: string;
  private sandbox: boolean;
  private signal?: AbortSignal;

  constructor(options: AgentControllerOptions) {
    this.provider = options.provider;
    this.tools = options.tools;
    this.permissions = options.permissions || new PermissionEngine();
    this.context = options.context || new ContextManager();
    this.cwd = options.cwd || process.cwd();
    this.maxTurns = options.maxTurns || 25;
    this.model = options.model;
    this.sandbox = options.sandbox ?? false;
    this.signal = options.signal;
  }

  setProvider(provider: ModelProvider): void {
    this.provider = provider;
  }

  setModel(model?: string): void {
    this.model = model;
  }

  setSignal(signal?: AbortSignal): void {
    this.signal = signal;
  }

  getContext(): ContextManager {
    return this.context;
  }

  getPermissions(): PermissionEngine {
    return this.permissions;
  }

  getTools(): ToolRegistry {
    return this.tools;
  }

  async run(prompt: string, events: AgentEvents = {}): Promise<string> {
    this.context.addUserMessage(prompt);
    events.onStatusChange?.("Thinking...");

    const openAiTools = this.tools.toOpenAITools();
    let turn = 0;

    while (turn < this.maxTurns) {
      turn++;
      let assistantResponse = "";

      try {
        let streamResult;
        try {
          streamResult = await this.provider.chatStream(
            this.context.getMessages(),
            {
              model: this.model,
              tools: openAiTools.length > 0 ? openAiTools : undefined,
              signal: this.signal,
            },
            (chunk) => {
              if (chunk.content) {
                assistantResponse += chunk.content;
                events.onToken?.(chunk.content);
              }
            }
          );
        } catch (err: any) {
          if (err.message?.includes("does not support tools") && openAiTools.length > 0) {
            streamResult = await this.provider.chatStream(
              this.context.getMessages(),
              {
                model: this.model,
                tools: undefined,
                signal: this.signal,
              },
              (chunk) => {
                if (chunk.content) {
                  assistantResponse += chunk.content;
                  events.onToken?.(chunk.content);
                }
              }
            );
          } else {
            throw err;
          }
        }

        const toolCalls = streamResult.tool_calls;

        // Fallback: many local models emit tool calls as JSON text instead of
        // structured tool_calls. Recover them when the payload names a known tool.
        if ((!toolCalls || toolCalls.length === 0) && streamResult.content) {
          const recovered = parseToolCallsFromText(streamResult.content, (n) =>
            Boolean(this.tools.get(n))
          );
          if (recovered.length > 0) {
            const cleanContent = stripToolCallsFromText(streamResult.content, (n) =>
              Boolean(this.tools.get(n))
            );
            this.context.addAssistantMessage(cleanContent, recovered);
            for (const tc of recovered) {
              await this.executeToolCall(tc, events);
            }
            events.onStatusChange?.("Analyzing tool results...");
            continue;
          }
        }

        if (!toolCalls || toolCalls.length === 0) {
          // Final text response with no pending tool calls
          const cleanText = stripToolCallsFromText(streamResult.content, (n) =>
            Boolean(this.tools.get(n))
          );
          this.context.addAssistantMessage(cleanText);
          events.onStatusChange?.("Idle");
          return cleanText;
        }

        // Add assistant message with tool calls to context
        this.context.addAssistantMessage(streamResult.content, toolCalls);

        // Execute each requested tool call
        for (const tc of toolCalls) {
          await this.executeToolCall(tc, events);
        }

        events.onStatusChange?.("Analyzing tool results...");
      } catch (err: any) {
        events.onError?.(err);
        events.onStatusChange?.("Error");
        throw err;
      }
    }

    const maxTurnMsg = `Reached maximum allowed turns (${this.maxTurns}).`;
    events.onStatusChange?.("Completed (Max turns)");
    return maxTurnMsg;
  }

  private async executeToolCall(tc: ToolCall, events: AgentEvents): Promise<void> {
    const toolName = tc.function.name;
    let toolArgs: any = {};
    try {
      toolArgs = JSON.parse(tc.function.arguments || "{}");
    } catch {
      toolArgs = {};
    }

    events.onToolStart?.(tc.id, toolName, toolArgs);
    events.onStatusChange?.(`Evaluating permissions for ${toolName}...`);

    const tool = this.tools.get(toolName);
    let result: ToolResult;

    if (!tool) {
      result = {
        success: false,
        output: "",
        error: `Tool '${toolName}' not found in registry.`,
      };
    } else {
      const isApproved = await this.permissions.checkPermission(tool, toolArgs);

      if (!isApproved) {
        result = {
          success: false,
          output: "",
          error: `Action denied by user or safety policy for '${toolName}'.`,
        };
      } else {
        events.onStatusChange?.(`Running ${toolName}...`);
        result = await this.tools.execute(toolName, toolArgs, {
          cwd: this.cwd,
          sandbox: this.sandbox,
          signal: this.signal,
        });
      }
    }

    events.onToolFinish?.(tc.id, toolName, result);

    const toolOutput = result.success
      ? result.output
      : `Error: ${result.error || "Operation failed"}\nOutput: ${result.output}`;

    this.context.addToolResult(tc.id, toolName, toolOutput);
  }
}
