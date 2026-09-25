import * as fs from "node:fs/promises";
import type { ThermalStatus } from "./types.js";

export class ThermalMonitor {
  async getCpuTemp(): Promise<number> {
    if (process.platform === "linux") {
      try {
        const thermalDir = "/sys/class/thermal";
        const entries = await fs.readdir(thermalDir);
        const all: number[] = [];
        const cpuZones: number[] = [];

        for (const entry of entries) {
          if (!entry.startsWith("thermal_zone")) continue;
          try {
            const tempStr = await fs.readFile(`${thermalDir}/${entry}/temp`, "utf-8");
            const milli = parseInt(tempStr.trim(), 10);
            if (isNaN(milli) || milli <= 0) continue;
            const celsius = milli >= 1000 ? milli / 1000 : milli;
            all.push(celsius);

            let type = "";
            try {
              type = (await fs.readFile(`${thermalDir}/${entry}/type`, "utf-8")).trim().toLowerCase();
            } catch {
              // ignore
            }
            if (type.includes("x86_pkg_temp") || type.includes("cpu") || type.includes("soc") || type.includes("coretemp")) {
              cpuZones.push(celsius);
            }
          } catch {
            // skip unreadable zone
          }
        }

        const pool = cpuZones.length > 0 ? cpuZones : all;
        if (pool.length > 0) {
          return Math.round(Math.max(...pool));
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
