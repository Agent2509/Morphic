import type { Command } from "commander";
import { ShadowGit } from "@morphic/memory";
import { isGitRepo } from "../startup.js";

export function registerUndoCommand(program: Command): void {
  program
    .command("undo")
    .description("Revert tracked workspace changes to the previous Morphic snapshot")
    .action(async () => {
      if (!isGitRepo(process.cwd())) {
        console.error("\n✖ Not in a git repository; nothing to undo.\n");
        process.exit(1);
      }
      const shadow = new ShadowGit(process.cwd());
      const res = await shadow.undo();
      if (res.success) {
        console.log(`\n✔ ${res.message}\n`);
      } else {
        console.error(`\n✖ ${res.message}\n`);
        process.exit(1);
      }
    });
}
