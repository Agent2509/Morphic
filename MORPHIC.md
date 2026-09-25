# Morphic

> **Shape-shifts to your hardware. Codes like a team.**

A next-generation, self-calibrating AI coding agent that automatically adapts to any machine it runs on.

## Quick Context

- **npm package**: `morphic-code`
- **CLI command**: `morphic`
- **Language**: TypeScript (Bun runtime)
- **License**: Private (open-source later)

## What Makes Morphic Different

1. **Self-Calibrating**: On first run, Morphic detects hardware (CPU, RAM, GPU, disk), benchmarks local models, classifies the machine into a performance tier (T1-T5), and auto-configures itself for optimal performance. Zero manual setup.

2. **5-Agent Pipeline**: Planner → Researcher → Coder → Reviewer → Tester. Sequential pipeline with adaptive scaling — simple tasks use 1 agent, complex tasks use all 5.

3. **Local-First**: Runs on Ollama locally by default. Falls back to cloud (DeepSeek) only for complex tasks. ~95% of computation is free.

4. **Hardware-Adaptive**: Thermal throttling, battery awareness, dynamic model switching based on system load.

## Key Design Decisions

| Decision | Choice |
| :--- | :--- |
| Runtime | Bun (TypeScript) |
| TUI | Ink + React |
| LLM SDK | `openai` npm (OpenAI-compatible) |
| Model Strategy | Local-first (Ollama) + cloud fallback (DeepSeek) |
| Multi-Agent | 5-agent sequential pipeline |
| Edit Strategy | Architect mode (reasoning + formatting split) |
| Codebase Awareness | Tree-sitter PageRank repo map + LSP + dynamic exploration |
| Calibration | Mandatory on first run, per-project profiles |
| Undo | Shadow Git (like Antigravity/Claude Code) |
| Sessions | SQLite with WAL |
| Memory | Knowledge graph (project architecture + learned patterns) |
| Sandbox | Podman containers (rootless) |
| MCP | Supported from day one |
| Permissions | 4-level system (Strict/Standard/Relaxed/Auto) |
| Installation | npm + binary + curl script |

## Documentation

- [Architecture Study](docs/architecture_study.md) — Deep analysis of Claude Code, OpenCode, and Aider architectures
- [Self-Calibration Design](docs/self_calibration_design.md) — Hardware detection, tiering, and adaptive configuration system
- [Implementation Plan](docs/implementation_plan.md) — Complete 6-phase development roadmap

## Development Status

- **Phase 1** (Foundation): Completed (Bun monorepo, ReAct loop, 5 core tools, Ink TUI, Ollama/DeepSeek provider, Level 2 permissions)
- **Phase 2** (Self-Calibration): Completed (Hardware profiler, Ollama benchmarker, T1-T5 classifier, thermal/power monitors, smart router, calibration CLI/TUI)
- **Phase 3** (Multi-Agent Pipeline): Completed (Planner, Researcher, Coder, Reviewer, Tester, adaptive 1/3/5 scaling, retry loop, AgentPipeline TUI)
- **Phase 4** (Intelligence & Memory): Completed (PageRank repo map, LSP symbol queries, KnowledgeGraph, ProjectRulesParser, SQLite WAL session store, Shadow Git snapshot & /undo rollback, ContextCompactor)
- **Phase 6** (Polish & IDE): Completed (ACP JSON-RPC stdio + authenticated WebSocket server, first-run setup wizard, VS Code extension, ast_rewrite, visual_verify, dap_inspect, PluginLoader, README, CONTRIBUTING, 218 passing unit tests, ~96% line coverage)

## Hardware Profile (Dev Machine)

- CPU: Intel i9-13900H (14 cores / 20 threads)
- RAM: 32 GB DDR5
- GPU: None (Intel Iris Xe integrated)
- Disk: 612 GB NVMe SSD
- OS: Fedora 44
- Ollama: v0.34.1 (fauma:3b @ 19.2 tok/s, llama3.1:8b @ 8.0 tok/s)
- Container: Podman 5.8.4
- Tier: T4 (Power)
