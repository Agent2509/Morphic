import * as fs from "node:fs/promises";
import type { HardwareTier, PowerStatus } from "./types.js";

export class PowerManager {
  async getStatus(): Promise<PowerStatus> {
    if (process.platform === "linux") {
      try {
        const psDir = "/sys/class/power_supply";
        const entries = await fs.readdir(psDir);

        let batteryCapacity = 100;
        let charging = true;
        let isBattery = false;
        let acOnline = true;

        for (const entry of entries) {
          const lower = entry.toLowerCase();
          if (lower.startsWith("bat")) {
            isBattery = true;
            try {
              const capStr = await fs.readFile(`${psDir}/${entry}/capacity`, "utf-8");
              const cap = parseInt(capStr.trim(), 10);
              if (!isNaN(cap)) batteryCapacity = cap;

              const statStr = await fs.readFile(`${psDir}/${entry}/status`, "utf-8");
              const stat = statStr.trim().toLowerCase();
              charging = stat === "charging" || stat === "full";
            } catch {
              // ignore
            }
          } else if (lower.startsWith("ac") || lower.startsWith("adp")) {
            try {
              const onlineStr = await fs.readFile(`${psDir}/${entry}/online`, "utf-8");
              acOnline = onlineStr.trim() === "1";
            } catch {
              // ignore
            }
          }
        }

        const onBattery = isBattery && !acOnline;

        return {
          onBattery,
          percent: batteryCapacity,
          charging,
        };
      } catch {
        // fallback
      }
    }

    // Default desktop/plugged-in state
    return {
      onBattery: false,
      percent: 100,
      charging: true,
    };
  }

  adaptTier(baseTier: HardwareTier, status: PowerStatus): HardwareTier {
    if (!status.onBattery) {
      return baseTier;
    }

    const tiers: HardwareTier[] = ["T1", "T2", "T3", "T4", "T5"];
    const idx = tiers.indexOf(baseTier);
    if (idx <= 0) return baseTier;

    if (status.percent < 15) {
      // Critical battery: drop 2 tiers
      return tiers[Math.max(0, idx - 2)];
    } else if (status.percent < 30) {
      // Low battery: drop 1 tier
      return tiers[Math.max(0, idx - 1)];
    }

    return baseTier;
  }
}
