import { z } from "zod";
import { exec } from "node:child_process";
import { CommandClassifier, PodmanSandbox, SecretScanner } from "@morphic/safety";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { resolveSafePath } from "../path-utils.js";

const optionalString = (inner: z.ZodTypeAny) =>
  z.preprocess((v) => (v === null || v === "" ? undefined : v), inner.optional());

const optionalPositiveNumber = (inner: z.ZodTypeAny) =>
  z.preprocess((v) => (v === null || v === "" || v === 0 ? undefined : v), inner.optional());

const ShellExecSchema = z.object({
  command: z.string().describe("The shell command line to execute"),
  cwd: optionalString(z.string()).describe("Directory to execute the command in (default: project root)"),
  timeoutMs: optionalPositiveNumber(z.coerce.number().int().positive()).describe("Timeout in milliseconds (default: 30000)"),
});

export const shellExecTool: Tool<typeof ShellExecSchema> = {
  name: "shell_exec",
  description: "Execute a shell command with stdout/stderr capture, security screening, and timeout.",
  category: "exec",
  parameters: ShellExecSchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    const resolvedCwd = await resolveSafePath(context.cwd, args.cwd || ".");
    if (!resolvedCwd.ok) {
      return { success: false, output: "", error: resolvedCwd.error };
    }
    const execCwd = resolvedCwd.abs;

    const timeout = args.timeoutMs || 30000;
    const scanner = new SecretScanner();

    // 1. Safety Screening
    const classifier = new CommandClassifier();
    const assessment = classifier.assess(args.command);
    if (assessment.isBlocked) {
      return {
        success: false,
        output: "",
        error: `BLOCKED by Morphic Safety Engine: ${assessment.reasons.join(" | ")}`,
        metadata: { assessment },
      };
    }

    // 2. Sandboxed execution if requested
    if (context.sandbox) {
      const sandbox = new PodmanSandbox();
      const sandResult = await sandbox.execute(args.command, {
        cwd: execCwd,
        timeoutMs: timeout,
        failClosed: true,
        signal: context.signal,
      });

      const out = scanner.sanitize(sandResult.stdout.trim());
      const err = scanner.sanitize(sandResult.stderr.trim());

      if (sandResult.exitCode !== 0) {
        return {
          success: false,
          output: out,
          error: `Exit code ${sandResult.exitCode}: ${err || "Execution failed in sandbox"}`,
          metadata: {
            exitCode: sandResult.exitCode,
            sandboxed: sandResult.sandboxed,
            fallbackReason: sandResult.fallbackReason,
            stdout: out,
            stderr: err,
          },
        };
      }

      return {
        success: true,
        output: out || (err ? `(stderr): ${err}` : "(Command executed successfully in sandbox with no output)"),
        metadata: {
          exitCode: 0,
          sandboxed: sandResult.sandboxed,
          stdout: out,
          stderr: err,
          assessment,
        },
      };
    }

    // 3. Host execution
    return new Promise<ToolResult>((resolve) => {
      exec(
        args.command,
        {
          cwd: execCwd,
          timeout,
          maxBuffer: 5 * 1024 * 1024,
          shell: "/bin/bash",
          signal: context.signal,
        },
        (error, stdout, stderr) => {
          const rawOut = stdout.trim();
          const rawErr = stderr.trim();

          const out = scanner.sanitize(rawOut);
          const err = scanner.sanitize(rawErr);

          if (error) {
            const exitCode = error.code ?? 1;
            const errorMsg = error.killed
              ? `Command timed out after ${timeout}ms`
              : err || error.message;

            resolve({
              success: false,
              output: out,
              error: `Exit code ${exitCode}: ${errorMsg}`,
              metadata: { exitCode, stdout: out, stderr: err, sandboxed: false, assessment },
            });
            return;
          }

          resolve({
            success: true,
            output: out || (err ? `(stderr): ${err}` : "(Command executed successfully with no output)"),
            metadata: { exitCode: 0, stdout: out, stderr: err, sandboxed: false, assessment },
          });
        }
      );
    });
  },
};
