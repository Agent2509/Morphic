import type { ChatMessage } from "@morphic/providers";
import { estimateTokens as estimateSharedTokens } from "@morphic/shared";
import { ContextCompactor } from "./compactor.js";

export interface ContextConfig {
  maxTokens?: number;
  systemPrompt?: string;
}

export class ContextManager {
  private messages: ChatMessage[] = [];
  private systemPrompt: string;
  private maxTokens: number;
  private compactor: ContextCompactor;

  constructor(config: ContextConfig = {}) {
    this.maxTokens = config.maxTokens || 32000;
    this.compactor = new ContextCompactor({ maxTokens: this.maxTokens });
    this.systemPrompt =
      config.systemPrompt ||
      `You are Morphic, a high-performance, self-calibrating AI coding agent.
You help users inspect, debug, write, and verify code across their projects.
Use the provided tools to explore files, search code, apply modifications, and run commands.
Always prefer reading files or searching with grep before attempting edits.
When editing files, ensure search blocks (oldStr) match exact lines uniquely.
CRITICAL TOOL CALLING DIRECTIVE:
You are an autonomous agent with direct access to file and execution tools.
When the user asks you to create, modify, inspect, or test files or applications, you MUST invoke the appropriate tool (create_file, edit_file, read_file, shell_exec, grep_search).
NEVER output conversational markdown instructions or describe what code to write instead of calling tools. Directly call the tools to execute the action on disk.
Be concise, accurate, and direct.`;

    this.messages.push({
      role: "system",
      content: this.systemPrompt,
    });
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    if (this.messages.length > 0 && this.messages[0].role === "system") {
      this.messages[0].content = prompt;
    } else {
      this.messages.unshift({ role: "system", content: prompt });
    }
  }

  addUserMessage(content: string): void {
    this.messages.push({
      role: "user",
      content,
    });
    this.ensureBudget();
  }

  addAssistantMessage(content: string, toolCalls?: any[]): void {
    this.messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    });
    this.ensureBudget();
  }

  addToolResult(toolCallId: string, toolName: string, output: string): void {
    this.messages.push({
      role: "tool",
      name: toolName,
      tool_call_id: toolCallId,
      content: output,
    });
    this.ensureBudget();
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [
      {
        role: "system",
        content: this.systemPrompt,
      },
    ];
  }

  estimateTokens(): number {
    return estimateSharedTokens(this.messages);
  }

  private ensureBudget(): void {
    // First attempt lossless-ish summarization of older turns.
    if (this.estimateTokens() > this.maxTokens * 0.9) {
      const { compactedMessages } = this.compactor.compact(this.messages);
      if (compactedMessages.length < this.messages.length) {
        this.messages = compactedMessages;
      }
    }

    // If still over budget, trim the oldest complete conversation turn. A turn
    // starts at a `user` message and runs up to (but not including) the next
    // `user` message, so assistant/tool pairs are never split and providers
    // never see an orphaned tool result.
    const budget = this.maxTokens * 0.9;
    while (this.estimateTokens() > budget && this.messages.length > 3) {
      // Find the start of the *second* turn (the next `user` after index 1).
      let nextUserIndex = -1;
      for (let i = 2; i < this.messages.length; i++) {
        if (this.messages[i].role === "user") {
          nextUserIndex = i;
          break;
        }
      }

      // Only one turn remains: cannot trim without dropping the active request.
      if (nextUserIndex === -1) return;

      // Remove [1, nextUserIndex) — the whole oldest turn.
      this.messages.splice(1, nextUserIndex - 1);
    }
  }
}
