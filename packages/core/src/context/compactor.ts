import type { ChatMessage } from "@morphic/providers";
import { estimateTokens as estimateSharedTokens } from "@morphic/shared";

export interface CompactorOptions {
  maxTokens?: number;
  preserveRecentCount?: number;
}

export class ContextCompactor {
  private maxTokens: number;
  private preserveRecentCount: number;

  constructor(options: CompactorOptions = {}) {
    this.maxTokens = options.maxTokens || 16000;
    this.preserveRecentCount = options.preserveRecentCount || 4;
  }

  estimateTokens(messages: ChatMessage[]): number {
    return estimateSharedTokens(messages);
  }

  needsCompaction(messages: ChatMessage[]): boolean {
    return this.estimateTokens(messages) > this.maxTokens * 0.8;
  }

  compact(messages: ChatMessage[]): {
    compactedMessages: ChatMessage[];
    summarizedCount: number;
  } {
    if (messages.length <= this.preserveRecentCount + 2) {
      return { compactedMessages: [...messages], summarizedCount: 0 };
    }

    const systemMessage = messages[0]?.role === "system" ? messages[0] : null;
    const workingMessages = systemMessage ? messages.slice(1) : [...messages];

    let cutoff = workingMessages.length - this.preserveRecentCount;
    // Align the boundary to a user turn so no assistant/tool pair is split.
    while (cutoff > 0 && workingMessages[cutoff]?.role !== "user") {
      cutoff--;
    }
    if (cutoff <= 0) {
      return { compactedMessages: [...messages], summarizedCount: 0 };
    }

    const olderMessages = workingMessages.slice(0, cutoff);
    const recentMessages = workingMessages.slice(cutoff);

    // Extract errors and key decisions that must survive compaction
    const criticalLogs: string[] = [];
    const topics: string[] = [];

    for (const msg of olderMessages) {
      const text = msg.content || "";
      if (criticalLogs.length < 10 && (text.includes("Error:") || text.includes("FAILED") || text.includes("REJECTED"))) {
        criticalLogs.push(text.slice(0, 150));
      }
      if (topics.length < 12 && msg.role === "user" && text.length > 0) {
        topics.push(text.slice(0, 80));
      }
    }

    let summaryText = `[Conversation Summary of earlier turns]\nTopics discussed: ${topics.join(" | ") || "Initial setup"}\n`;
    if (criticalLogs.length > 0) {
      summaryText += `Preserved Errors & Resolutions:\n${criticalLogs.map((e) => `  - ${e}`).join("\n")}\n`;
    }
    const MAX_SUMMARY_CHARS = 2000;
    if (summaryText.length > MAX_SUMMARY_CHARS) {
      summaryText = summaryText.slice(0, MAX_SUMMARY_CHARS) + "\n...[truncated]";
    }

    // Fold the summary into the single leading system message. Providers may
    // reject `system` messages that appear mid-conversation, so we never emit a
    // second one.
    const compacted: ChatMessage[] = [];
    if (systemMessage) {
      compacted.push({
        role: "system",
        content: `${systemMessage.content || ""}\n\n${summaryText}`.trim(),
      });
    } else {
      compacted.push({ role: "system", content: summaryText });
    }
    compacted.push(...recentMessages);

    return {
      compactedMessages: compacted,
      summarizedCount: olderMessages.length,
    };
  }
}
