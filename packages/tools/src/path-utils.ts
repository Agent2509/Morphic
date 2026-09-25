import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface SafePathResult {
  ok: boolean;
  abs: string;
  error?: string;
}

const SENSITIVE_PREFIXES = [
  path.join(process.env.HOME || "/root", ".ssh"),
  "/etc/shadow",
  "/etc/gshadow",
  "/proc",
  "/sys",
  "/dev",
];

async function realpathNearest(target: string): Promise<string> {
  let current = target;
  while (true) {
    try {
      const real = await fs.realpath(current);
      const suffix = path.relative(current, target);
      return suffix ? path.join(real, suffix) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return target;
      current = parent;
    }
  }
}

function isSensitive(abs: string): boolean {
  return SENSITIVE_PREFIXES.some(
    (prefix) => abs === prefix || abs.startsWith(prefix + path.sep)
  );
}

export async function resolveSafePath(
  cwd: string,
  input: string
): Promise<SafePathResult> {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, abs: "", error: "A non-empty file path is required." };
  }
  if (input.includes("\0")) {
    return { ok: false, abs: "", error: "Invalid file path." };
  }

  const abs = path.resolve(cwd, input);

  let rootReal: string;
  try {
    rootReal = await fs.realpath(cwd);
  } catch {
    rootReal = path.resolve(cwd);
  }

  const realTarget = await realpathNearest(abs);

  if (isSensitive(realTarget)) {
    return { ok: false, abs, error: `Access to sensitive path denied: ${input}` };
  }

  const relative = path.relative(rootReal, realTarget);
  const escapes =
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative);
  if (escapes) {
    return {
      ok: false,
      abs,
      error: `Path escapes the project workspace: ${input}`,
    };
  }

  return { ok: true, abs };
}
