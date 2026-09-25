import type { Command } from "commander";
import { ShadowGit } from "@morphic/memory";
import { isGitRepo } from "../startup.js";

export function registerHistoryCommand(program: Command): void {
  program
    .command("history")
    .description("Show recent Morphic workspace snapshots")
    .option("-n, --limit <number>", "Number of snapshots to show", "10")
    .action(async (cmdOptions) => {
      if (!isGitRepo(process.cwd())) {
        console.log("\nNo snapshots found (not in a git repository).\n");
        return;
      }
      const shadow = new ShadowGit(process.cwd());
      const snapshots = await shadow.history(parseInt(cmdOptions.limit, 10));
      if (snapshots.length === 0) {
        console.log("\nNo snapshots found in shadow-git.\n");
        return;
      }
      console.log(`\n📜 Recent Snapshots (${snapshots.length}):\n`);
      for (const s of snapshots) {
        console.log(`  [${s.hash.slice(0, 8)}] ${s.date} - ${s.message}`);
      }
      console.log();
    });
}
