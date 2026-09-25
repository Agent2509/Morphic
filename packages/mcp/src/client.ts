import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "@morphic/tools";
import { StdioTransport } from "./transport/stdio.js";
import { HttpTransport } from "./transport/http.js";
import type {
  HttpServerConfig,
  McpServerConfig,
  McpTool,
  McpToolInputSchema,
  McpTransport,
  StdioServerConfig,
} from "./types.js";

export function jsonSchemaToZod(schema: McpToolInputSchema | undefined): z.ZodObject<any> {
  const properties = schema?.properties || {};
  const required = new Set(schema?.required || []);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, rawDef] of Object.entries(properties)) {
    const def = rawDef as { type?: string; description?: string };
    let field: z.ZodTypeAny;
    switch (def?.type) {
      case "number":
      case "integer":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.any());
        break;
      case "object":
        field = z.object({}).passthrough();
        break;
      default:
        field = z.string();
    }
    if (def?.description) field = field.describe(def.description);
    shape[key] = required.has(key) ? field : field.optional();
  }

  return z.object(shape).passthrough();
}

export class MorphicMcpClient {
  private transport: McpTransport | null = null;
  private tools: McpTool[] = [];

  constructor(public serverName: string, private config: McpServerConfig) {}

  async connect(): Promise<void> {
    this.transport =
      "command" in this.config
        ? new StdioTransport(this.config as StdioServerConfig)
        : new HttpTransport(this.config as HttpServerConfig);
    this.transport.start();

    try {
      // Handshake
      await this.transport.send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "morphic",
          version: "0.1.0",
        },
      });

      // Required by the MCP spec after a successful initialize
      this.transport.notify("notifications/initialized", {});

      // Fetch tools
      const listRes = await this.transport.send("tools/list", {});
      if (listRes && Array.isArray(listRes.tools)) {
        this.tools = listRes.tools;
      }
    } catch (err) {
      this.close();
      throw err;
    }
  }

  getDiscoveredTools(): McpTool[] {
    return [...this.tools];
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.transport) {
      throw new Error(`MCP Client for ${this.serverName} is not connected.`);
    }

    return await this.transport.send("tools/call", {
      name,
      arguments: args,
    });
  }

  toMorphicTools(): Tool[] {
    return this.tools.map((mcpTool) => {
      const toolName = `${this.serverName}_${mcpTool.name}`;
      const description = `[MCP: ${this.serverName}] ${mcpTool.description || mcpTool.name}`;

      // Derive a real schema from the server-declared inputSchema
      const schema = jsonSchemaToZod(mcpTool.inputSchema);

      const tool: Tool = {
        name: toolName,
        description,
        category: "custom",
        parameters: schema,
        execute: async (args: any, _context: ToolContext): Promise<ToolResult> => {
          try {
            const res = await this.callTool(mcpTool.name, args);
            let contentStr = "";
            if (res && res.content && Array.isArray(res.content)) {
              contentStr = res.content
                .map((c: any) => c.text || JSON.stringify(c))
                .join("\n");
            } else {
              contentStr = JSON.stringify(res, null, 2);
            }

            return {
              success: !res?.isError,
              output: contentStr,
              metadata: { mcpServer: this.serverName },
            };
          } catch (err: any) {
            return {
              success: false,
              output: "",
              error: `MCP Tool call failed: ${err.message}`,
            };
          }
        },
      };

      return tool;
    });
  }

  close(): void {
    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
  }
}
