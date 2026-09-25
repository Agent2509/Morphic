import {
  ToolRegistry,
  readFileTool,
  grepSearchTool,
  repoMapTool,
  lspQueryTool,
} from "@morphic/tools";
import { PLANNER_PROMPT } from "../prompts/index.js";
import { BaseAgent } from "../base.js";
import type { AgentHandoff } from "../types.js";
import type { ModelProvider } from "@morphic/providers";
import type { PermissionEngine } from "@morphic/core";

export class PlannerAgent extends BaseAgent {
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
      role: "planner",
      name: "Planner 🗺️",
      systemPrompt: PLANNER_PROMPT,
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
    const prompt = `User Request: "${handoff.summary}"\n\nCreate a clear plan. Break down necessary steps and list the files to inspect or modify.`;
    const response = await this.executeAgentLoop(prompt, onToken);

    return {
      from: "planner",
      to: "researcher",
      summary: response,
      plan: {
        steps: [
          {
            description: response,
            files: [],
            complexity: 5,
          },
        ],
      },
      action: "proceed",
    };
  }
}
