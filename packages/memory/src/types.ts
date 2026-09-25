export type NodeType =
  | "file"
  | "symbol"
  | "rule"
  | "pattern"
  | "module";

export type EdgeType =
  | "imports"
  | "defines"
  | "calls"
  | "references"
  | "enforces"
  | "depends_on";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
  weight?: number;
  metadata?: Record<string, any>;
}

export interface SessionRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "archived";
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  role: string;
  content?: string | null;
  toolCalls?: string;
  toolCallId?: string;
  createdAt: string;
}

export interface ProjectRule {
  category: "style" | "command" | "architecture" | "constraint";
  description: string;
}

export interface ProjectRules {
  projectName?: string;
  description?: string;
  rules: ProjectRule[];
  commonCommands?: Record<string, string>;
}

export interface SnapshotRecord {
  id: string;
  sessionId: string;
  commitHash: string;
  message: string;
  createdAt: string;
}
