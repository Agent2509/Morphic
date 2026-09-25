import { describe, expect, it } from "bun:test";
import { HardwareProfiler } from "../src/profiler.js";

describe("HardwareProfiler", () => {
  const profiler = new HardwareProfiler();

  it("detects CPU specifications", async () => {
    const cpu = await profiler.detectCPU();
    expect(cpu.cores).toBeGreaterThanOrEqual(1);
    expect(cpu.threads).toBeGreaterThanOrEqual(1);
    expect(cpu.model).toBeTruthy();
    expect(cpu.architecture).toBeTruthy();
  });

  it("detects RAM specifications", async () => {
    const ram = await profiler.detectRAM();
    expect(Number.isFinite(ram.totalGb)).toBe(true);
    expect(ram.totalGb).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(ram.availableGb)).toBe(true);
  });

  it("detects GPU specifications", async () => {
    const gpu = await profiler.detectGPU();
    expect(gpu.vendor).toBeTruthy();
    expect(["none", "integrated", "discrete"]).toContain(gpu.type);
  });

  it("detects Disk specifications", async () => {
    const disk = await profiler.detectDisk();
    expect(Number.isFinite(disk.freeGb)).toBe(true);
    expect(Number.isFinite(disk.totalGb)).toBe(true);
    expect(["nvme", "ssd", "hdd"]).toContain(disk.type);
  });

  it("detects OS specifications", async () => {
    const osSpec = await profiler.detectOS();
    expect(osSpec.platform).toBeTruthy();
    expect(osSpec.distro).toBeTruthy();
  });

  it("runs full profileAll suite", async () => {
    const specs = await profiler.profileAll();
    expect(specs.cpu).toBeDefined();
    expect(specs.ram).toBeDefined();
    expect(specs.gpu).toBeDefined();
    expect(specs.disk).toBeDefined();
    expect(specs.os).toBeDefined();
  });
});
