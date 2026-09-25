import type { SecretMatch, SecretType } from "./types.js";

interface SecretPattern {
  type: SecretType;
  regex: RegExp;
  mask: (match: string) => string;
}

export class SecretScanner {
  private patterns: SecretPattern[] = [
    {
      type: "private_key",
      regex: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
      mask: () => "[REDACTED_PRIVATE_KEY]",
    },
    {
      type: "anthropic_key",
      regex: /\b(sk-ant-[a-zA-Z0-9_-]{20,})\b/g,
      mask: (m) => `${m.slice(0, 8)}...[REDACTED_ANTHROPIC_KEY]...${m.slice(-3)}`,
    },
    {
      type: "deepseek_key",
      regex: /\b(sk-[a-f0-9]{32})\b/g,
      mask: (m) => `${m.slice(0, 6)}...[REDACTED_DEEPSEEK_KEY]...${m.slice(-3)}`,
    },
    {
      type: "openai_key",
      regex: /\b(sk-(?!ant-)[a-zA-Z0-9_-]{20,}|sk-proj-[a-zA-Z0-9_-]{20,})\b/g,
      mask: (m) => `${m.slice(0, 5)}...[REDACTED_OPENAI_KEY]...${m.slice(-3)}`,
    },
    {
      type: "github_pat",
      regex: /\b(ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{40,})\b/g,
      mask: (m) => `${m.slice(0, 6)}...[REDACTED_GITHUB_TOKEN]`,
    },
    {
      type: "aws_key",
      regex: /\b(AKIA[0-9A-Z]{16})\b/g,
      mask: (m) => `${m.slice(0, 4)}...[REDACTED_AWS_KEY]`,
    },
    {
      type: "bearer_token",
      regex: /\bBearer\s+([a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_.]+)\b/g,
      mask: () => "Bearer [REDACTED_JWT_TOKEN]",
    },
    {
      type: "generic_secret",
      regex: /(?:password|secret|api_key|token)\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
      mask: (m) => m.replace(/["']([^"'\s]{8,})["']/, '="[REDACTED_CREDENTIAL]"'),
    },
  ];

  detect(text: string): SecretMatch[] {
    const matches: SecretMatch[] = [];

    for (const p of this.patterns) {
      p.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = p.regex.exec(text)) !== null) {
        matches.push({
          type: p.type,
          raw: match[0],
          redacted: p.mask(match[0]),
          startIndex: match.index,
        });
      }
    }

    return matches;
  }

  sanitize(text: string): string {
    if (!text) return text;
    let result = text;

    for (const p of this.patterns) {
      p.regex.lastIndex = 0;
      result = result.replace(p.regex, (m) => p.mask(m));
    }

    return result;
  }

  hasSecrets(text: string): boolean {
    return this.detect(text).length > 0;
  }
}
