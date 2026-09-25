export interface TokenMessage {
  content?: string | null;
  tool_calls?: unknown;
}

const DEFAULT_CHARS_PER_TOKEN = 3.8;

export function estimateTokens(
  messages: readonly TokenMessage[],
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN
): number {
  let charCount = 0;
  for (const msg of messages) {
    if (msg.content) charCount += msg.content.length;
    if (msg.tool_calls) charCount += JSON.stringify(msg.tool_calls).length;
    // Per-message overhead (role, name, delimiters).
    charCount += 12;
  }
  return Math.ceil(charCount / charsPerToken);
}
