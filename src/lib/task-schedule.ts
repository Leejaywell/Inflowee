export type TaskSchedulePreset =
  | "always_on"
  | "morning_evening"
  | "office_hours"
  | "nightly_summary"
  | "custom";

export type TaskScheduleWindow = {
  id: string;
  days: number[];
  startMinutes: number;
  endMinutes: number;
  collect: boolean;
  generateBriefs: boolean;
  generateReports: boolean;
  push: boolean;
  reportMode: "current" | "daily" | "incremental";
  filterMode: "keyword" | "ai";
  maxPushItems: number;
};

export type TaskScheduleProfile = {
  preset: TaskSchedulePreset;
  timezone: string;
  windows: TaskScheduleWindow[];
};

const allDays = [0, 1, 2, 3, 4, 5, 6];
const weekdays = [1, 2, 3, 4, 5];

function windowOf(
  id: string,
  days: number[],
  startMinutes: number,
  endMinutes: number,
  overrides: Partial<TaskScheduleWindow> = {},
): TaskScheduleWindow {
  return {
    id,
    days,
    startMinutes,
    endMinutes,
    collect: true,
    generateBriefs: true,
    generateReports: false,
    push: false,
    reportMode: "current",
    filterMode: "keyword",
    maxPushItems: 5,
    ...overrides,
  };
}

export function buildSchedulePreset(
  preset: TaskSchedulePreset,
  timezone = "Asia/Shanghai",
): TaskScheduleProfile {
  if (preset === "morning_evening") {
    return {
      preset,
      timezone,
      windows: [
        windowOf("morning", allDays, 8 * 60, 10 * 60, {
          generateReports: true,
          push: true,
          reportMode: "incremental",
        }),
        windowOf("evening", allDays, 18 * 60, 21 * 60, {
          generateReports: true,
          push: true,
          reportMode: "daily",
        }),
      ],
    };
  }

  if (preset === "office_hours") {
    return {
      preset,
      timezone,
      windows: [windowOf("office-hours", weekdays, 9 * 60, 18 * 60)],
    };
  }

  if (preset === "nightly_summary") {
    return {
      preset,
      timezone,
      windows: [
        windowOf("daytime-collect", allDays, 8 * 60, 22 * 60, {
          generateBriefs: false,
        }),
        windowOf("nightly-summary", allDays, 22 * 60, 23 * 60 + 59, {
          generateReports: true,
          push: true,
          reportMode: "daily",
        }),
      ],
    };
  }

  return {
    preset: preset === "custom" ? "custom" : "always_on",
    timezone,
    windows: [windowOf("always-on", allDays, 0, 24 * 60)],
  };
}

export function validateScheduleProfile(profile: TaskScheduleProfile): string[] {
  const errors: string[] = [];

  for (const window of profile.windows) {
    if (window.startMinutes < 0 || window.startMinutes >= 24 * 60) {
      errors.push(`${window.id} start time is invalid.`);
    }
    if (window.endMinutes <= 0 || window.endMinutes > 24 * 60) {
      errors.push(`${window.id} end time is invalid.`);
    }
    if (window.startMinutes === window.endMinutes) {
      errors.push(`${window.id} cannot have identical start and end times.`);
    }
    if (window.days.some((day) => day < 0 || day > 6 || !Number.isInteger(day))) {
      errors.push(`${window.id} has invalid days.`);
    }
  }

  const sameDayWindows = profile.windows.filter(
    (window) => window.startMinutes < window.endMinutes,
  );
  for (let i = 0; i < sameDayWindows.length; i++) {
    for (let j = i + 1; j < sameDayWindows.length; j++) {
      const a = sameDayWindows[i];
      const b = sameDayWindows[j];
      const shareDay = a.days.some((day) => b.days.includes(day));
      const overlap = a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
      if (shareDay && overlap) {
        errors.push(`${a.id} overlaps ${b.id}.`);
      }
    }
  }

  return errors;
}

function minutesInTimezone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);

  return {
    day: day >= 0 ? day : 0,
    minutes: hour * 60 + minute,
  };
}

export function getActiveScheduleWindow(
  profile: TaskScheduleProfile | null | undefined,
  now = new Date(),
) {
  if (!profile) {
    return buildSchedulePreset("always_on").windows[0];
  }

  const { day, minutes } = minutesInTimezone(now, profile.timezone);

  return (
    profile.windows.find((window) => {
      if (!window.days.includes(day)) {
        return false;
      }

      if (window.startMinutes < window.endMinutes) {
        return minutes >= window.startMinutes && minutes < window.endMinutes;
      }

      return minutes >= window.startMinutes || minutes < window.endMinutes;
    }) ?? null
  );
}

export function shouldCollectForSchedule(
  profile: TaskScheduleProfile | null | undefined,
  now = new Date(),
) {
  return getActiveScheduleWindow(profile, now)?.collect ?? false;
}
