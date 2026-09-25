import { describe, expect, it } from "bun:test";
import { PodmanSandbox } from "../src/sandbox.js";

class NoPodmanSandbox extends PodmanSandbox {
  async isAvailable(): Promise<boolean> {
    return false;
  }
}

describe("PodmanSandbox execution", () => {
  it("falls back to host execution when podman is absent and not fail-closed", async () => {
    const result = await new NoPodmanSandbox().execute("echo host-fallback", {
      failClosed: false,
    });
    expect(result.sandboxed).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("host-fallback");
    expect(result.fallbackReason).toContain("Podman is not installed");
  });

  it("reports a non-zero exit code for failed fallback commands", async () => {
    const result = await new NoPodmanSandbox().execute("exit 7", { failClosed: false });
    expect(result.exitCode).toBe(7);
  });

  it("builds argument arrays with env and custom isolation settings", () => {
    const sandbox = new PodmanSandbox();
    const args = sandbox.buildPodmanArgs("env", {
      cwd: "/work",
      network: "bridge",
      memoryLimit: "1g",
      cpuLimit: "1",
      image: "node:20",
      env: { FOO: "bar" },
    });
    expect(args).toContain("--network=bridge");
    expect(args).toContain("--cap-drop=ALL");
    expect(args).toContain("--security-opt=no-new-privileges");
    expect(args).toContain("--pids-limit=256");
    expect(args).toContain("-e");
    expect(args).toContain("FOO=bar");
    expect(args[args.length - 4]).toBe("node:20");
    expect(args).toContain("--");
  });

  it("rejects cwd values that could break the volume spec", () => {
    const sandbox = new PodmanSandbox();
    expect(() =>
      sandbox.buildPodmanArgs("echo x", { cwd: "/tmp:/etc" })
    ).toThrow("Invalid sandbox working directory");
  });
});
