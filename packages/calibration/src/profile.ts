import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { HardwareProfile } from "./types.js";

export function isValidProfile(value: unknown): value is HardwareProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<HardwareProfile>;
  if (p.version !== "1.0") return false;
  if (!p.tier || !["T1", "T2", "T3", "T4", "T5"].includes(p.tier)) return false;
  if (!p.hardware || typeof p.hardware !== "object") return false;
  if (!p.runtimeConfig || typeof p.runtimeConfig !== "object") return false;
  const rc = p.runtimeConfig;
  if (typeof rc.primaryLocalModel !== "string") return false;
  if (typeof rc.fastLocalModel !== "string") return false;
  if (typeof rc.contextWindow !== "number") return false;
  return true;
}

export class ProfileStore {
  getProjectPath(projectDir: string = process.cwd()): string {
    return path.join(projectDir, ".morphic", "hardware_profile.json");
  }

  getGlobalPath(): string {
    return path.join(os.homedir(), ".morphic", "hardware_profile.json");
  }

  async exists(projectDir: string = process.cwd()): Promise<boolean> {
    const projectPath = this.getProjectPath(projectDir);
    try {
      await fs.access(projectPath);
      return true;
    } catch {
      try {
        await fs.access(this.getGlobalPath());
        return true;
      } catch {
        return false;
      }
    }
  }

  async hasProjectProfile(projectDir: string = process.cwd()): Promise<boolean> {
    try {
      await fs.access(this.getProjectPath(projectDir));
      return true;
    } catch {
      return false;
    }
  }

  async load(projectDir: string = process.cwd()): Promise<HardwareProfile | null> {
    const tryRead = async (target: string): Promise<HardwareProfile | null> => {
      try {
        const data = await fs.readFile(target, "utf-8");
        const parsed = JSON.parse(data);
        return isValidProfile(parsed) ? parsed : null;
      } catch {
        return null;
      }
    };

    // Fall back to the global profile if the project file is missing or invalid.
    return (
      (await tryRead(this.getProjectPath(projectDir))) ??
      (await tryRead(this.getGlobalPath()))
    );
  }

  async save(
    profile: HardwareProfile,
    projectDir: string = process.cwd(),
    options: { skipProject?: boolean } = {}
  ): Promise<string> {
    const projectPath = this.getProjectPath(projectDir);

    if (!options.skipProject) {
      const dir = path.dirname(projectPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(projectPath, JSON.stringify(profile, null, 2), "utf-8");
    }

    // Also persist to global config for new projects
    try {
      const globalDir = path.dirname(this.getGlobalPath());
      await fs.mkdir(globalDir, { recursive: true });
      await fs.writeFile(
        this.getGlobalPath(),
        JSON.stringify(profile, null, 2),
        "utf-8"
      );
    } catch {
      // ignore global write error
    }

    return projectPath;
  }
}
