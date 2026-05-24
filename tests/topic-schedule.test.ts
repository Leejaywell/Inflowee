/// <reference types="vitest/globals" />

import {
  buildSchedulePreset,
  getActiveScheduleWindow,
  shouldCollectForSchedule,
  validateScheduleProfile,
  type TopicScheduleProfile,
} from "@/lib/topic-schedule";

describe("topic schedule profiles", () => {
  it("builds preset windows and matches the active collection window", () => {
    const profile = buildSchedulePreset("office_hours", "Asia/Shanghai");

    expect(validateScheduleProfile(profile)).toEqual([]);
    expect(
      shouldCollectForSchedule(profile, new Date("2026-05-25T02:00:00.000Z")),
    ).toBe(true);
    expect(
      shouldCollectForSchedule(profile, new Date("2026-05-25T00:00:00.000Z")),
    ).toBe(false);
  });

  it("supports cross-midnight windows", () => {
    const profile: TopicScheduleProfile = {
      preset: "custom",
      timezone: "Asia/Shanghai",
      windows: [
        {
          id: "overnight",
          days: [1],
          startMinutes: 22 * 60,
          endMinutes: 2 * 60,
          collect: true,
          generateBriefs: true,
          generateReports: false,
          push: false,
          reportMode: "current",
          filterMode: "keyword",
          maxPushItems: 5,
        },
      ],
    };

    expect(
      getActiveScheduleWindow(profile, new Date("2026-05-25T15:00:00.000Z"))
        ?.id,
    ).toBe("overnight");
  });

  it("rejects overlapping same-day windows", () => {
    const profile: TopicScheduleProfile = {
      preset: "custom",
      timezone: "Asia/Shanghai",
      windows: [
        {
          id: "first",
          days: [1],
          startMinutes: 9 * 60,
          endMinutes: 12 * 60,
          collect: true,
          generateBriefs: true,
          generateReports: false,
          push: false,
          reportMode: "current",
          filterMode: "keyword",
          maxPushItems: 5,
        },
        {
          id: "second",
          days: [1],
          startMinutes: 11 * 60,
          endMinutes: 13 * 60,
          collect: true,
          generateBriefs: true,
          generateReports: false,
          push: false,
          reportMode: "current",
          filterMode: "keyword",
          maxPushItems: 5,
        },
      ],
    };

    expect(validateScheduleProfile(profile)).toContain("first overlaps second.");
  });
});
