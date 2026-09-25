import { execFileSync } from "node:child_process";
import * as path from "node:path";

export function isGitRepo(cwd: string): boolean {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.toString().trim() === "true";
  } catch {
    return false;
  }
}

export interface StartupPaths {
  shadowGitDir: string | null;
  sessionDbPath: string;
  writeProjectProfile: boolean;
}

export function resolveStartupPaths(
  cwd: string,
  home: string,
  inGit: boolean
): StartupPaths {
  if (inGit) {
    return {
      shadowGitDir: cwd,
      sessionDbPath: path.join(cwd, ".morphic", "sessions.db"),
      writeProjectProfile: true,
    };
  }

  return {
    shadowGitDir: null,
    sessionDbPath: path.join(home, ".morphic", "sessions.db"),
    writeProjectProfile: false,
  };
}
