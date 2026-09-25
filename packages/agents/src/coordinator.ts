import type { ModelProvider } from "@morphic/providers";
import type { PermissionEngine } from "@morphic/core";
import { PlannerAgent } from "./roles/planner.js";
import { ResearcherAgent } from "./roles/researcher.js";
import { CoderAgent } from "./roles/coder.js";
import { ReviewerAgent } from "./roles/reviewer.js";
import { TesterAgent } from "./roles/tester.js";
import type {
  AgentHandoff,
  AgentRole,
  PipelineEvents,
  PipelineOutcome,
  PipelineStageStatus,
} from "./types.js";

export interface PipelineCoordinatorOptions {
  provider: ModelProvider;
  permissions?: PermissionEngine;
  cwd?: string;
  models?: Partial<Record<AgentRole, string>>;
  maxRetries?: number;
  sandbox?: boolean;
}

export class PipelineCoordinator {
  private planner: PlannerAgent;
  private researcher: ResearcherAgent;
  private coder: CoderAgent;
  private reviewer: ReviewerAgent;
  private tester: TesterAgent;
  private maxRetries: number;

  constructor(options: PipelineCoordinatorOptions) {
    const cwd = options.cwd || process.cwd();
    this.maxRetries = options.maxRetries ?? 3;
    const sandbox = options.sandbox ?? false;

    this.planner = new PlannerAgent({
      provider: options.provider,
      permissions: options.permissions,
      cwd,
      model: options.models?.planner,
      sandbox,
    });

    this.researcher = new ResearcherAgent({
      provider: options.provider,
      permissions: options.permissions,
      cwd,
      model: options.models?.researcher,
      sandbox,
    });

    this.coder = new CoderAgent({
      provider: options.provider,
      permissions: options.permissions,
      cwd,
      model: options.models?.coder,
      sandbox,
    });

    this.reviewer = new ReviewerAgent({
      provider: options.provider,
      permissions: options.permissions,
      cwd,
      model: options.models?.reviewer,
      sandbox,
    });

    this.tester = new TesterAgent({
      provider: options.provider,
      permissions: options.permissions,
      cwd,
      model: options.models?.tester,
      sandbox,
    });
  }

  setProvider(provider: ModelProvider): void {
    this.planner.setProvider(provider);
    this.researcher.setProvider(provider);
    this.coder.setProvider(provider);
    this.reviewer.setProvider(provider);
    this.tester.setProvider(provider);
  }

  setModelForRole(role: AgentRole, model?: string): void {
    const map: Record<AgentRole, { setModel: (m?: string) => void }> = {
      planner: this.planner,
      researcher: this.researcher,
      coder: this.coder,
      reviewer: this.reviewer,
      tester: this.tester,
    };
    map[role]?.setModel(model);
  }

  setSignal(signal?: AbortSignal): void {
    this.planner.setSignal(signal);
    this.researcher.setSignal(signal);
    this.coder.setSignal(signal);
    this.reviewer.setSignal(signal);
    this.tester.setSignal(signal);
  }

  setModel(model?: string): void {
    this.planner.setModel(model);
    this.researcher.setModel(model);
    this.coder.setModel(model);
    this.reviewer.setModel(model);
    this.tester.setModel(model);
  }

  selectPipelineRoles(complexity: number): AgentRole[] {
    if (complexity <= 3) {
      // Simple: Coder only
      return ["coder"];
    } else if (complexity <= 6) {
      // Medium: Planner -> Coder -> Tester
      return ["planner", "coder", "tester"];
    } else {
      // Complex: All 5 agents
      return ["planner", "researcher", "coder", "reviewer", "tester"];
    }
  }

  async run(
    userPrompt: string,
    complexity: number = 5,
    events: PipelineEvents = {}
  ): Promise<PipelineOutcome> {
    const activeRoles = this.selectPipelineRoles(complexity);

    const roleStatuses: Record<AgentRole, PipelineStageStatus> = {
      planner: "skipped",
      researcher: "skipped",
      coder: "skipped",
      reviewer: "skipped",
      tester: "skipped",
    };

    for (const r of activeRoles) {
      roleStatuses[r] = "pending";
    }

    let handoff: AgentHandoff = {
      from: "planner",
      to: activeRoles[0],
      summary: userPrompt,
      action: "proceed",
    };

    let retryCount = 0;
    let currentRoleIndex = 0;
    let failed = false;
    let failedRole: AgentRole | undefined;

    const agentMap: Record<AgentRole, { process: (h: AgentHandoff, events?: any) => Promise<AgentHandoff> }> = {
      planner: this.planner,
      researcher: this.researcher,
      coder: this.coder,
      reviewer: this.reviewer,
      tester: this.tester,
    };

    events.onStatusChange?.(`Starting pipeline: ${activeRoles.join(" ➔ ")}`);

    while (currentRoleIndex < activeRoles.length) {
      const role = activeRoles[currentRoleIndex];
      roleStatuses[role] = "running";
      events.onAgentStart?.(role);

      const agent = agentMap[role];
      try {
        handoff = await agent.process(handoff, {
          onToken: (token: string) => {
            events.onToken?.(token, role);
          },
          onToolStart: (id: string, name: string, args: any) => {
            events.onToolStart?.(id, name, args);
          },
          onToolFinish: (id: string, name: string, result: any) => {
            events.onToolFinish?.(id, name, result);
          },
          onStatusChange: (status: string) => {
            events.onStatusChange?.(`[${role}] ${status}`);
          },
        });
      } catch (err: any) {
        failed = true;
        failedRole = role;
        roleStatuses[role] = "failed";
        events.onError?.(err instanceof Error ? err : new Error(String(err)));
        break;
      }

      events.onAgentFinish?.(role, handoff);
      events.onHandoff?.(handoff);

      if (handoff.action === "abort") {
        failed = true;
        failedRole = role;
        roleStatuses[role] = "failed";
        events.onError?.(new Error(`Pipeline aborted by ${role}: ${handoff.retryReason || handoff.summary}`));
        break;
      }

      if (handoff.action === "retry" || handoff.action === "escalate") {
        if (retryCount < this.maxRetries) {
          retryCount++;
          events.onRetry?.(role, handoff.retryReason || "Verification failed", retryCount);

          const coderIndex = activeRoles.indexOf("coder");
          if (coderIndex !== -1) {
            // Reset every stage from coder through the failing role to pending.
            for (let i = coderIndex; i <= currentRoleIndex; i++) {
              roleStatuses[activeRoles[i]] = "pending";
            }
            currentRoleIndex = coderIndex;
            continue;
          }
        }

        failed = true;
        failedRole = role;
        roleStatuses[role] = "failed";
        events.onError?.(
          new Error(
            `Pipeline failed at ${role}: ${handoff.retryReason || "verification failed"}`
          )
        );
        break;
      }

      roleStatuses[role] = "completed";
      currentRoleIndex++;
    }

    if (failed) {
      events.onStatusChange?.("Pipeline finished with failures.");
      return {
        success: false,
        summary: handoff.summary,
        failedRole,
        roleStatuses,
      };
    }

    events.onStatusChange?.("Pipeline finished successfully.");
    return {
      success: true,
      summary: handoff.summary,
      roleStatuses,
    };
  }
}
