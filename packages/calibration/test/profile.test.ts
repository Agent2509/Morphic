import { describe, expect, it } from "bun:test";
import { isValidProfile } from "../src/profile.js";

const valid = {
  version: "1.0",
  tier: "T4",
  hardware: {},
  runtimeConfig: {
    primaryLocalModel: "qwen2.5-coder:7b",
    fastLocalModel: "fauma:3b",
    contextWindow: 32768,
  },
};

describe("isValidProfile", () => {
  it("accepts a well-formed profile", () => {
    expect(isValidProfile(valid)).toBe(true);
  });

  it("rejects malformed profiles", () => {
    expect(isValidProfile(null)).toBe(false);
    expect(isValidProfile({})).toBe(false);
    expect(isValidProfile({ ...valid, version: "0.9" })).toBe(false);
    expect(isValidProfile({ ...valid, tier: "T9" })).toBe(false);
    expect(isValidProfile({ ...valid, runtimeConfig: {} })).toBe(false);
    expect(isValidProfile({ ...valid, runtimeConfig: { ...valid.runtimeConfig, contextWindow: "big" } })).toBe(false);
  });
});
