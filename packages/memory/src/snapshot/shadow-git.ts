import { execFile } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class ShadowGit {
  private gitDir: string;
  private workTree: string;

  constructor(workTree: string = process.cwd(), shadowDirName: string = ".morphic/shadow-git") {
    this.workTree = workTree;
    this.gitDir = path.isAbsolute(shadowDirName)
      ? shadowDirName
      : path.join(workTree, shadowDirName);
  }

  private async git(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        [`--git-dir=${this.gitDir}`, `--work-tree=${this.workTree}`, ...args],
        { cwd: this.workTree, maxBuffer: 16 * 1024 * 1024 }
      );
      return stdout.trim();
    } catch (err: any) {
      throw new Error(
        `ShadowGit error (${args.join(" ")}): ${err.stderr || err.message}`
      );
    }
  }

  async isInitialized(): Promise<boolean> {
    try {
      await fs.access(path.join(this.gitDir, "HEAD"));
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    if (await this.isInitialized()) return;

    await fs.mkdir(this.gitDir, { recursive: true });
    await this.git(["init"]);
    await this.git(["config", "user.name", "Morphic Shadow"]);
    await this.git(["config", "user.email", "shadow@morphic.local"]);

    // Exclude .morphic, node_modules, and git internal state from shadow tracking
    const infoDir = path.join(this.gitDir, "info");
    await fs.mkdir(infoDir, { recursive: true });
    await fs.writeFile(
      path.join(infoDir, "exclude"),
      ".morphic\nnode_modules\n.git\n"
    );

    // Add everything and initial commit
    await this.git(["add", "-A"]);
    await this.git(["commit", "-m", "Initial shadow snapshot", "--allow-empty"]);
  }

  async snapshot(message: string): Promise<string> {
    if (!(await this.isInitialized())) {
      await this.init();
    }

    await this.git(["add", "-A"]);

    // Check if there are changes to commit
    try {
      const status = await this.git(["status", "--porcelain"]);
      if (!status) {
        // Nothing changed
        return await this.git(["rev-parse", "HEAD"]);
      }
    } catch {
      // proceed
    }

    await this.git(["commit", "-m", message, "--allow-empty"]);
    return await this.git(["rev-parse", "HEAD"]);
  }

  async undo(): Promise<{
    success: boolean;
    message: string;
    revertedCommit?: string;
    filesChanged?: string[];
  }> {
    if (!(await this.isInitialized())) {
      return { success: false, message: "Shadow Git is not initialized." };
    }

    try {
      // If there are uncommitted tracked changes (e.g. an agent turn that ran
      // without an intervening snapshot), capture them first so the revert has
      // a well-defined target. Untracked files are ignored and preserved.
      const trackedDirty = await this.git(["diff", "--name-only", "HEAD"]).catch(() => "");
      if (trackedDirty) {
        await this.snapshot("Pre-undo safety snapshot");
      }

      const currentHead = await this.git(["rev-parse", "HEAD"]);

      const countStr = await this.git(["rev-list", "--count", "HEAD"]);
      const count = parseInt(countStr, 10);
      if (!Number.isFinite(count) || count <= 1) {
        return { success: false, message: "No previous snapshots to undo to." };
      }

      const target = await this.git(["rev-parse", "HEAD~1"]);

      // Files touched by the snapshot being reverted (status: A/M/D)
      let filesChanged: string[] = [];
      const addedFiles: string[] = [];
      try {
        const nameStatus = await this.git([
          "diff-tree",
          "--no-commit-id",
          "--name-status",
          "-r",
          "-M",
          currentHead,
        ]);
        for (const line of nameStatus.split("\n").filter(Boolean)) {
          const parts = line.split("\t");
          const status = parts[0];
          const filePath = parts[parts.length - 1];
          if (!filePath) continue;
          filesChanged.push(filePath);
          if (status.startsWith("A")) addedFiles.push(filePath);
        }
      } catch {
        // fallback: no file list
      }

      // Record any uncommitted user work before mutating, so undo is itself recoverable
      await this.snapshot("Pre-undo safety snapshot");

      // Move HEAD + index back without touching the working tree, then restore
      // tracked files to the target revision.
      await this.git(["reset", "--mixed", target]);
      await this.git(["checkout", target, "--", "."]);

      // Exact revert: remove files that the undone snapshot created (and that
      // therefore do not exist in the target revision).
      let deletedCount = 0;
      for (const rel of addedFiles) {
        const abs = path.resolve(this.workTree, rel);
        if (abs !== this.workTree && !abs.startsWith(this.workTree + path.sep)) {
          continue; // never delete outside the work tree
        }
        try {
          await fs.rm(abs, { force: true });
          deletedCount++;
        } catch {
          // ignore
        }
      }

      return {
        success: true,
        message: `Reverted workspace to snapshot before ${currentHead.slice(0, 8)} (${filesChanged.length} files changed; ${deletedCount} created files removed).`,
        revertedCommit: currentHead,
        filesChanged,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Undo failed: ${err.message}`,
      };
    }
  }

  async history(limit: number = 10): Promise<Array<{ hash: string; message: string; date: string }>> {
    if (!(await this.isInitialized())) return [];
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
    try {
      const output = await this.git([
        "log",
        "-n",
        String(safeLimit),
        "--pretty=format:%h%x1f%s%x1f%ad",
        "--date=short",
      ]);
      if (!output) return [];

      return output.split("\n").map((line) => {
        const [hash, message, date] = line.split("\x1f");
        return { hash, message, date };
      });
    } catch {
      return [];
    }
  }

  async diff(): Promise<string> {
    if (!(await this.isInitialized())) return "";
    try {
      return await this.git(["diff", "HEAD"]);
    } catch {
      return "";
    }
  }
}
