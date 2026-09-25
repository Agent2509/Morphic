import * as os from "node:os";
import * as fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  CPUSpec,
  DiskSpec,
  GPUSpec,
  HardwareSpecs,
  OSSpec,
  RAMSpec,
} from "./types.js";

const execAsync = promisify(exec);

export class HardwareProfiler {
  async detectCPU(): Promise<CPUSpec> {
    const cpus = os.cpus();
    const threads = cpus.length;
    const model = cpus[0]?.model || "Unknown CPU";
    const speed = cpus[0]?.speed || 2400;
    const architecture = os.arch();

    let cores = threads;
    try {
      if (process.platform === "linux") {
        const cpuinfo = await fs.readFile("/proc/cpuinfo", "utf-8");
        const coreIds = new Set<string>();
        for (const line of cpuinfo.split("\n")) {
          if (line.startsWith("core id")) {
            coreIds.add(line);
          }
        }
        if (coreIds.size > 0) {
          cores = coreIds.size;
        }
      }
    } catch {
      // fallback
    }

    return {
      model,
      cores: Math.max(1, cores),
      threads,
      maxMhz: speed,
      architecture,
    };
  }

  async detectRAM(): Promise<RAMSpec> {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    let availableBytes = freeBytes;
    let swapBytes = 0;

    try {
      if (process.platform === "linux") {
        const meminfo = await fs.readFile("/proc/meminfo", "utf-8");
        for (const line of meminfo.split("\n")) {
          if (line.startsWith("MemAvailable:")) {
            const kb = parseInt(line.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(kb)) availableBytes = kb * 1024;
          } else if (line.startsWith("SwapTotal:")) {
            const kb = parseInt(line.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(kb)) swapBytes = kb * 1024;
          }
        }
      }
    } catch {
      // fallback
    }

    return {
      totalGb: Math.round((totalBytes / (1024 * 1024 * 1024)) * 10) / 10,
      availableGb: Math.round((availableBytes / (1024 * 1024 * 1024)) * 10) / 10,
      swapGb: Math.round((swapBytes / (1024 * 1024 * 1024)) * 10) / 10,
    };
  }

  async detectGPU(): Promise<GPUSpec> {
    // 1. Check NVIDIA (may report multiple GPUs, one per line)
    try {
      const { stdout } = await execAsync("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits");
      let bestName = "";
      let bestVramMb = 0;
      for (const line of stdout.trim().split("\n")) {
        const idx = line.lastIndexOf(",");
        if (idx === -1) continue;
        const name = line.slice(0, idx).trim();
        const memMb = parseInt(line.slice(idx + 1).trim(), 10);
        if (!isNaN(memMb) && memMb >= bestVramMb) {
          bestVramMb = memMb;
          bestName = name;
        }
      }
      if (bestVramMb > 0) {
        return {
          type: "discrete",
          vendor: "nvidia",
          model: bestName,
          vramGb: Math.round((bestVramMb / 1024) * 10) / 10,
          cudaAvailable: true,
          rocmAvailable: false,
        };
      }
    } catch {
      // Not nvidia
    }

    // 2. Check ROCm / AMD
    try {
      const { stdout } = await execAsync("rocm-smi --showmeminfo vram --json");
      let vramBytes = 0;
      try {
        const parsed = JSON.parse(stdout);
        for (const card of Object.values<any>(parsed)) {
          const total = Number(card?.["VRAM Total Memory (B)"] ?? card?.["vram_total"] ?? 0);
          if (Number.isFinite(total) && total > vramBytes) vramBytes = total;
        }
      } catch {
        // JSON schema differs; leave vramBytes at 0
      }
      return {
        type: "discrete",
        vendor: "amd",
        model: "AMD GPU (ROCm)",
        vramGb: Math.round((vramBytes / (1024 * 1024 * 1024)) * 10) / 10,
        cudaAvailable: false,
        rocmAvailable: true,
      };
    } catch {
      // Not amd rocm
    }

    // 3. Check Linux lspci for Intel / AMD integrated
    try {
      const { stdout } = await execAsync("lspci 2>/dev/null | grep -i -E 'vga|3d|display'");
      const lower = stdout.toLowerCase();
      if (lower.includes("intel")) {
        let model = "Intel Integrated Graphics";
        if (lower.includes("iris")) model = "Intel Iris Xe Graphics";
        else if (lower.includes("arc")) model = "Intel Arc Graphics";
        return {
          type: "integrated",
          vendor: "intel",
          model,
          vramGb: 0,
          cudaAvailable: false,
          rocmAvailable: false,
        };
      } else if (lower.includes("amd") || lower.includes("radeon")) {
        return {
          type: "integrated",
          vendor: "amd",
          model: "AMD Radeon Integrated",
          vramGb: 0,
          cudaAvailable: false,
          rocmAvailable: false,
        };
      }
    } catch {
      // Fallback
    }

    // 4. Check Apple Silicon
    if (process.platform === "darwin" && os.arch() === "arm64") {
      const totalGb = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
      return {
        type: "integrated",
        vendor: "apple",
        model: "Apple Silicon Unified Memory",
        vramGb: totalGb,
        cudaAvailable: false,
        rocmAvailable: false,
      };
    }

    return {
      type: "none",
      vendor: "none",
      vramGb: 0,
      cudaAvailable: false,
      rocmAvailable: false,
    };
  }

  async detectDisk(targetPath: string = process.cwd()): Promise<DiskSpec> {
    try {
      const stats = await fs.statfs(targetPath);
      const freeBytes = stats.bfree * stats.bsize;
      const totalBytes = stats.blocks * stats.bsize;

      let type: "nvme" | "ssd" | "hdd" = "ssd";

      if (process.platform === "linux") {
        try {
          const quoted = `'${targetPath.replace(/'/g, `'\\''`)}'`;
          const { stdout } = await execAsync(`df -P ${quoted}`);
          const device = stdout.split("\n")[1]?.split(/\s+/)[0] || "";
          if (device.includes("nvme")) {
            type = "nvme";
          } else if (device.startsWith("/dev/")) {
            // e.g. /dev/sda2 -> /dev/sda
            const base = device.replace(/\d+$/, "").split("/").pop() || "";
            try {
              const rotational = (await fs.readFile(`/sys/block/${base}/queue/rotational`, "utf-8")).trim();
              type = rotational === "1" ? "hdd" : "ssd";
            } catch {
              type = "ssd";
            }
          }
        } catch {
          // ignore
        }
      }

      return {
        type,
        freeGb: Math.round((freeBytes / (1024 * 1024 * 1024)) * 10) / 10,
        totalGb: Math.round((totalBytes / (1024 * 1024 * 1024)) * 10) / 10,
      };
    } catch {
      return {
        type: "ssd",
        freeGb: 50,
        totalGb: 250,
      };
    }
  }

  async detectOS(): Promise<OSSpec> {
    let distro = `${os.type()} ${os.release()}`;

    if (process.platform === "linux") {
      try {
        const release = await fs.readFile("/etc/os-release", "utf-8");
        for (const line of release.split("\n")) {
          if (line.startsWith("PRETTY_NAME=")) {
            distro = line.replace("PRETTY_NAME=", "").replace(/"/g, "").trim();
            break;
          }
        }
      } catch {
        // fallback
      }
    }

    let containerRuntime: string | undefined;
    try {
      const { stdout: podmanOut } = await execAsync("which podman 2>/dev/null");
      if (podmanOut.trim()) containerRuntime = "podman";
    } catch {
      try {
        const { stdout: dockerOut } = await execAsync("which docker 2>/dev/null");
        if (dockerOut.trim()) containerRuntime = "docker";
      } catch {
        // none
      }
    }

    return {
      platform: os.platform(),
      release: os.release(),
      distro,
      containerRuntime,
    };
  }

  async profileAll(targetPath: string = process.cwd()): Promise<HardwareSpecs> {
    const [cpu, ram, gpu, disk, osSpec] = await Promise.all([
      this.detectCPU(),
      this.detectRAM(),
      this.detectGPU(),
      this.detectDisk(targetPath),
      this.detectOS(),
    ]);

    return {
      cpu,
      ram,
      gpu,
      disk,
      os: osSpec,
    };
  }
}
