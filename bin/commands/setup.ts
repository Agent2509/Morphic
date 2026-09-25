import type { Command } from "commander";
import { startSetupWizard } from "@morphic/ui";

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Run interactive first-run setup wizard to calibrate and configure Morphic")
    .action(async () => {
      const wizard = startSetupWizard({
        onComplete: () => {
          wizard.unmount();
          console.log(`\n✔ Setup complete! Configuration saved to ~/.morphic/config.json.\n`);
          process.exit(0);
        },
        onExit: () => {
          wizard.unmount();
          process.exit(0);
        },
      });
      await wizard.waitUntilExit();
    });
}
