import type { Command } from "commander";
import { randomUUID } from "node:crypto";
import { ProviderRegistry } from "@morphic/providers";
import { PermissionLevel } from "@morphic/core";
import { AcpServer } from "@morphic/acp";

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Run Agent Client Protocol (ACP) server for IDE integration")
    .option("-p, --port <number>", "WebSocket port to listen on (default: 3848)", "3848")
    .option("--host <host>", "WebSocket bind host (default: 127.0.0.1)", "127.0.0.1")
    .option("--stdio", "Run ACP server in stdio mode (for direct IDE process piping)", false)
    .action(async (cmdOptions) => {
      const providerRegistry = new ProviderRegistry();
      const provider = providerRegistry.get("ollama") || providerRegistry.get("deepseek");

      const wsClients = new Set<any>();

      // WebSocket clients must authenticate; stdio is a trusted local pipe.
      const authToken: string | undefined = cmdOptions.stdio ? undefined : randomUUID();

      const acpServer = new AcpServer({
        defaultProvider: provider || undefined,
        cwd: process.cwd(),
        permissionLevel: PermissionLevel.Standard,
        authToken,
        resolveProvider: (id) => providerRegistry.get(id),
        onNotification: (notif) => {
          const payload = JSON.stringify(notif);
          if (cmdOptions.stdio) {
            process.stdout.write(payload + "\n");
          } else {
            for (const client of wsClients) {
              try {
                client.send(payload);
              } catch {
                wsClients.delete(client);
              }
            }
          }
        },
      });

      if (cmdOptions.stdio) {
        process.stdin.setEncoding("utf-8");
        let buffer = "";
        process.stdin.on("data", async (chunk) => {
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            try {
              const res = await acpServer.handleMessage(line);
              if (res) {
                process.stdout.write(res + "\n");
              }
            } catch (err: any) {
              process.stderr.write(`ACP handler error: ${err.message}\n`);
            }
          }
        });
      } else {
        const port = parseInt(cmdOptions.port, 10) || 3848;
        const hostname = cmdOptions.host || "127.0.0.1";
        const server = Bun.serve({
          port,
          hostname,
          fetch(req, srv) {
            if (srv.upgrade(req)) return undefined;
            return new Response("Morphic ACP server. Connect over WebSocket.\n", {
              status: 426,
            });
          },
          websocket: {
            open(ws) {
              wsClients.add(ws);
            },
            async message(_ws, message) {
              try {
                const raw = typeof message === "string" ? message : message.toString();
                const res = await acpServer.handleMessage(raw);
                if (res) _ws.send(res);
              } catch (err: any) {
                _ws.send(
                  JSON.stringify({
                    jsonrpc: "2.0",
                    id: null,
                    error: { code: -32603, message: err?.message || "Internal error" },
                  })
                );
              }
            },
            close(ws) {
              wsClients.delete(ws);
            },
          },
        });

        console.log(`\n🔮 Morphic ACP Server listening on ws://${hostname}:${server.port}`);
        console.log(`  Auth token (required on initialize): ${authToken}\n`);

        const shutdown = () => {
          acpServer.closeAll();
          server.stop(true);
          process.exit(0);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      }
    });
}
