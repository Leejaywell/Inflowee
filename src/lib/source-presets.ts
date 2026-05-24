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
    id: "boss-zhipin",
    title: "BOSS 直聘",
    description: "Domestic China job listings and hiring signals from BOSS Zhipin.",
    url: "https://www.zhipin.com/web/geek/job",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "zhilian-zhaopin",
    title: "智联招聘",
    description: "Broad China recruiting listings from Zhaopin search.",
    url: "https://sou.zhaopin.com/",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "51job",
    title: "前程无忧 51job",
    description: "China job listings from 51job search pages.",
    url: "https://we.51job.com/pc/search",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "liepin",
    title: "猎聘",
    description: "Mid-to-senior China hiring listings and company recruitment signals.",
    url: "https://www.liepin.com/zhaopin/",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "lagou",
    title: "拉勾招聘",
    description: "Internet and technology hiring listings from Lagou.",
    url: "https://www.lagou.com/wn/jobs",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
  {
    id: "maimai-jobs",
    title: "脉脉招聘",
    description: "Professional network hiring signals from Maimai jobs.",
    url: "https://maimai.cn/jobs/",
    sourceType: "STRUCTURED",
    category: "jobs",
  },
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
