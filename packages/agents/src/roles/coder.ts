import { BaseAgent } from "../base.js";
import {
  ToolRegistry,
  readFileTool,
  editFileTool,
  createFileTool,
  grepSearchTool,
  shellExecTool,
} from "@morphic/tools";
import { CODER_PROMPT } from "../prompts/index.js";
import type { AgentHandoff } from "../types.js";
import type { ModelProvider } from "@morphic/providers";
import type { PermissionEngine } from "@morphic/core";

export class CoderAgent extends BaseAgent {
  constructor(options: {
    provider: ModelProvider;
    permissions?: PermissionEngine;
    cwd?: string;
    model?: string;
    sandbox?: boolean;
  }) {
    const tools = new ToolRegistry();
    tools.register(readFileTool);
    tools.register(editFileTool);
    tools.register(createFileTool);
    tools.register(grepSearchTool);
    tools.register(shellExecTool);

    super({
      role: "coder",
      name: "Coder 💻",
      systemPrompt: CODER_PROMPT,
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
    let prompt = `Implement the requested code changes.\n\nContext & Requirements:\n${handoff.summary}`;

    if (handoff.action === "retry" && handoff.retryReason) {
      prompt = `PREVIOUS REVIEW OR TEST FAILED!\nReason: ${handoff.retryReason}\n\n`;
      if (handoff.review?.issues && handoff.review.issues.length > 0) {
        prompt += `Issues to fix:\n${handoff.review.issues.map((i) => `- [${i.severity}] ${i.description} in ${i.file}`).join("\n")}\n\n`;
      }
      if (handoff.testResults?.errors && handoff.testResults.errors.length > 0) {
        prompt += `Test Errors:\n${handoff.testResults.errors.join("\n")}\n\n`;
      }
      prompt += `Fix all above issues completely. Use edit_file and create_file as necessary.`;
    }

    const response = await this.executeAgentLoop(prompt, onToken);

    return {
      from: "coder",
      to: "reviewer",
      summary: response,
      plan: handoff.plan,
      research: handoff.research,
      codeChanges: {
        filesModified: [],
        filesCreated: [],
        filesDeleted: [],
      },
      action: "proceed",
    };
  }
}
