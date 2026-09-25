# Self-Calibrating Agent: Hardware Adaptation System

> **Core Idea**: When anyone clones this project and runs it, the agent automatically detects their hardware, benchmarks local model performance, and configures itself for optimal performance — zero manual configuration needed.

---

## Your Laptop Profile (Baseline Reference)

| Component | Spec | Rating |
| :--- | :--- | :--- |
| **CPU** | Intel i9-13900H (14 cores / 20 threads, up to 5.4 GHz) | 🟢 Excellent |
| **RAM** | 32 GB DDR5 (~22 GB available) | 🟢 Excellent |
| **GPU** | Intel Iris Xe (integrated, no NVIDIA) | 🟡 CPU-only inference |
| **Disk** | 612 GB NVMe SSD (4.6 GB/s sequential) | 🟢 Excellent |
| **Network** | ~330ms round-trip to DeepSeek API | 🟡 Moderate |
| **Ollama** | v0.34.1 installed, 3 models pulled | 🟢 Ready |
| **Local Inference** | fauma:3b → **19.2 tok/s**, llama3.1:8b → **8.0 tok/s** | 🟡 Usable (CPU-bound) |
| **Container Runtime** | Podman 5.8.4 (no Docker) | 🟢 Available |
| **OS** | Fedora 44, kernel 7.2.5 | 🟢 Modern |

> [!IMPORTANT]
> **Key constraint**: No NVIDIA GPU. All local inference runs on CPU. This means:
> - 3B models are comfortably fast (~19 tok/s)
> - 8B models are usable but slow (~8 tok/s)  
> - 14B+ models would be painfully slow (<4 tok/s)
> - The agent must be smart about when local is "good enough" vs. when to call cloud

---

## The Calibration System Design

### Phase 1: First-Launch Hardware Discovery

On first run, the agent performs a **60-second calibration** that detects everything and writes a `~/.agent/hardware_profile.json`:

```
First Launch
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│              HARDWARE DISCOVERY (< 5 seconds)           │
│                                                          │
│  CPU ──► cores, threads, max_freq, architecture          │
│  RAM ──► total, available, swap                          │
│  GPU ──► vendor, VRAM (nvidia-smi / rocm-smi / none)    │
│  Disk ──► type (NVMe/SSD/HDD), free space, write speed  │
│  OS  ──► distro, kernel, container runtime               │
│  Network ──► latency to cloud APIs, bandwidth estimate   │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│            OLLAMA DISCOVERY (< 5 seconds)               │
│                                                          │
│  Installed? ──► version, API reachable?                  │
│  Models ──► list all pulled models + sizes               │
│  If no Ollama ──► offer to install (curl script)         │
│  If no models ──► recommend + auto-pull best fit         │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│           INFERENCE BENCHMARK (< 45 seconds)            │
│                                                          │
│  For each pulled model:                                  │
│    1. Cold start latency (first token)                   │
│    2. Throughput (tok/s on 100-token generation)          │
│    3. Code quality test (can it write a valid function?)  │
│    4. Edit format test (can it produce SEARCH/REPLACE?)   │
│                                                          │
│  For each cloud provider (if API key exists):             │
│    1. Round-trip latency                                  │
│    2. Streaming first-token latency                       │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│            PROFILE CLASSIFICATION                       │
│                                                          │
│  Classify machine into one of 5 tiers                    │
│  Write ~/.agent/hardware_profile.json                    │
│  Print summary to user                                   │
└─────────────────────────────────────────────────────────┘
```

### Phase 2: The 5 Hardware Tiers

The calibration classifies any machine into one of these tiers:

| Tier | Name | Typical Machine | Local Model | Context | Concurrency |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T1** | **Ultra-Light** | Raspberry Pi, old laptop (4GB RAM, 2 cores) | ❌ Cloud only | 4K | 1 worker |
| **T2** | **Light** | Budget laptop (8GB RAM, 4 cores, no GPU) | Qwen2.5-0.5B / Phi-3-mini (1-2B) | 8K | 2 workers |
| **T3** | **Standard** | Mid-range (16GB RAM, 6+ cores, no GPU) | Qwen2.5-Coder-3B / DeepSeek-Coder-1.3B | 16K | 4 workers |
| **T4** | **Power** | **Your laptop** (32GB RAM, 14 cores, no GPU) | Qwen2.5-Coder-7B / Llama3.1-8B / CodeGemma-7B | 32K | 8 workers |
| **T5** | **Beast** | Workstation (64GB+ RAM, NVIDIA GPU 8GB+ VRAM) | DeepSeek-Coder-V2-16B / Codestral-22B / Qwen2.5-32B | 64K-128K | 12+ workers |

> [!NOTE]
> **Your machine (i9-13900H, 32GB, no GPU) = Tier 4 (Power)**. You can comfortably run 7B-8B models on CPU. The 14 cores and 32GB RAM are a major advantage — most people are on T2-T3.

---

### Phase 3: Dynamic Configuration Engine

Based on the tier, the agent auto-generates its runtime config:

```python
# Example of what the calibration produces
# ~/.agent/hardware_profile.json

{
    "version": "1.0",
    "calibrated_at": "2026-09-25T17:12:00+05:30",
    "tier": "T4",
    "tier_name": "Power",
    
    "hardware": {
        "cpu": {
            "model": "Intel i9-13900H",
            "cores": 14,
            "threads": 20,
            "max_mhz": 5400,
            "architecture": "x86_64"
        },
        "ram": {
            "total_gb": 32,
            "available_gb": 22,
            "swap_gb": 16
        },
        "gpu": {
            "type": "integrated",
            "vendor": "intel",
            "vram_gb": 0,
            "cuda_available": false,
            "rocm_available": false
        },
        "disk": {
            "type": "nvme",
            "free_gb": 513,
            "speed_gbps": 4.6
        },
        "network": {
            "cloud_latency_ms": 330,
            "bandwidth_estimate": "moderate"
        }
    },
    
    "ollama": {
        "installed": true,
        "version": "0.34.1",
        "models": {
            "fauma:3b": {
                "size_gb": 2.0,
                "throughput_tps": 19.2,
                "cold_start_s": 3.8,
                "code_quality_score": 0.6,
                "edit_format_score": 0.4
            },
            "llama3.1:latest": {
                "size_gb": 4.9,
                "throughput_tps": 8.0,
                "cold_start_s": 6.5,
                "code_quality_score": 0.82,
                "edit_format_score": 0.7
            }
        }
    },
    
    "cloud_providers": {
        "deepseek": {
            "available": true,
            "latency_ms": 330,
            "balance_usd": 1.59
        }
    },
    
    "runtime_config": {
        "primary_local_model": "llama3.1:latest",
        "fast_local_model": "fauma:3b",
        "cloud_fallback_model": "deepseek-flash",
        "cloud_reasoning_model": "deepseek-v4-pro",
        
        "context_window": 32768,
        "max_output_tokens": 4096,
        "repo_map_token_budget": 2048,
        "max_file_lines_per_read": 500,
        
        "concurrency": {
            "max_parallel_tools": 4,
            "max_background_tasks": 2,
            "grep_threads": 8
        },
        
        "routing": {
            "local_threshold_complexity": 5,
            "cloud_threshold_latency_ms": 500,
            "prefer_local_for": [
                "file_reading",
                "simple_edits",
                "commit_messages",
                "code_explanation",
                "variable_renaming"
            ],
            "prefer_cloud_for": [
                "multi_file_refactor",
                "architecture_design",
                "complex_debugging",
                "test_generation",
                "security_review"
            ]
        },
        
        "edit_strategy": {
            "local_mode": "architect",
            "cloud_mode": "direct_search_replace",
            "fallback": "whole_file"
        },
        
        "thermal": {
            "monitor": true,
            "throttle_at_celsius": 85,
            "cool_down_seconds": 30
        },
        
        "power": {
            "battery_aware": true,
            "on_battery_tier_downgrade": 1,
            "low_battery_threshold_pct": 20
        }
    }
}
```

---

## The Smart Router: Local vs Cloud Decision Engine

This is the brain of the self-calibration system. Every user request goes through this router:

```
User Request
     │
     ▼
┌────────────────────────────────────────────────────────┐
│              COMPLEXITY CLASSIFIER                      │
│              (Runs on fast_local_model)                  │
│                                                          │
│  Input: user prompt + active file count + repo size      │
│  Output: complexity score 1-10                           │
│                                                          │
│  Score 1-3: Simple                                       │
│    "rename this variable"                                │
│    "add a docstring"                                     │
│    "explain this function"                               │
│                                                          │
│  Score 4-6: Medium                                       │
│    "add error handling to this function"                  │
│    "write a unit test for this class"                     │
│    "fix this bug" (single file)                           │
│                                                          │
│  Score 7-10: Complex                                     │
│    "refactor the auth system across 5 files"              │
│    "design a caching layer"                               │
│    "debug this race condition"                            │
└─────────────┬──────────────────────────────┘
              │
     ┌────────┴────────┬──────────────────┐
     │                 │                  │
   1-3               4-6               7-10
  Simple            Medium            Complex
     │                 │                  │
     ▼                 ▼                  ▼
┌──────────┐    ┌──────────────┐    ┌──────────────────┐
│  LOCAL   │    │   DECISION   │    │     CLOUD        │
│  ONLY    │    │   MATRIX     │    │   (with local    │
│          │    │              │    │    editor for     │
│ fast     │    │ Check:       │    │    architect      │
│ model    │    │ - Battery?   │    │    mode)          │
│ (3B)     │    │ - Thermal?   │    │                   │
│          │    │ - Network?   │    │ deepseek-flash    │
│          │    │ - Credit $?  │    │ or deepseek-v4    │
│          │    │              │    │                   │
│          │    │ If ok → Cloud│    │                   │
│          │    │ Else → Local │    │                   │
└──────────┘    └──────────────┘    └──────────────────┘
```

### The Decision Matrix for Medium Tasks

```python
def should_use_cloud(task_complexity: int, profile: HardwareProfile) -> bool:
    """Decide whether to route to cloud or stay local."""
    
    # Always local for simple tasks
    if task_complexity <= 3:
        return False
    
    # Always cloud for complex tasks (if available)
    if task_complexity >= 7 and profile.cloud_available:
        return True
    
    # Medium tasks: use decision matrix
    score = 0
    
    # Factor 1: Is the local model fast enough?
    if profile.primary_local_tps < 5:  # Too slow
        score += 3
    elif profile.primary_local_tps < 10:  # Okay
        score += 1
    
    # Factor 2: Battery status
    if profile.on_battery and profile.battery_pct < 30:
        score += 2  # Prefer cloud to save battery
    
    # Factor 3: Thermal status
    if profile.cpu_temp > 80:
        score += 2  # CPU is hot, offload to cloud
    
    # Factor 4: Network quality
    if profile.cloud_latency_ms > 1000:
        score -= 3  # Bad network, stay local
    elif profile.cloud_latency_ms > 500:
        score -= 1
    
    # Factor 5: Cloud credits remaining
    if profile.cloud_balance_usd < 0.10:
        score -= 5  # Almost out of credits, stay local
    
    # Factor 6: Code quality requirement
    if task_complexity >= 5:
        local_quality = profile.primary_model_code_quality_score
        if local_quality < 0.7:
            score += 2  # Local model not good enough
    
    return score > 2 and profile.cloud_available
```

---

## Adaptive Model Recommendation

When calibration runs and detects no suitable local model (or a suboptimal one), it recommends the best model for the hardware:

### GPU Machines (NVIDIA)

| VRAM | Recommended Model | Why |
| :--- | :--- | :--- |
| **4 GB** | `qwen2.5-coder:3b-q4` | Fits in VRAM with room for context |
| **6 GB** | `qwen2.5-coder:7b-q4` | Best coding quality at this VRAM tier |
| **8 GB** | `deepseek-coder-v2:16b-q4` | Strong coding + reasoning at Q4 quantization |
| **12 GB** | `codestral:22b-q4` | Excellent code generation, full context |
| **16 GB+** | `qwen2.5-coder:32b-q4` | Near-cloud quality locally |
| **24 GB+** | `deepseek-coder-v2:33b` or `codestral:22b` (full precision) | Best possible local experience |

### CPU-Only Machines (Like Yours)

| RAM Available | Recommended Model | Expected Speed | Why |
| :--- | :--- | :--- | :--- |
| **4-8 GB** | `qwen2.5-coder:0.5b` | ~40-60 tok/s | Only viable option; use for classification only |
| **8-16 GB** | `qwen2.5-coder:1.5b` or `deepseek-coder:1.3b` | ~25-35 tok/s | Decent for simple edits, commit msgs |
| **16-24 GB** | `qwen2.5-coder:3b` | ~15-25 tok/s | Good balance of quality vs speed |
| **24-32 GB** | `qwen2.5-coder:7b` | ~8-12 tok/s | **Your sweet spot** — best quality your RAM supports comfortably |
| **32-48 GB** | `qwen2.5-coder:7b` + `qwen2.5-coder:1.5b` (fast) | Fast:30+, Strong:10 | Dual-model setup: fast for routing, strong for coding |
| **48+ GB** | `qwen2.5-coder:14b` | ~4-6 tok/s | Slow but highest quality on CPU |

> [!TIP]
> **For your machine (32GB, CPU-only)**: The ideal setup is:
> - **Fast model**: `qwen2.5-coder:1.5b` (~30 tok/s) — for complexity classification, commit messages, quick explanations
> - **Strong model**: `qwen2.5-coder:7b` (~10 tok/s) — for actual code editing and understanding
> - **Cloud fallback**: DeepSeek Flash — for complex multi-file refactors and architecture

---

## Thermal & Power Management

### Thermal Throttling (Prevents Laptop from Overheating)

```python
class ThermalManager:
    """Monitor CPU temperature and throttle inference to prevent overheating."""
    
    def get_cpu_temp(self) -> float:
        """Read CPU temperature from thermal zones."""
        # Linux: /sys/class/thermal/thermal_zone*/temp
        # Returns temperature in Celsius
        
    def should_throttle(self) -> bool:
        temp = self.get_cpu_temp()
        if temp > 90:   # Critical — pause local inference entirely
            return "pause"
        elif temp > 85:  # Hot — reduce concurrency, prefer cloud
            return "reduce"
        elif temp > 80:  # Warm — switch from 7B to 3B model
            return "downgrade"
        return "normal"
    
    def apply_throttle(self, action: str):
        if action == "pause":
            # Stop local inference for 30s cool-down
            # Route everything to cloud temporarily
            pass
        elif action == "reduce":
            # Cut parallel workers from 4 to 2
            # Prefer cloud for new tasks
            pass
        elif action == "downgrade":
            # Switch from qwen2.5-coder:7b to qwen2.5-coder:1.5b
            # Lighter model = less CPU heat
            pass
```

### Battery-Aware Mode

```python
class PowerManager:
    """Adapt behavior based on power source and battery level."""
    
    def get_power_status(self) -> dict:
        """Read from /sys/class/power_supply/"""
        # Returns: { on_battery: bool, percent: int, time_remaining_min: int }
    
    def adapt_tier(self, base_tier: int) -> int:
        status = self.get_power_status()
        
        if not status["on_battery"]:
            return base_tier  # Plugged in, full power
        
        if status["percent"] < 15:
            return max(base_tier - 2, 1)  # Critical: cloud-only mode
        elif status["percent"] < 30:
            return max(base_tier - 1, 1)  # Low: downgrade one tier
        else:
            return base_tier  # Battery fine, normal operation
```

---

## Re-Calibration Triggers

The profile isn't static. The agent re-calibrates when:

| Trigger | What Changes | Action |
| :--- | :--- | :--- |
| **New Ollama model pulled** | Available models list | Re-benchmark new model, update routing |
| **Significant RAM change** | Available memory | Recalculate tier, adjust context window |
| **GPU driver installed** | CUDA/ROCm availability | Major recalibration — unlock GPU inference |
| **Network conditions change** | Cloud latency shifts | Adjust local vs cloud threshold |
| **First run of the day** | Quick 5-second health check | Verify Ollama is running, check temps |
| **Manual trigger** | User runs `/calibrate` | Full 60-second recalibration |

---

## Portable Installation Flow

When someone clones from GitHub:

```bash
# 1. Clone
git clone https://github.com/yourname/agent-name.git
cd agent-name

# 2. One-command setup
python -m agent setup

# This automatically:
#   ✓ Detects Python version (requires 3.10+)
#   ✓ Creates virtual environment
#   ✓ Installs dependencies (tree-sitter, rich, textual, etc.)
#   ✓ Checks for Ollama (offers to install if missing)
#   ✓ Recommends and offers to pull best model for hardware
#   ✓ Runs 60-second calibration benchmark
#   ✓ Writes hardware_profile.json
#   ✓ Checks for cloud API keys (optional)
#   ✓ Prints summary and first-run instructions

# 3. Run
python -m agent
```

### Example First-Run Output

```
╔══════════════════════════════════════════════════════════════╗
║                    🔧 CALIBRATION COMPLETE                  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Hardware Tier:  T4 (Power)                                  ║
║  CPU:            Intel i9-13900H (14 cores, 5.4 GHz)         ║
║  RAM:            32 GB (22 GB available)                      ║
║  GPU:            None (CPU inference)                         ║
║  Disk:           512 GB NVMe SSD                              ║
║                                                              ║
║  ┌─────────────────────────────────────────────────────┐     ║
║  │  LOCAL MODELS                                       │     ║
║  │  ✓ qwen2.5-coder:7b    10.2 tok/s  (primary)       │     ║
║  │  ✓ qwen2.5-coder:1.5b  32.1 tok/s  (fast/router)   │     ║
║  └─────────────────────────────────────────────────────┘     ║
║                                                              ║
║  ┌─────────────────────────────────────────────────────┐     ║
║  │  CLOUD FALLBACK                                     │     ║
║  │  ✓ DeepSeek Flash       330ms latency  ($1.59 bal)  │     ║
║  └─────────────────────────────────────────────────────┘     ║
║                                                              ║
║  Strategy: Local-first with cloud fallback                   ║
║  Simple tasks  → qwen2.5-coder:1.5b (local, instant)        ║
║  Medium tasks  → qwen2.5-coder:7b (local, ~10 tok/s)        ║
║  Complex tasks → DeepSeek Flash (cloud, ~330ms)              ║
║                                                              ║
║  Estimated cost: $0.00/day (95% local) + ~$0.02/day cloud    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

Ready. Type your request or /help for commands.
```

---

## Open Design Questions

> [!IMPORTANT]
> 1. **Should calibration be mandatory on first run**, or should the agent work with sensible defaults and calibrate in the background?
> 2. **How aggressive should auto-pull be?** Should `python -m agent setup` automatically download a 4GB model without asking, or always confirm first?
> 3. **Should the profile be shared?** If the user has multiple projects, should they share one `~/.agent/hardware_profile.json` or have per-project profiles?
> 4. **Telemetry?** Should the agent anonymously report hardware tiers to help improve default recommendations (opt-in only)?
