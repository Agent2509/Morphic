export type CommandRiskLevel = "safe" | "caution" | "dangerous" | "blocked";

export interface CommandAssessment {
  command: string;
  risk: CommandRiskLevel;
  score: number; // 0 (completely safe) to 10 (catastrophic)
  reasons: string[];
  isBlocked: boolean;
  requiresConfirmation: boolean;
  suggestedAlternative?: string;
}

export type SecretType =
  | "openai_key"
  | "anthropic_key"
  | "github_pat"
  | "aws_key"
  | "private_key"
  | "deepseek_key"
  | "bearer_token"
  | "generic_secret";

export interface SecretMatch {
  type: SecretType;
  raw: string;
  redacted: string;
  startIndex: number;
}

export interface SandboxOptions {
  cwd?: string;
  network?: "none" | "host" | "bridge";
  memoryLimit?: string;
  cpuLimit?: string;
  image?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  failClosed?: boolean;
  signal?: AbortSignal;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxed: boolean;
  fallbackReason?: string;
}
