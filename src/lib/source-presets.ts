import type { SourceType } from "@/lib/store";

export type SourcePreset = {
  id: string;
  title: string;
  description: string;
  url: string;
  sourceType: SourceType;
  category: "jobs";
};

export const sourcePresets: SourcePreset[] = [
  {
    id: "remotejobscn",
    title: "Remote Jobs China",
    description: "Chinese remote-first engineering and product roles.",
    url: "https://remotejobscn.com/",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "wellfound-remote",
    title: "Wellfound Remote Jobs",
    description: "Startup-focused remote job listings.",
    url: "https://wellfound.com/remote",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "we-work-remotely",
    title: "We Work Remotely",
    description: "Large public remote job board for engineering and design.",
    url: "https://weworkremotely.com/remote-jobs",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "remoteok-dev",
    title: "RemoteOK Dev Jobs",
    description: "Developer-focused remote jobs with fast-moving listings.",
    url: "https://remoteok.com/remote-dev-jobs",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "remotive-software-dev",
    title: "Remotive Software Dev Jobs",
    description: "Remote software engineering roles from a curated board.",
    url: "https://remotive.com/remote-jobs/software-dev",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "yc-jobs",
    title: "Y Combinator Jobs",
    description: "Startup hiring signals from the YC company network.",
    url: "https://www.ycombinator.com/jobs",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "hacker-news-jobs",
    title: "Hacker News Jobs",
    description: "Community-curated hiring and monthly startup job threads.",
    url: "https://news.ycombinator.com/jobs",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
];

export function getSourcePresetById(presetId: string): SourcePreset | null {
  return sourcePresets.find((preset) => preset.id === presetId) ?? null;
}
