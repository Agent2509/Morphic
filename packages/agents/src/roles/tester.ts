import { BaseAgent } from "../base.js";
import { ToolRegistry, readFileTool, shellExecTool } from "@morphic/tools";
import { TESTER_PROMPT } from "../prompts/index.js";
import type { AgentHandoff, TestResult } from "../types.js";
import type { ModelProvider } from "@morphic/providers";
import type { PermissionEngine, AgentEvents } from "@morphic/core";

export class TesterAgent extends BaseAgent {
  constructor(options: {
    provider: ModelProvider;
    permissions?: PermissionEngine;
    cwd?: string;
    model?: string;
    sandbox?: boolean;
  }) {
    const tools = new ToolRegistry();
    tools.register(readFileTool);
    tools.register(shellExecTool);

    super({
      role: "tester",
      name: "Tester 🧪",
      systemPrompt: TESTER_PROMPT,
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
    onTokenOrEvents?: ((token: string) => void) | AgentEvents
  ): Promise<AgentHandoff> {
    const prompt = `Verify the recent changes.\n\nReviewer findings:\n${handoff.summary}\n\nRun relevant test or verification commands (e.g. "bun test" or "bun x tsc --noEmit") using shell_exec if applicable. Conclude with [TEST_STATUS: PASSED] or [TEST_STATUS: FAILED].`;

    const response = await this.executeAgentLoop(prompt, onTokenOrEvents);

    const explicitlyFailed = response.includes("[TEST_STATUS: FAILED]");
    const explicitlyPassed =
      response.includes("[TEST_STATUS: PASSED]") ||
      !response.includes("[TEST_STATUS:");
    const isPassed = !explicitlyFailed && explicitlyPassed;

    const testResults: TestResult = {
      lintPassed: isPassed,
      typeCheckPassed: isPassed,
      testsPassed: isPassed,
      errors: isPassed ? [] : [response.slice(0, 300)],
    };

    return {
      from: "tester",
      to: isPassed ? "user" : "coder",
      summary: response,
      plan: handoff.plan,
      research: handoff.research,
      codeChanges: handoff.codeChanges,
      review: handoff.review,
      testResults,
      action: isPassed ? "proceed" : "retry",
      retryReason: isPassed ? undefined : `Test verification failed: ${response.slice(0, 200)}`,
    };
  }
}
