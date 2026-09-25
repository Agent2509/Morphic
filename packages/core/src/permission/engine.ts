import type { Tool } from "@morphic/tools";
import { containsDestructiveCommand, MorphicError } from "@morphic/shared";

export enum PermissionLevel {
  Strict = 1,
  Standard = 2,
  Relaxed = 3,
  Auto = 4,
}

export interface PermissionRequest {
  tool: Tool;
  args: any;
  level: PermissionLevel;
  reason: string;
}

export type PermissionPromptHandler = (request: PermissionRequest) => Promise<boolean>;

export class PermissionEngine {
  private level: PermissionLevel;
  private alwaysAllowedTools = new Set<string>();
  private onPrompt?: PermissionPromptHandler;

  constructor(level: PermissionLevel = PermissionLevel.Standard, onPrompt?: PermissionPromptHandler) {
    PermissionEngine.assertLevel(level);
    this.level = level;
    this.onPrompt = onPrompt;
  }

  static assertLevel(level: PermissionLevel): void {
    if (level !== PermissionLevel.Strict &&
        level !== PermissionLevel.Standard &&
        level !== PermissionLevel.Relaxed &&
        level !== PermissionLevel.Auto) {
      throw new MorphicError(`Invalid permission level: ${level}`, "INVALID_PERMISSION_LEVEL");
    }
  }

  setLevel(level: PermissionLevel): void {
    PermissionEngine.assertLevel(level);
    this.level = level;
  }

  getLevel(): PermissionLevel {
    return this.level;
  }

  setPromptHandler(handler: PermissionPromptHandler): void {
    this.onPrompt = handler;
  }

  clearPromptHandler(): void {
    this.onPrompt = undefined;
  }

  alwaysAllow(toolName: string): void {
    this.alwaysAllowedTools.add(toolName);
  }

  private isDangerousCommand(command: string): boolean {
    return containsDestructiveCommand(command);
  }

  async checkPermission(tool: Tool, args: any): Promise<boolean> {
    // Dangerous shell commands are never bypassable, even via alwaysAllow.
    if (tool.name === "shell_exec" && typeof args?.command === "string") {
      if (this.isDangerousCommand(args.command)) {
        return false;
      }
    }

    if (this.alwaysAllowedTools.has(tool.name)) {
      return true;
    }

    let needsApproval = false;
    let reason = "";

    switch (this.level) {
      case PermissionLevel.Strict:
        needsApproval = true;
        reason = `Permission Level is Strict (Level 1). All actions require confirmation.`;
        break;

      case PermissionLevel.Standard:
        if (tool.category === "read") {
          needsApproval = false;
        } else {
          needsApproval = true;
          reason = `Permission Level is Standard (Level 2). '${tool.name}' is a ${tool.category} action.`;
        }
        break;

      case PermissionLevel.Relaxed:
        if (tool.category === "read" || tool.category === "edit") {
          needsApproval = false;
        } else {
          needsApproval = true;
          reason = `Permission Level is Relaxed (Level 3). Command execution requires confirmation.`;
        }
        break;

      case PermissionLevel.Auto:
        needsApproval = false;
        break;

      default:
        // Fail closed on any unrecognized level instead of silently allowing.
        throw new MorphicError(
          `Unhandled permission level: ${this.level}`,
          "INVALID_PERMISSION_LEVEL"
        );
    }

    if (!needsApproval) {
      return true;
    }

    if (!this.onPrompt) {
      // Fail closed: without a prompt handler, only read-only actions and the
      // explicitly Auto level are permitted. Never silently allow edit/exec.
      return this.level === PermissionLevel.Auto || tool.category === "read";
    }

    return await this.onPrompt({
      tool,
      args,
      level: this.level,
      reason,
    });
  }
}
