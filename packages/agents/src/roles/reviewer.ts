import { BaseAgent } from "../base.js";
import { ToolRegistry, readFileTool, grepSearchTool } from "@morphic/tools";
import { REVIEWER_PROMPT } from "../prompts/index.js";
import type { AgentHandoff, ReviewIssue } from "../types.js";
import type { ModelProvider } from "@morphic/providers";
import type { PermissionEngine } from "@morphic/core";

export class ReviewerAgent extends BaseAgent {
  constructor(options: {
    provider: ModelProvider;
    permissions?: PermissionEngine;
    cwd?: string;
    model?: string;
    sandbox?: boolean;
  }) {
    // Reviewer has STRICTLY read-only tools
    const tools = new ToolRegistry();
    tools.register(readFileTool);
    tools.register(grepSearchTool);

    super({
      role: "reviewer",
      name: "Reviewer 🔎",
      systemPrompt: REVIEWER_PROMPT,
      provider: options.provider,
      tools,
      permissions: options.permissions,
      cwd: options.cwd,
      model: options.model,
      sandbox: options.sandbox,
    });
  }

  async process(
    handoff: AgentHandoff,
    onToken?: (token: string) => void
  ): Promise<AgentHandoff> {
    const prompt = `Review the code changes made by the Coder.\n\nCoder Summary:\n${handoff.summary}\n\nInspect the modified files using read_file. Check for bugs, syntax mistakes, regressions, and type errors. Conclude with [REVIEW_STATUS: APPROVED] or [REVIEW_STATUS: REJECTED].`;

    const response = await this.executeAgentLoop(prompt, onToken);

    const explicitlyRejected =
      response.includes("[REVIEW_STATUS: REJECTED]") ||
      /critical\s+(issue|bug|error|vulnerability|regression)/i.test(response);
    const explicitlyApproved =
      response.includes("[REVIEW_STATUS: APPROVED]") ||
      !response.includes("[REVIEW_STATUS:");
    const isApproved = !explicitlyRejected && explicitlyApproved;

    const issues: ReviewIssue[] = [];
    if (!isApproved) {
      issues.push({
        severity: "critical",
        description: response.slice(0, 300),
        file: "codebase",
      });
    }

    return {
      from: "reviewer",
      to: isApproved ? "tester" : "coder",
      summary: response,
      plan: handoff.plan,
      research: handoff.research,
      codeChanges: handoff.codeChanges,
      review: {
        approved: isApproved,
        issues,
        suggestions: [],
      },
      action: isApproved ? "proceed" : "retry",
      retryReason: isApproved ? undefined : `Reviewer identified critical issues: ${response.slice(0, 200)}`,
    };
  }
}
