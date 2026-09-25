export function normalizeCommand(command: string): string {
  return command
    .replace(/\\(?=[a-zA-Z])/g, "")
    .replace(/['"]/g, "")
    .replace(/\$\{?IFS\}?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Catastrophic command patterns that must never run, regardless of permission
 * level or alwaysAllow. Input is normalized first (quotes/backslashes/$IFS).
 */
export const DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
  // recursive/forced rm targeting filesystem root, a home dir, or cwd
  /\brm\s+(?:-[a-z]*[rf][a-z]*\s+)+(?:--no-preserve-root\s+)?(?:\/\S*|~\S*|\$HOME\S*|\$\{HOME\}\S*|\.(?=\s|$))(?=\s|$)/i,
  /\bmkfs(\.[a-z0-9]+)?\b/i,
  /\bdd\s+[^\n]*of=\/dev\/(sd[a-z]|nvme[0-9]|hd[a-z]|vd[a-z])/i,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/,
  /\b\w+\s*\(\s*\)\s*\{\s*\w+\s*\|\s*\w+\s*&/,
  />\s*\/dev\/[sh]d[a-z]/,
  /\bchmod\s+(?:-[a-z]*R[a-z]*\s+)?(?:777|000)\s+\/(?:\s|$)/i,
];

export function containsDestructiveCommand(command: string): boolean {
  const normalized = normalizeCommand(command);
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}
