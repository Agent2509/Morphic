import type { Command } from "commander";
import { McpConfigLoader } from "@morphic/mcp";

export function registerMcpCommand(program: Command): void {
  const mcpCmd = program
    .command("mcp")
    .description("Manage Model Context Protocol (MCP) integrations");

  mcpCmd
    .command("list")
    .description("List configured MCP servers and external tools")
    .action(async () => {
      const loader = new McpConfigLoader();
      const config = await loader.loadConfig(process.cwd());
      const servers = Object.keys(config.mcpServers);

      if (servers.length === 0) {
        console.log("\nNo MCP servers configured. Add one to .morphic/mcp.json.\n");
        return;
      }

      console.log(`\n🔌 Configured MCP Servers (${servers.length}):\n`);
      for (const name of servers) {
        const s = config.mcpServers[name];
        if ("command" in s) {
          console.log(`  • ${name}: ${s.command} ${(s.args || []).join(" ")}`);
        } else {
          console.log(`  • ${name}: ${s.url}`);
        }
      }
      console.log();
    });
}
