# Contributing to Morphic 🛠️

Thank you for your interest in contributing to Morphic! This guide provides everything you need to know to get started building and extending Morphic.

---

## 🏗️ Monorepo Architecture

Morphic is organized as a modular TypeScript monorepo powered by Bun:

```text
morphic/
├── bin/                 # CLI entry, bootstrap, and command modules (commands/)
├── editors/
│   └── vscode/          # Morphic ACP VS Code Extension
├── packages/
│   ├── shared/          # Zero-dep utilities: tokens, file walker, command normalize, logger
│   ├── acp/             # Agent Client Protocol (JSON-RPC stdio & WS server)
│   ├── agents/          # 5-Agent Pipeline (Planner, Researcher, Coder, Reviewer, Tester)
│   ├── calibration/     # Hardware profiler, benchmarker, tier classifier & router
│   ├── core/            # ReAct loop, AgentController, permissions, config, plugin loader
│   ├── mcp/             # Model Context Protocol (MCP) client & config loader
│   ├── memory/          # Shadow Git, Knowledge Graph, SQLite store, ContextCompactor
│   ├── providers/       # ModelProvider registry (Ollama local + DeepSeek cloud)
│   ├── safety/          # Podman container sandbox, CommandClassifier, SecretScanner
│   ├── tools/           # Core tools, AST rewrite, DAP inspection, RepoMap
│   └── ui/              # Ink + React terminal interface & setup wizard
├── scripts/             # Build and packaging automation
└── docs/                # Architecture design docs & blueprints
```

---

## ⚙️ Development Setup

### Prerequisites
1. **Bun**: v1.2+ (Recommended: `curl -fsSL https://bun.sh/install | bash`)
2. **Git**: Required for shadow git and workspace tracking
3. **Ollama**: (Optional for local testing) `ollama serve`
4. **Podman**: (Optional for container sandbox testing) `podman --version`

### Getting Started
```bash
# Clone the repository
git clone https://github.com/mohdfaizanali/morphic.git
cd morphic

# Install all workspace dependencies
bun install

# Run the test suite
bun test

# Run TypeScript typechecker
bun x tsc --noEmit
```

---

## 🧩 Adding a New Tool

All agent tools implement the `Tool<TSchema>` interface in `packages/tools`:

1. Create your tool under `packages/tools/src/<category>/<tool_name>.ts`:
```typescript
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MyToolSchema = z.object({
  query: z.string().describe("Query string"),
});

export const myTool: Tool<typeof MyToolSchema> = {
  name: "my_tool",
  description: "Description of what the tool accomplishes",
  category: "read", // "read" | "edit" | "exec" | "custom"
  parameters: MyToolSchema,
  async execute(args, context: ToolContext): Promise<ToolResult> {
    return {
      success: true,
      output: `Result for query: ${args.query}`,
    };
  },
};
```
2. Register the tool in `packages/tools/src/index.ts` within `createDefaultToolRegistry()`.
3. Add a unit test in `packages/tools/test/`.

---

## 🔌 Authoring Community Plugins

Morphic supports dynamically loaded community plugins via `.morphic/plugins/`:

Create `.morphic/plugins/my-plugin.ts`:
```typescript
export default {
  name: "my-custom-plugin",
  version: "1.0.0",
  tools: [
    /* Tool instances */
  ],
  async register({ tools }) {
    // Imperative tool registration or setup
  },
};
```

---

## 🧪 Testing Guidelines

Always verify your changes before submitting:

```bash
# Run all tests
bun test

# Run a specific test file
bun test packages/tools/test/advanced-tools.test.ts

# Ensure zero TypeScript errors
bun x tsc --noEmit

# Test standalone binary compilation
./scripts/build-bin.sh
```

---

## 📜 Code Style & Principles

- **Strict Types**: Always write explicit, type-safe TypeScript. Avoid `any` where possible.
- **Fail Gracefully**: Tools and agents should capture errors and report clean error messages rather than crashing the controller process.
- **Security-First**: Sanitize inputs, enforce permissions, and avoid executing unverified code outside the sandbox.
- **Commit Messages**: Follow standard conventional commits format (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
