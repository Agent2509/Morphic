import type { ModelProvider } from "@morphic/providers";
import { ToolRegistry } from "@morphic/tools";
import {
  AgentController,
  ContextManager,
  PermissionEngine,
  PermissionLevel,
  type AgentEvents,
} from "@morphic/core";
import type { AgentHandoff, AgentRole } from "./types.js";

export interface BaseAgentOptions {
  role: AgentRole;
  name: string;
  systemPrompt: string;
  provider: ModelProvider;
  tools: ToolRegistry;
  permissions?: PermissionEngine;
  cwd?: string;
  model?: string;
  sandbox?: boolean;
  signal?: AbortSignal;
}

export abstract class BaseAgent {
  public readonly role: AgentRole;
  public readonly name: string;
  protected systemPrompt: string;
  protected provider: ModelProvider;
  protected tools: ToolRegistry;
  protected permissions: PermissionEngine;
  protected cwd: string;
  protected sandbox: boolean;
  protected signal?: AbortSignal;
  public model?: string;

  constructor(options: BaseAgentOptions) {
    this.role = options.role;
    this.name = options.name;
    this.systemPrompt = options.systemPrompt;
    this.provider = options.provider;
    this.tools = options.tools;
    this.permissions = options.permissions || new PermissionEngine(PermissionLevel.Standard);
    this.cwd = options.cwd || process.cwd();
    this.model = options.model;
    this.sandbox = options.sandbox ?? false;
    this.signal = options.signal;
  }

  setModel(model?: string): void {
    this.model = model;
  }

  setProvider(provider: ModelProvider): void {
    this.provider = provider;
  }

  setSignal(signal?: AbortSignal): void {
    this.signal = signal;
  }

  protected async executeAgentLoop(
    prompt: string,
    onTokenOrEvents?: ((token: string) => void) | AgentEvents
  ): Promise<string> {
    const events: AgentEvents =
      typeof onTokenOrEvents === "function"
        ? { onToken: onTokenOrEvents }
        : onTokenOrEvents || {};

    const context = new ContextManager({
      systemPrompt: this.systemPrompt,
      maxTokens: 32000,
    });

    const controller = new AgentController({
      provider: this.provider,
      tools: this.tools,
      permissions: this.permissions,
      context,
      model: this.model,
      cwd: this.cwd,
      maxTurns: 15,
      sandbox: this.sandbox,
      signal: this.signal,
    });

    return await controller.run(prompt, events);
  }

  abstract process(
    handoff: AgentHandoff,
    onTokenOrEvents?: ((token: string) => void) | AgentEvents
  ): Promise<AgentHandoff>;
}
