export interface AcpRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

export interface AcpResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface AcpNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

export interface AcpInitializeParams {
  clientInfo?: {
    name: string;
    version: string;
  };
  rootUri?: string;
  capabilities?: Record<string, any>;
}

export interface AcpSessionNewParams {
  sessionId?: string;
  cwd?: string;
  model?: string;
  provider?: string;
  permissionLevel?: number;
  singleAgent?: boolean;
}

export interface AcpPromptParams {
  sessionId: string;
  prompt: string;
}
