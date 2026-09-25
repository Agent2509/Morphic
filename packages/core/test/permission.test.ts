import { describe, expect, it } from "bun:test";
import { PermissionEngine, PermissionLevel } from "../src/index.js";

function makeTool(name: string, category: "read" | "edit" | "exec") {
  return {
    name,
    description: name,
    category,
    parameters: {} as any,
    execute: async () => ({ success: true, output: "" }),
  } as any;
}

const readTool = makeTool("read_file", "read");
const editTool = makeTool("edit_file", "edit");
const shellTool = makeTool("shell_exec", "exec");

describe("PermissionEngine fail-closed behavior", () => {
  it("denies edit/exec without a prompt handler at Standard", async () => {
    const engine = new PermissionEngine(PermissionLevel.Standard);
    expect(await engine.checkPermission(readTool, {})).toBe(true);
    expect(await engine.checkPermission(editTool, {})).toBe(false);
    expect(await engine.checkPermission(shellTool, { command: "ls" })).toBe(false);
  });

  it("denies exec without a handler at Relaxed", async () => {
    const engine = new PermissionEngine(PermissionLevel.Relaxed);
    expect(await engine.checkPermission(editTool, {})).toBe(true);
    expect(await engine.checkPermission(shellTool, { command: "ls" })).toBe(false);
  });

  it("auto-allows at Auto level", async () => {
    const engine = new PermissionEngine(PermissionLevel.Auto);
    expect(await engine.checkPermission(shellTool, { command: "ls" })).toBe(true);
  });

  it("never allows dangerous commands through alwaysAllow", async () => {
    const engine = new PermissionEngine(PermissionLevel.Auto);
    engine.alwaysAllow("shell_exec");
    const destructive = ["rm -rf /", "rm -rf /*", "rm -rf /home", "rm -rf ${HOME}/x", "rm -rf ~/x"];
    for (const command of destructive) {
      expect(await engine.checkPermission(shellTool, { command })).toBe(false);
    }
    expect(await engine.checkPermission(shellTool, { command: "ls" })).toBe(true);
  });

  it("rejects invalid permission levels instead of failing open", () => {
    expect(() => new PermissionEngine(0 as PermissionLevel)).toThrow();
    expect(() => new PermissionEngine(99 as PermissionLevel)).toThrow();
  });

  it("consults the prompt handler when approval is required", async () => {
    const engine = new PermissionEngine(PermissionLevel.Strict);
    let seen = "";
    engine.setPromptHandler(async (req) => {
      seen = req.tool.name;
      return false;
    });
    expect(await engine.checkPermission(editTool, {})).toBe(false);
    expect(seen).toBe("edit_file");
  });

  it("supports level changes, alwaysAllow and clearing the handler", async () => {
    const engine = new PermissionEngine(PermissionLevel.Strict);
    expect(engine.getLevel()).toBe(PermissionLevel.Strict);
    engine.setLevel(PermissionLevel.Auto);
    expect(engine.getLevel()).toBe(PermissionLevel.Auto);

    engine.alwaysAllow("read_file");
    expect(engine.alwaysAllow).toBeDefined();

    engine.setPromptHandler(async () => true);
    engine.clearPromptHandler();
    // Without a handler, Auto still allows.
    expect(await engine.checkPermission(shellTool, { command: "ls" })).toBe(true);
  });
});
