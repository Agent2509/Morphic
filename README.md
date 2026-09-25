# Morphic ⚡

> **Shape-shifts to your hardware. Codes like a team.**

Morphic is a next-generation, self-calibrating autonomous AI coding agent written in TypeScript for the **Bun** runtime. It automatically inspects your machine's hardware (CPU, RAM, GPU, thermals, power), benchmarks local models, categorizes your environment into a performance tier (T1–T5), and configures optimal multi-agent routing.

---

## 🚀 Key Highlights

1. **Self-Calibrating & Hardware-Adaptive**:
   - Discovers hardware cores, memory headroom, GPU VRAM, and thermal envelopes on first run.
   - Automatically benchmarks local Ollama models (`tok/s`) and maps machine to **T1 (Cloud-Only)** through **T5 (Beast Workstation)**.
   - Dynamically scales down model parameters and agent pipelines when on battery or during thermal throttling.

2. **5-Agent Sequential Pipeline**:
   - **Planner**: Generates structured execution blueprints.
   - **Researcher**: Explores repository architecture and extracts relevant symbols.
   - **Coder**: Implements precision modifications using an architect/editor paradigm.
   - **Reviewer**: Strictly read-only validation agent checking logic, security, and project rules.
   - **Tester**: Validates changes against unit test suites and diagnostics.
   - *Adaptive Scaling*: Automatically scales from 1 agent (simple fixes) to 3 agents (moderate features) or all 5 agents (complex architectural changes) with self-correcting retry loops.

3. **Local-First & Cost-Effective**:
   - Defaults to local Ollama inference (`qwen2.5-coder:7b`, `llama3.1:latest`, `qwen2.5-coder:3b`).
   - Automatically routes complex architectural tasks or queries beyond local capacity to cloud providers (e.g., `deepseek-chat`) via **SmartRouter**.

4. **Deep Intelligence & Persistent Memory**:
   - **PageRank Repo Map**: Structural codebase map ranking symbol centrality using PageRank and ctags/AST symbol extraction.
   - **Knowledge Graph**: Persistent graph database storing codebase concepts, dependencies, and architectural constraints.
   - **Shadow Git Snapshots & `/undo`**: Git-worktree snapshots (one per session baseline, plus a safety snapshot before undo) for exact rollback — modified files are restored and files created since the snapshot are removed.
   - **SQLite WAL Session Store**: Persistent conversation and turn history across CLI reboots.
   - **Context Compactor**: Automatic sliding-window and summarization engine preventing token overflow.

5. **Enterprise-Grade Safety & Sandboxing**:
   - **Rootless Podman Sandbox**: Runs all shell execution in disposable, network-isolated containers with UID-matching volume mounts.
   - **Command Classifier**: Categorizes commands into `SAFE`, `CAUTION`, `DANGEROUS`, or `BLOCKED` (blocks destructive commands like `rm -rf /` or disk writes).
   - **Secret Scanner**: Automatically redacts API keys, tokens, and private keys before sending prompts to models or rendering outputs.
   - **4-Level Permission Engine**: Strict (1), Standard (2), Relaxed (3), and Auto-Approve (4).

6. **IDE Integration & Protocol Support**:
   - **Agent Client Protocol (ACP)**: Full JSON-RPC stdio and WebSocket server (`morphic serve`) supporting IDE extensions.
   - **VS Code Extension**: Native sidebar panel, inline streaming diffs, and permission approvals.
   - **Model Context Protocol (MCP)**: Native client discovering tools from `.morphic/mcp.json` servers.
   - **Extensible Plugin System**: Load community plugins and tools dynamically from `.morphic/plugins/`.

---

## 🏛️ Architecture Overview

```mermaid
graph TD
    CLI[morphic CLI / VS Code ACP] --> Router[SmartRouter & Calibrator]
    Router --> Profiler[Hardware Profiler & Thermal/Power Monitor]
    
    subgraph Multi-Agent Pipeline
        Planner[Planner Agent] --> Researcher[Researcher Agent]
        Researcher --> Coder[Coder Agent]
        Coder --> Reviewer[Reviewer Agent]
        Reviewer --> Tester[Tester Agent]
        Tester -.->|Retry on Failure| Coder
    end

    subgraph Memory & Context
        RepoMap[PageRank Repo Map]
        LSP[LSP / Symbol Resolver]
        KG[Knowledge Graph]
        ShadowGit[Shadow Git Snapshot Engine]
        Compactor[Context Compactor]
    end

    subgraph Safety & Execution
        Classifier[Command Classifier]
        Scanner[Secret Scanner]
        Sandbox[Podman Container Sandbox]
        Perms[Permission Engine]
    end

    subgraph Provider Layer
        Local[Local Ollama T1-T5]
        Cloud[Cloud Fallback: DeepSeek / OpenAI]
    end

    Router --> Multi-Agent Pipeline
    Multi-Agent Pipeline --> Memory & Context
    Multi-Agent Pipeline --> Safety & Execution
    Safety & Execution --> Provider Layer
```

---

## 📊 Hardware Tier Matrix

| Tier | Profile Description | Typical Specs | Default Local Model | Multi-Agent Mode |
| :--- | :--- | :--- | :--- | :--- |
| **T1 (Cloud)** | Minimal / Virtual Machine | < 6 GB RAM or < 2 cores, no GPU | Cloud Fallback | Single Agent |
| **T2 (Light)** | Ultrabook / Budget Laptop | ≥ 6 GB RAM, ≥ 2 cores | 1.5B–3B Q4 (qwen2.5-coder:1.5b / llama3.2:3b) | 1–3 Agents |
| **T3 (Balanced)** | Standard Developer Laptop | ≥ 14 GB RAM, ≥ 4 cores | 7B–8B Q4 (llama3.1 / qwen2.5-coder:7b) | 3–5 Agents |
| **T4 (Power)** | High-End Workstation / Mac M-Series | ≥ 24 GB RAM, ≥ 8 cores | 8B unquantized / 7B Q4 | Full 5-Agent Pipeline |
| **T5 (Beast)** | Multi-GPU / Dedicated Rig | ≥ 64 GB RAM or ≥ 8 GB VRAM | 14B–32B Q4 or larger | Full 5-Agent Pipeline + Parallelism |

---

## 📦 Installation

### Prerequisites
- **Bun** v1.2+ — runtime (`curl -fsSL https://bun.sh/install | bash`)
- **Git** — required for shadow-git snapshots / `undo`
- **Ollama** — optional, for local models (`ollama serve`)
- **Podman** — optional, for `--sandbox`

### 1. One-Liner (once the repo is public)
```bash
curl -fsSL https://raw.githubusercontent.com/mohdfaizanali/morphic/main/install.sh | bash
```

### 2. From Source
```bash
git clone https://github.com/mohdfaizanali/morphic.git
cd morphic

bun install
bun run build

# Install the `morphic` command into ~/.local/bin (must be on PATH)
bun run install:global
# ...or build + install in one step:
bun run release
```

### 3. Compile Standalone Single-File Binary
```bash
./scripts/build-bin.sh
# Binary will be ready at dist/morphic
```

---

## 💻 CLI Usage

```bash
# Start interactive agent session
morphic

# Interactive first-run setup wizard
morphic setup

# Run with initial prompt in auto-pilot mode
morphic --auto "Add unit tests for auth middleware"

# Permission levels: 1 Strict, 2 Standard (default), 3 Relaxed, 4 Auto
morphic --permission-level 3 "Refactor the parser"

# Calibrate hardware and benchmark local models
morphic calibrate

# Revert workspace to the last snapshot (git repos only; removes files created since)
morphic undo

# Inspect recent snapshot history
morphic history

# Start ACP server for VS Code / IDE integration.
# WebSocket binds to 127.0.0.1 and prints a one-time auth token required on initialize.
morphic serve --port 3848
morphic serve --port 3848 --host 0.0.0.0   # opt-in remote (token still required)
morphic serve --stdio                        # trusted local pipe

# Run inside isolated Podman container sandbox
morphic --sandbox "Refactor data migrations"
```

> Workspace-controlled plugins and MCP servers only load when `MORPHIC_TRUST_WORKSPACE=1` is set.
> Non-git working directories are treated as read-only for profile/shadow state: sessions go to `~/.morphic/sessions.db` and no `.morphic/` is created in the cwd.

---

## 🧩 Advanced Tools & Capabilities

- **`ast_rewrite`**: Structural AST pattern matching and replacement using metavariables (`$VAR`, `add($A, $B) -> ($A + $B)`).
- **`visual_verify`**: Automated frontend health checker validating local HTML builds, checking selectors, and catching uncaught JavaScript runtime errors.
- **`dap_inspect`**: Debug Adapter Protocol stack trace parser locating source code frames and rendering context snippets around crash sites.
- **`repo_map`**: PageRank-driven symbol overview prioritizing high-centrality files and interfaces.
- **`mcp`**: Zero-configuration client for external tools exposed via Model Context Protocol servers.

---

## 🧪 Testing & Validation

Morphic features comprehensive unit and integration test coverage:

```bash
# Run test suite
bun test

# Run TypeScript typechecker (packages + tests + CLI)
bun run typecheck
bun run typecheck:editors
```

**Results:**
- **239 tests passing**, 0 failing across 47 test files, ~92% line coverage (`bun test --coverage`).
- **100% strict TypeScript compliance** with zero compiler errors (`bun run typecheck`, plus `bun run typecheck:editors` for the VS Code extension).

---

## 📄 License

Private & Proprietary. All rights reserved.
