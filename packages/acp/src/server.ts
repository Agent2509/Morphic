import { AgentController, PermissionEngine, PermissionLevel } from "@morphic/core";
import { PipelineCoordinator } from "@morphic/agents";
import { createDefaultToolRegistry, resolveSafePath } from "@morphic/tools";
import { SmartRouter } from "@morphic/calibration";
import type { ModelProvider } from "@morphic/providers";
import type {
  AcpNotification,
  AcpPromptParams,
  AcpRequest,
  AcpResponse,
  AcpSessionNewParams,
} from "./types.js";

interface SessionState {
  id: string;
  controller: AgentController;
  coordinator?: PipelineCoordinator;
  abortController?: AbortController;
  pendingPermissions: Map<string, (allowed: boolean) => void>;
}

export interface AcpServerOptions {
  defaultProvider?: ModelProvider;
  onNotification?: (notification: AcpNotification) => void;
  /** Shared secret required on `initialize`. Omit to disable (e.g. stdio). */
  authToken?: string;
  /** Base working directory; client-supplied cwd must stay within it. */
  cwd?: string;
  /** Enforced server-side; client-supplied permissionLevel is ignored. */
  permissionLevel?: PermissionLevel;
  /** Optional resolver so clients can select a registered provider by id. */
  resolveProvider?: (id: string) => ModelProvider | undefined;
}

export class AcpServer {
  private sessions = new Map<string, SessionState>();
  private defaultProvider?: ModelProvider;
  private onNotification?: (notification: AcpNotification) => void;
  private authToken?: string;
  private baseCwd: string;
  private permissionLevel: PermissionLevel;
  private resolveProvider?: (id: string) => ModelProvider | undefined;
  private router = new SmartRouter();

  constructor(options: AcpServerOptions = {}) {
    this.defaultProvider = options.defaultProvider;
    this.onNotification = options.onNotification;
    this.authToken = options.authToken;
    this.baseCwd = options.cwd || process.cwd();
    this.permissionLevel = options.permissionLevel ?? PermissionLevel.Standard;
    this.resolveProvider = options.resolveProvider;
    PermissionEngine.assertLevel(this.permissionLevel);
  }

  setNotificationHandler(handler: (notification: AcpNotification) => void): void {
    this.onNotification = handler;
  }

  private sendNotification(method: string, params: any): void {
    if (this.onNotification) {
      this.onNotification({
        jsonrpc: "2.0",
        method,
        params,
      });
    }
  }

  async handleRequest(request: AcpRequest): Promise<AcpResponse> {
    try {
      switch (request.method) {
        case "initialize": {
          if (this.authToken) {
            const provided =
              request.params?.authToken ?? request.params?.token ?? undefined;
            if (provided !== this.authToken) {
              return {
                jsonrpc: "2.0",
                id: request.id,
                error: { code: -32001, message: "Unauthorized" },
              };
            }
          }
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              protocolVersion: "2024-11-05",
              serverInfo: {
                name: "morphic-acp",
                version: "0.1.0",
              },
              capabilities: {
                streaming: true,
                multiAgent: true,
                tools: true,
                undo: true,
              },
            },
          };
        }

        case "session/new": {
          const params: AcpSessionNewParams = request.params || {};
          const sessionId =
            params.sessionId || `acp_sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          // Permission level is server-controlled; never trust the client.
          const permissionEngine = new PermissionEngine(this.permissionLevel);
          const toolRegistry = createDefaultToolRegistry();

          let sessionCwd = this.baseCwd;
          if (params.cwd) {
            const resolved = await resolveSafePath(this.baseCwd, params.cwd);
            if (!resolved.ok) {
              return {
                jsonrpc: "2.0",
                id: request.id,
                error: { code: -32602, message: resolved.error || "Invalid cwd" },
              };
            }
            sessionCwd = resolved.abs;
          }

          const pendingPermissions = new Map<string, (allowed: boolean) => void>();

          permissionEngine.setPromptHandler((req) => {
            return new Promise<boolean>((resolve) => {
              const reqId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              const timer = setTimeout(() => {
                pendingPermissions.delete(reqId);
                resolve(false);
              }, 120000);
              pendingPermissions.set(reqId, (allowed) => {
                clearTimeout(timer);
                resolve(allowed);
              });
              this.sendNotification("permission/request", {
                sessionId,
                requestId: reqId,
                tool: req.tool.name,
                category: req.tool.category,
                args: req.args,
              });
            });
          });

          // Fallback provider mock if none passed
          const provider: ModelProvider =
            (params.provider && this.resolveProvider?.(params.provider)) ||
            this.defaultProvider ||
            {
            id: "acp-mock",
            name: "ACP Mock Provider",
            async isAvailable() { return true; },
            async listModels() { return [{ id: "mock-model", name: "Mock Model" }]; },
            async chat(messages, options) {
              return {
                content: "Mock completion",
                finish_reason: "stop",
                model: options?.model || "mock-model",
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
              };
            },
            async chatStream(messages, options, onChunk) {
              const text = "Mock completion response";
              onChunk?.({ content: text, finish_reason: "stop" });
              return {
                content: text,
                finish_reason: "stop",
                model: options?.model || "mock-model",
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
              };
            },
          };

          const controller = new AgentController({
            provider,
            tools: toolRegistry,
            permissions: permissionEngine,
            model: params.model,
            cwd: sessionCwd,
          });

          const coordinator = params.singleAgent
            ? undefined
            : new PipelineCoordinator({
                provider,
                permissions: permissionEngine,
                cwd: sessionCwd,
              });

          this.sessions.set(sessionId, {
            id: sessionId,
            controller,
            coordinator,
            pendingPermissions,
          });

          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              sessionId,
              status: "ready",
            },
          };
        }

        case "session/prompt": {
          const params: AcpPromptParams = request.params;
          if (!params || !params.sessionId) {
            throw new Error("Missing sessionId in session/prompt request");
          }

          const session = this.sessions.get(params.sessionId);
          if (!session) {
            throw new Error(`Session '${params.sessionId}' not found.`);
          }

          session.abortController = new AbortController();
          session.controller.setSignal(session.abortController.signal);
          session.coordinator?.setSignal(session.abortController.signal);

          let resultText = "";

          if (session.coordinator) {
            const complexity = this.router.classifyComplexity(params.prompt);
            const outcome = await session.coordinator.run(params.prompt, complexity, {
              onStatusChange: (status) => {
                this.sendNotification("session/status", {
                  sessionId: params.sessionId,
                  status,
                });
              },
              onAgentStart: (role) => {
                this.sendNotification("session/agentStart", {
                  sessionId: params.sessionId,
                  role,
                });
              },
              onAgentFinish: (role, handoff) => {
                this.sendNotification("session/agentFinish", {
                  sessionId: params.sessionId,
                  role,
                  handoff,
                });
              },
              onToken: (token) => {
                this.sendNotification("session/token", {
                  sessionId: params.sessionId,
                  token,
                });
              },
            });
            resultText = outcome.summary;
          } else {
            resultText = await session.controller.run(params.prompt, {
              onToken: (token) => {
                this.sendNotification("session/token", {
                  sessionId: params.sessionId,
                  token,
                });
              },
              onToolStart: (callId, name, args) => {
                this.sendNotification("session/toolStart", {
                  sessionId: params.sessionId,
                  callId,
                  name,
                  args,
                });
              },
              onToolFinish: (callId, name, result) => {
                this.sendNotification("session/toolFinish", {
                  sessionId: params.sessionId,
                  callId,
                  name,
                  result,
                });
              },
            });
          }

          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              sessionId: params.sessionId,
              output: resultText,
            },
          };
        }

        case "session/cancel": {
          const { sessionId } = request.params || {};
          const session = this.sessions.get(sessionId);
          if (session) {
            session.abortController?.abort();
            for (const resolve of session.pendingPermissions.values()) {
              resolve(false);
            }
            session.pendingPermissions.clear();
            this.sessions.delete(sessionId);
          }
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: { success: Boolean(session) },
          };
        }

        case "permission/response": {
          const { sessionId, requestId, allowed } = request.params || {};
          const session = this.sessions.get(sessionId);
          if (session && session.pendingPermissions.has(requestId)) {
            const resolve = session.pendingPermissions.get(requestId)!;
            session.pendingPermissions.delete(requestId);
            resolve(Boolean(allowed));
            return {
              jsonrpc: "2.0",
              id: request.id,
              result: { success: true },
            };
          }
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32602, message: `Invalid requestId ${requestId}` },
          };
        }

        default:
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: err.message || "Internal RPC Error",
        },
      };
    }
  }

  async handleMessage(rawMessage: string): Promise<string | null> {
    const trimmed = rawMessage.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed) as AcpRequest;
      const response = await this.handleRequest(parsed);
      return JSON.stringify(response);
    } catch (err: any) {
      return JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err.message}`,
        },
      });
    }
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.abortController?.abort();
    for (const resolve of session.pendingPermissions.values()) {
      resolve(false);
    }
    session.pendingPermissions.clear();
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.closeSession(id);
    }
  }
}
