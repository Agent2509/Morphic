import { describe, expect, it } from "bun:test";
import { ThermalMonitor } from "../src/thermal.js";
import { PowerManager } from "../src/power.js";

describe("Power & Thermal Managers", () => {
  const thermal = new ThermalMonitor();
  const power = new PowerManager();

  it("reads CPU temperature and returns status", async () => {
    const temp = await thermal.getCpuTemp();
    expect(temp).toBeGreaterThan(10);
    expect(temp).toBeLessThan(120);

    const status = await thermal.getStatus();
    expect(["normal", "warm", "hot", "critical"]).toContain(status.status);
    expect(["none", "downgrade", "reduce", "pause"]).toContain(status.throttleAction);
  });

  it("reads power and battery status", async () => {
    const status = await power.getStatus();
    expect(typeof status.onBattery).toBe("boolean");
    expect(status.percent).toBeGreaterThanOrEqual(0);
    expect(status.percent).toBeLessThanOrEqual(100);
  });

  it("adapts tier when on low battery", () => {
    // When plugged in, tier stays T4
    expect(power.adaptTier("T4", { onBattery: false, percent: 10, charging: true })).toBe("T4");

    // When on battery < 30%, drops 1 tier to T3
    expect(power.adaptTier("T4", { onBattery: true, percent: 25, charging: false })).toBe("T3");

    // When on critical battery < 15%, drops 2 tiers to T2
    expect(power.adaptTier("T4", { onBattery: true, percent: 10, charging: false })).toBe("T2");
  });
});
