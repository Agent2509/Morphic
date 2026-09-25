import type { z } from "zod";

export type ToolCategory = "read" | "edit" | "exec" | "custom";

export interface ToolContext {
  cwd: string;
  signal?: AbortSignal;
  sandbox?: boolean;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface Tool<TSchema extends z.ZodObject<any> = z.ZodObject<any>> {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: TSchema;
  execute(args: z.infer<TSchema>, context: ToolContext): Promise<ToolResult>;
}
