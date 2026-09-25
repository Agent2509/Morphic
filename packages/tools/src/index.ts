import { ToolRegistry } from "./registry.js";
import { readFileTool } from "./code/read.js";
import { editFileTool } from "./code/edit.js";
import { createFileTool } from "./code/create.js";
import { grepSearchTool } from "./search/grep.js";
import { shellExecTool } from "./exec/shell.js";
import { repoMapTool } from "./search/repo-map.js";
import { lspQueryTool } from "./search/lsp.js";
import { astRewriteTool } from "./ast/rewrite.js";
import { visualVerifyTool } from "./visual/verify.js";
import { dapDebugTool } from "./debug/dap.js";

export * from "./types.js";
export * from "./path-utils.js";
export * from "./registry.js";
export * from "./code/read.js";
export * from "./code/edit.js";
export * from "./code/create.js";
export * from "./search/grep.js";
export * from "./exec/shell.js";
export * from "./search/repo-map.js";
export * from "./search/lsp.js";
export * from "./ast/rewrite.js";
export * from "./visual/verify.js";
export * from "./debug/dap.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(editFileTool);
  registry.register(createFileTool);
  registry.register(grepSearchTool);
  registry.register(shellExecTool);
  registry.register(repoMapTool);
  registry.register(lspQueryTool);
  registry.register(astRewriteTool);
  registry.register(visualVerifyTool);
  registry.register(dapDebugTool);
  return registry;
}
