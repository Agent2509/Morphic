import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { McpConfigLoader, MorphicMcpClient } from "../src/index.js";

describe("McpConfigLoader", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morphic_mcp_cfg_"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("loads mcp.json config when present", async () => {
    const morphicDir = path.join(tmpDir, ".morphic");
    fs.mkdirSync(morphicDir, { recursive: true });
    fs.writeFileSync(
      path.join(morphicDir, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          testServer: {
            command: "echo",
            args: ["hello"],
          },
        },
      }),
      "utf-8"
    );

    const loader = new McpConfigLoader();
    const config = await loader.loadConfig(tmpDir);
    expect(config.mcpServers.testServer).toBeDefined();
    expect((config.mcpServers.testServer as any).command).toBe("echo");
  });

  it("returns empty config if no mcp.json found", async () => {
    const loader = new McpConfigLoader();
    const config = await loader.loadConfig(tmpDir);
    expect(config.mcpServers).toEqual({});
  });
});

describe("MorphicMcpClient & Stdio Transport", () => {
  let tmpDir: string;
  let mockServerScript: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morphic_mcp_server_"));
    mockServerScript = path.join(tmpDir, "server.js");

    fs.writeFileSync(
      mockServerScript,
      `
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    if (req.method === "initialize") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: req.id,
        result: { protocolVersion: "2024-11-05", serverInfo: { name: "mock-server", version: "1.0" } }
      }) + "\\n");
    } else if (req.method === "tools/list") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          tools: [
            {
              name: "add_numbers",
              description: "Adds numbers together",
              inputSchema: { type: "object", properties: { a: { type: "number" } , b: { type: "number" } }, required: ["a", "b"] }
            }
          ]
        }
      }) + "\\n");
    } else if (req.method === "tools/call") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: req.id,
        result: {
          content: [{ type: "text", text: "Calculated sum: 42" }]
        }
      }) + "\\n");
    }
  } catch (err) {}
});
`,
      "utf-8"
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("connects, discovers tools, converts to Morphic Tools, and executes tool call", async () => {
    const client = new MorphicMcpClient("calc", {
      command: "node",
      args: [mockServerScript],
    });

    await client.connect();

    const discovered = client.getDiscoveredTools();
    expect(discovered.length).toBe(1);
    expect(discovered[0].name).toBe("add_numbers");

    const morphicTools = client.toMorphicTools();
    expect(morphicTools.length).toBe(1);
    expect(morphicTools[0].name).toBe("calc_add_numbers");

    const toolResult = await morphicTools[0].execute({ a: 20, b: 22 }, { cwd: tmpDir });
    expect(toolResult.success).toBe(true);
    expect(toolResult.output).toContain("Calculated sum: 42");

    client.close();
  });
});
