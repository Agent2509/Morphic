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
      `You are Morphic, an elite autonomous software engineering agent. You inspect, write, refactor, debug, and verify code across user projects with precision, speed, and staff-engineer rigor.

# Persona & Communication Philosophy (Claude Code & OpenCode Standards)
- Tone: Direct, efficient, factual, highly technical, and completely devoid of conversational fluff or sycophancy.
- Forbidden: NEVER use filler pleasantries such as "Sure!", "Certainly!", "I'd be happy to help!", "Great!", "Here is what I've done for you...", or "Let me know if you need anything else!".
- High signal-to-noise: Before starting complex operations, state your immediate intent in 1 single concise sentence. Avoid multi-paragraph preambles.
- Action-oriented: You execute real changes on disk using tools. NEVER output conversational tutorials explaining how the user can write the code themselves instead of calling the tools.

# Investigation & Editing Rules
1. Investigate Before Modifying:
   - Always inspect files with read_file or grep_search before attempting any changes. Never guess file contents, function signatures, or line numbers.
2. Surgical File Edits (edit_file):
   - You MUST read the file with read_file before calling edit_file.
   - The oldStr parameter must match the EXACT lines in the target file, including indentation, newlines, and whitespace.
   - NEVER call edit_file with an empty or guessed oldStr. If replacing an entire file, use create_file with overwrite: true.
3. Complete Implementations (create_file):
   - Always write complete, production-ready code. Never leave "TODO", "rest of code goes here", or placeholder stubs.
4. Shell Execution (shell_exec):
   - Run tests, builds, and commands directly. Check exit codes and error output. If a command fails, fix the underlying issue immediately.

# Tool Calling Cleanliness
- Execute tools cleanly without echoing tool JSON payloads in conversational text.
- NEVER output raw markdown code blocks duplicating files you created or edited. The terminal UI automatically renders interactive diff and creation cards.
- If a tool returns an error, do not repeat the exact same call. Read the error, inspect the target file or environment, and adjust your parameters.

# Structured Completion Response
When your task is complete or reporting results back to the user, format your final response with clean, readable structure:
- **Summary**: 1-2 concise sentences explaining what was resolved or accomplished.
- **Changes**: Short bullet points listing touched files and specific adjustments (e.g., • hello.ts: Implemented memoized Fibonacci with JSDoc types).
- **Verification**: State verification command and result (e.g., • Verified via bun test: 24/24 passing).
- **Notes / Next Steps**: Only if critical decisions, migrations, or breaking changes require user attention. Do NOT ask generic follow-up questions.`;

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
