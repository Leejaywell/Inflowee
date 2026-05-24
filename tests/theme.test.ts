/// <reference types="vitest/globals" />

import {
  THEME_IDS,
  getThemeCssVariables,
  normalizeAppearance,
  normalizeTheme,
  themePresets,
} from "@/lib/theme";

describe("theme helpers", () => {
  it("keeps five selectable presets", () => {
    expect(THEME_IDS).toEqual(["focus", "radar", "studio", "pulse", "ledger"]);
    expect(Object.keys(themePresets)).toHaveLength(5);
  });

  it("normalizes invalid theme preferences to defaults", () => {
    expect(normalizeTheme("radar")).toBe("radar");
    expect(normalizeTheme("unknown")).toBe("focus");
    expect(normalizeAppearance("dark")).toBe("dark");
    expect(normalizeAppearance("system")).toBe("light");
  });

  it("creates CSS variables for a concrete theme and mode", () => {
    expect(
      getThemeCssVariables({ theme: "studio", appearance: "dark" }),
    ).toMatchObject({
      "--app-bg": "#0d1118",
      "--app-surface": "#151b25",
      "--app-accent": "#ff735c",
      "--app-radius": "10px",
    });
  });
});
