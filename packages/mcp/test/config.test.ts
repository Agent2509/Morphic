import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { McpConfigLoader } from "../src/config.js";

describe("McpConfigLoader error handling", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-mcp-cfg-"));
    await fs.mkdir(path.join(dir, ".morphic"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("ignores configs without an mcpServers object", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    await fs.writeFile(path.join(dir, ".morphic", "mcp.json"), '{"servers":{}}', "utf-8");
    const config = await new McpConfigLoader().loadConfig(dir);
    expect(config.mcpServers).toEqual({});
    warn.mockRestore();
  });

  it("warns on malformed JSON and falls back to empty config", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    await fs.writeFile(path.join(dir, ".morphic", "mcp.json"), "{not json", "utf-8");
    const config = await new McpConfigLoader().loadConfig(dir);
    expect(config.mcpServers).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
