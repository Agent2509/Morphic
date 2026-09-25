import * as fs from "node:fs/promises";
import type { ThermalStatus } from "./types.js";

export class ThermalMonitor {
  async getCpuTemp(): Promise<number> {
    if (process.platform === "linux") {
      try {
        const thermalDir = "/sys/class/thermal";
        const entries = await fs.readdir(thermalDir);
        const temps: number[] = [];

        for (const entry of entries) {
          if (entry.startsWith("thermal_zone")) {
            try {
              const tempStr = await fs.readFile(`${thermalDir}/${entry}/temp`, "utf-8");
              const milli = parseInt(tempStr.trim(), 10);
              if (!isNaN(milli) && milli > 0) {
                // sysfs temps are usually in millidegrees C
                const celsius = milli > 1000 ? milli / 1000 : milli;
                temps.push(celsius);
              }
            } catch {
              // skip unreadable zone
            }
          }
        }

        if (temps.length > 0) {
          // Return max temperature found among active zones
          return Math.round(Math.max(...temps));
        }
      } catch {
        // fallback
      }
    }

    // Default nominal temperature
    return 55;
  }

  async getStatus(): Promise<ThermalStatus> {
    const tempCelsius = await this.getCpuTemp();

    if (tempCelsius >= 90) {
      return {
        tempCelsius,
        status: "critical",
        throttleAction: "pause",
      };
    }

    if (tempCelsius >= 85) {
      return {
        tempCelsius,
        status: "hot",
        throttleAction: "reduce",
      };
    }

    if (tempCelsius >= 78) {
      return {
        tempCelsius,
        status: "warm",
        throttleAction: "downgrade",
      };
    }

    return {
      tempCelsius,
      status: "normal",
      throttleAction: "none",
    };
  }
}
