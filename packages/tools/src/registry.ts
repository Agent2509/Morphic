import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool, ToolContext, ToolResult } from "./types.js";

function stripNulls(value: any): any {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null) continue;
    out[k] = v;
  }
  return out;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  toOpenAITools(): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }> {
    return this.list().map((tool) => {
      const jsonSchema = zodToJsonSchema(tool.parameters, {
        target: "openAi",
      }) as any;

      // Remove $schema if present for OpenAI tool compatibility
      const { $schema, ...cleanParameters } = jsonSchema;

      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: cleanParameters,
        },
      };
    });
  }

  async execute(name: string, rawArgs: string | Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: "",
        error: `Tool '${name}' not found. Available tools: ${Array.from(this.tools.keys()).join(", ")}`,
      };
    }

    let parsedArgs: any;
    try {
      parsedArgs = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Failed to parse tool arguments JSON: ${err.message}`,
      };
    }

    const validation = tool.parameters.safeParse(stripNulls(parsedArgs));
    if (!validation.success) {
      return {
        success: false,
        output: "",
        error: `Validation error for tool '${name}': ${validation.error.message}`,
      };
    }

    try {
      return await tool.execute(validation.data, context);
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Error executing tool '${name}': ${err.message || String(err)}`,
      };
    }
  }
}
