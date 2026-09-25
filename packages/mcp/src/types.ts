export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

export interface McpToolInputSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: McpToolInputSchema;
}

export interface StdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HttpServerConfig {
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = StdioServerConfig | HttpServerConfig;

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>;
}
