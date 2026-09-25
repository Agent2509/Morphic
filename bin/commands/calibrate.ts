import type { Command } from "commander";
import { calibrateSystem } from "@morphic/calibration";
import { isGitRepo } from "../startup.js";

export function registerCalibrateCommand(program: Command): void {
  program
    .command("calibrate")
    .description("Run hardware discovery and benchmark models to calibrate Morphic")
    .option("-q, --quick", "Run quick calibration with fast benchmark", false)
    .action(async (cmdOptions) => {
      console.log("\n🔧 Starting Morphic Self-Calibration...\n");
      const profile = await calibrateSystem({
        quick: cmdOptions.quick,
        saveProjectProfile: isGitRepo(process.cwd()),
        onProgress: (p) => {
          console.log(`[${p.progressPct}%] ${p.message}`);
        },
      });

      console.log("\n" + "=".repeat(60));
      console.log(`✔ Calibration Complete! Classification: ${profile.tier} (${profile.tierName})`);
      console.log(`  • CPU: ${profile.hardware.cpu.model} (${profile.hardware.cpu.cores}c/${profile.hardware.cpu.threads}t)`);
      console.log(`  • RAM: ${profile.hardware.ram.totalGb} GB (${profile.hardware.ram.availableGb} GB avail)`);
      console.log(`  • GPU: ${profile.hardware.gpu.model || profile.hardware.gpu.vendor} (${profile.hardware.gpu.type})`);
      console.log(`  • Primary Local: ${profile.runtimeConfig.primaryLocalModel}`);
      console.log(`  • Fast Local:    ${profile.runtimeConfig.fastLocalModel}`);
      console.log(`  • Cloud Fallback: ${profile.runtimeConfig.cloudFallbackModel}`);
      console.log(`Profile saved to .morphic/hardware_profile.json\n`);
      process.exit(0);
    });
}
