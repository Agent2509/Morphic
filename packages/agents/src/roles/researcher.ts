import {
  ToolRegistry,
  readFileTool,
  grepSearchTool,
  repoMapTool,
  lspQueryTool,
} from "@morphic/tools";
import { RESEARCHER_PROMPT } from "../prompts/index.js";
import { BaseAgent } from "../base.js";
import type { AgentHandoff } from "../types.js";
import type { ModelProvider } from "@morphic/providers";
import type { PermissionEngine } from "@morphic/core";

export class ResearcherAgent extends BaseAgent {
  constructor(options: {
    provider: ModelProvider;
    permissions?: PermissionEngine;
    cwd?: string;
    model?: string;
    sandbox?: boolean;
  }) {
    const tools = new ToolRegistry();
    tools.register(readFileTool);
    tools.register(grepSearchTool);
    tools.register(repoMapTool);
    tools.register(lspQueryTool);

    super({
      role: "researcher",
      name: "Researcher 🔍",
      systemPrompt: RESEARCHER_PROMPT,
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
    const planText = handoff.summary || (handoff.plan ? JSON.stringify(handoff.plan) : "");
    const prompt = `Planner's Analysis:\n${planText}\n\nInvestigate the codebase. Read the relevant files, check imports, functions, and key symbols. Summarize architectural context and implementation constraints for the Coder.`;

    const response = await this.executeAgentLoop(prompt, onToken);

    return {
      from: "researcher",
      to: "coder",
      summary: response,
      plan: handoff.plan,
      research: {
        relevantFiles: [],
        dependencies: [],
        contextNotes: [response],
      },
      action: "proceed",
    };
  }
}
