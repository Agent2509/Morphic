export type AgentRole =
  | "planner"
  | "researcher"
  | "coder"
  | "reviewer"
  | "tester";

export interface PlanStep {
  description: string;
  files: string[];
  complexity: number;
}

export interface PlanResult {
  steps: PlanStep[];
}

export interface ResearchFindings {
  relevantFiles: Array<{
    path: string;
    reason: string;
    keySymbols: string[];
  }>;
  dependencies: string[];
  contextNotes: string[];
}

export interface CodeChanges {
  filesModified: Array<{ path: string; summary?: string }>;
  filesCreated: string[];
  filesDeleted: string[];
}

export interface ReviewIssue {
  severity: "critical" | "warning" | "suggestion";
  description: string;
  file: string;
  line?: number;
}

export interface ReviewResult {
  approved: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
}

export interface TestResult {
  lintPassed: boolean;
  typeCheckPassed: boolean;
  testsPassed: boolean;
  errors: string[];
}

export interface AgentHandoff {
  from: AgentRole;
  to: AgentRole | "user";
  summary: string;
  plan?: PlanResult;
  research?: ResearchFindings;
  codeChanges?: CodeChanges;
  review?: ReviewResult;
  testResults?: TestResult;
  action: "proceed" | "retry" | "escalate" | "abort";
  retryReason?: string;
}

export type PipelineStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface PipelineOutcome {
  success: boolean;
  summary: string;
  failedRole?: AgentRole;
  roleStatuses: Record<AgentRole, PipelineStageStatus>;
}

export interface PipelineEvents {
  onAgentStart?: (role: AgentRole) => void;
  onAgentFinish?: (role: AgentRole, handoff: AgentHandoff) => void;
  onHandoff?: (handoff: AgentHandoff) => void;
  onRetry?: (role: AgentRole, reason: string, count: number) => void;
  onToken?: (token: string, role: AgentRole) => void;
  onToolStart?: (callId: string, name: string, args: any) => void;
  onToolFinish?: (callId: string, name: string, result: any) => void;
  onStatusChange?: (status: string) => void;
  onError?: (err: Error) => void;
}
