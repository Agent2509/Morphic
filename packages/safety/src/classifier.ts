import type { CommandAssessment, CommandRiskLevel } from "./types.js";
import { containsDestructiveCommand, normalizeCommand } from "@morphic/shared";

interface Rule {
  name: string;
  pattern: RegExp;
  risk: CommandRiskLevel;
  score: number;
  reason: string;
  isBlocked?: boolean;
}

export class CommandClassifier {
  private rules: Rule[] = [
    // BLOCKED RULES (Score 10)
    {
      name: "root_wipe",
      pattern:
        /\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*\s+(--no-preserve-root\s+)?(\/|~|\$HOME|\$\{HOME\}|\.)(\/\*?)?(\s|$)/,
      risk: "blocked",
      score: 10,
      reason: "Attempts recursive deletion of root filesystem or entire home directory.",
      isBlocked: true,
    },
    {
      name: "fork_bomb",
      pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:|\bforkbomb\b|\w+\s*\(\s*\)\s*\{\s*\w+\s*\|\s*\w+\s*&/,
      risk: "blocked",
      score: 10,
      reason: "Contains a bash fork bomb denial-of-service attack.",
      isBlocked: true,
    },
    {
      name: "raw_disk_format",
      pattern: /\bmkfs(\.[a-z0-9]+)?\s+\/dev\/(sd[a-z]|nvme[0-9]|hd[a-z]|vd[a-z])/i,
      risk: "blocked",
      score: 10,
      reason: "Attempts to overwrite or format a raw disk block device.",
      isBlocked: true,
    },
    {
      name: "dd_raw_write",
      pattern: /\bdd\s+.*of=\/dev\/(sd[a-z]|nvme[0-9]|hd[a-z]|vd[a-z])/i,
      risk: "blocked",
      score: 10,
      reason: "Direct raw block device overwriting via dd.",
      isBlocked: true,
    },
    {
      name: "system_shadow_read",
      pattern:
        /\b(cat|head|tail|less|more|base64|xxd|dd|cp|grep|strings|awk|sed|tar)\b[^|;]*(etc\/shadow|etc\/gshadow|var\/log\/auth\.log)/,
      risk: "blocked",
      score: 10,
      reason: "Attempts to read system authentication shadow file.",
      isBlocked: true,
    },
    {
      name: "ssh_private_key_leak",
      pattern:
        /\b(cat|head|tail|less|more|base64|xxd|dd|cp|grep|strings|awk|sed|tar)\b[^|;]*\.ssh\/(id_rsa|id_ed25519|id_ecdsa|id_dsa)/,
      risk: "blocked",
      score: 10,
      reason: "Attempts to dump private SSH identity keys.",
      isBlocked: true,
    },
    {
      name: "chmod_root_break",
      pattern: /\bchmod\s+(-[a-zA-Z]*R[a-zA-Z]*\s+)?(777|000)\s+(\/|\/etc|\/usr|\/bin)(\s|$)/,
      risk: "blocked",
      score: 10,
      reason: "Catastrophic global permission modification on system root directories.",
      isBlocked: true,
    },

    // DANGEROUS RULES (Score 7-9)
    {
      name: "pipe_curl_bash",
      pattern:
        /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(bash|sh|zsh|python[0-9.]*|perl|ruby|node)\b/i,
      risk: "dangerous",
      score: 9,
      reason: "Piping unverified internet script directly into shell interpreter.",
    },
    {
      name: "download_then_exec",
      pattern:
        /\b(curl|wget)\b[^;&|]*(>>?|-O)\s*[^;&|]+[;&|]+\s*(sudo\s+)?(bash|sh|zsh)\b/i,
      risk: "dangerous",
      score: 9,
      reason: "Downloads a remote script and executes it in a separate shell.",
    },
    {
      name: "system_power_control",
      pattern: /\b(shutdown|reboot|poweroff|init\s+0|halt)\b/,
      risk: "dangerous",
      score: 9,
      reason: "Attempts to power off or reboot host machine.",
    },
    {
      name: "remote_eval",
      pattern: /\beval\s+\$\((curl|wget)\b/i,
      risk: "dangerous",
      score: 8,
      reason: "Dynamic evaluation of remote script payload.",
    },
    {
      name: "kill_all_procs",
      pattern: /\b(killall\s+-9|pkill\s+-9\s+-f\s+python|pkill\s+-9\s+-f\s+node)\b/,
      risk: "dangerous",
      score: 7,
      reason: "Aggressive process termination that may disrupt host services.",
    },

    // CAUTION RULES (Score 4-6)
    {
      name: "git_destructive",
      pattern:
        /\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f[a-zA-Z]*|push\s+[^\n]*--force(?!-with-lease))\b/,
      risk: "caution",
      score: 6,
      reason: "Destructive git operation that discards uncommitted work or rewrites history.",
    },
    {
      name: "recursive_rm",
      pattern: /\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*\s+/,
      risk: "caution",
      score: 5,
      reason: "Recursive directory deletion.",
    },
    {
      name: "sudo_invocation",
      pattern: /\bsudo\s+/,
      risk: "caution",
      score: 5,
      reason: "Requires superuser administrative privilege escalation.",
    },
    {
      name: "global_package_install",
      pattern: /\b(npm\s+i(nstall)?\s+-g|pip\s+install\s+--user)\b/,
      risk: "caution",
      score: 4,
      reason: "Modifies global system environment packages outside local project.",
    },
  ];

  private normalize(command: string): string {
    return normalizeCommand(command);
  }

  assess(command: string): CommandAssessment {
    const trimmed = command.trim();
    const normalized = this.normalize(trimmed);

    if (containsDestructiveCommand(trimmed)) {
      return {
        command: trimmed,
        risk: "blocked",
        score: 10,
        reasons: ["Catastrophic destructive command detected."],
        isBlocked: true,
        requiresConfirmation: true,
      };
    }

    const reasons: string[] = [];
    let maxScore = 0;
    let risk: CommandRiskLevel = "safe";
    let isBlocked = false;

    for (const rule of this.rules) {
      if (rule.pattern.test(normalized)) {
        reasons.push(`[${rule.name}] ${rule.reason}`);
        if (rule.score >= maxScore) {
          maxScore = rule.score;
          risk = rule.risk;
        }
        if (rule.isBlocked) {
          isBlocked = true;
          risk = "blocked";
          maxScore = 10;
        }
      }
    }

    if (maxScore === 0) {
      // Safe commands
      risk = "safe";
      maxScore = 1;
    }

    const requiresConfirmation = maxScore >= 4;

    return {
      command: trimmed,
      risk,
      score: maxScore,
      reasons: reasons.length > 0 ? reasons : ["Command appears standard."],
      isBlocked,
      requiresConfirmation,
    };
  }
}
