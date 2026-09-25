import { describe, expect, it } from "bun:test";
import { SecretScanner } from "../src/scanner.js";

describe("SecretScanner extended patterns", () => {
  const scanner = new SecretScanner();

  it("detects Anthropic, DeepSeek, JWT bearer and generic credentials", () => {
    expect(scanner.hasSecrets("sk-ant-abcdefghijklmnopqrstuvwxyz012345")).toBe(true);
    expect(scanner.hasSecrets("sk-0123456789abcdef0123456789abcdef")).toBe(true);
    expect(
      scanner.hasSecrets("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig1234567890")
    ).toBe(true);
    expect(scanner.hasSecrets('password="hunter2secret"')).toBe(true);
    expect(scanner.hasSecrets('api_key="abcdefgh12345678"')).toBe(true);
  });

  it("redacts without leaking the raw credential", () => {
    const jwt =
      "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig1234567890";
    const clean = scanner.sanitize(`auth: ${jwt}`);
    expect(clean).toContain("[REDACTED_JWT_TOKEN]");
    expect(clean).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("returns matches with type and index", () => {
    const matches = scanner.detect("token sk-ant-abcdefghijklmnopqrstuvwxyz012345 end");
    expect(matches[0].type).toBe("anthropic_key");
    expect(matches[0].startIndex).toBeGreaterThan(0);
  });

  it("does not flag ordinary text", () => {
    expect(scanner.hasSecrets("just some normal developer notes")).toBe(false);
    expect(scanner.sanitize("")).toBe("");
  });
});
