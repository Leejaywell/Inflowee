/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest";

import { getSourcePresetById, sourcePresets } from "@/lib/source-presets";

describe("source presets", () => {
  it("includes domestic recruiting sources as structured job presets", () => {
    const domesticPresetIds = [
      "boss-zhipin",
      "zhilian-zhaopin",
      "51job",
      "liepin",
      "lagou",
      "maimai-jobs",
    ];

    for (const presetId of domesticPresetIds) {
      const preset = getSourcePresetById(presetId);

      expect(preset).toMatchObject({
        id: presetId,
        sourceType: "STRUCTURED",
        category: "jobs",
      });
      expect(preset?.url).toMatch(/^https:\/\//);
    }
  });

  it("keeps preset ids unique", () => {
    const ids = sourcePresets.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
