import { describe, expect, it } from "bun:test";
import { getTheme, buildBanner, THEMES } from "../src/theme.js";

describe("UI theme", () => {
  it("exposes all themes", () => {
    expect(Object.keys(THEMES).sort()).toEqual(["cyberpunk", "minimal", "ocean", "sunset"]);
  });

  it("falls back to the default theme for unknown names", () => {
    expect(getTheme("cyberpunk").id).toBe("cyberpunk");
    expect(getTheme(undefined).id).toBe("cyberpunk");
    expect(getTheme("nonsense" as any).id).toBe("cyberpunk");
  });

  it("builds a non-empty banner with the tagline", () => {
    const banner = buildBanner(getTheme("ocean"));
    expect(banner.length).toBeGreaterThan(0);
    expect(banner).toContain("Shape-shifts to your hardware");
  });
});
