import * as fs from "node:fs/promises";
import * as path from "node:path";
import { consoleLogger, type Logger } from "@morphic/shared";
import type { McpConfigFile } from "./types.js";

export class McpConfigLoader {
  constructor(private logger: Logger = consoleLogger) {}

  async loadConfig(rootDir: string = process.cwd()): Promise<McpConfigFile> {
    const candidates = [
      path.join(rootDir, ".morphic", "mcp.json"),
      path.join(rootDir, ".agent", "mcp.json"),
    ];

    for (const file of candidates) {
      try {
        const raw = await fs.readFile(file, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
          return parsed as McpConfigFile;
        }
        this.logger.warn(`[mcp] Ignoring ${file}: missing 'mcpServers' object.`);
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          this.logger.warn(`[mcp] Failed to read ${file}: ${err?.message || err}`);
        }
      }
    }

    return { mcpServers: {} };
  }
}
