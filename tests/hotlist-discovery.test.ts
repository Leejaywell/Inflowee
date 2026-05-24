/// <reference types="vitest/globals" />

import { describe, expect, it, vi } from "vitest";

import {
  buildHotlistSourceConfig,
  discoverHotlistCandidates,
} from "@/lib/hotlist-discovery";
import type { SourceRecord, TaskRecord } from "@/lib/store";

const task = {
  id: "task-1",
  title: "AI coding tools",
  userPrompt: "Monitor AI coding tools",
  taskProfile: {
    suggestedQueries: ["AI coding agents"],
  },
} as TaskRecord;

describe("hotlist discovery", () => {
  it("builds default hotlist provider config from the task", () => {
    const config = buildHotlistSourceConfig(task);

    expect(config.providers).toEqual(["baidu", "weibo", "zhihu", "bilibili"]);
    expect(config.queries).toContain("AI coding agents");
    expect(config.totalQuota).toBe(60);
  });

  it("normalizes multiple hotlist providers into candidates", async () => {
    const source = {
      id: "source-1",
      sourceType: "HOTLIST_DISCOVERY",
      configJson: {
        providers: ["baidu", "weibo"],
        providerQuota: 2,
        totalQuota: 4,
      },
    } as Partial<SourceRecord> as SourceRecord;
    const fetchSourceFeedImpl = vi.fn(async (url: string) => {
      if (url.includes("baidu")) {
        return `
          <html><body>
            <div class="hot-list">
              <a href="/item/1">AI 编程工具融资</a><span>热度 123万</span>
              <a href="/item/2">普通娱乐新闻</a><span>热度 50万</span>
            </div>
          </body></html>`;
      }

      return `
        <html><body>
          <div class="rank-list">
            <a href="/weibo?q=ai">AI agent 产品发布</a><span>9988</span>
          </div>
        </body></html>`;
    });

    const result = await discoverHotlistCandidates(task, source, {
      fetchSourceFeedImpl: fetchSourceFeedImpl as never,
    });

    expect(fetchSourceFeedImpl).toHaveBeenCalledTimes(2);
    expect(result.failures).toEqual([]);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]).toMatchObject({
      title: "AI 编程工具融资",
      sourceNativeScore: 1_230_000,
      structuredFields: {
        sourceProvider: "baidu",
        platform: "Baidu Hot Search",
        rank: 1,
        hotScore: 1_230_000,
      },
    });
    expect(result.candidates[2]).toMatchObject({
      title: "AI agent 产品发布",
      structuredFields: {
        sourceProvider: "weibo",
        platform: "Weibo Hot Search",
      },
    });
  });

  it("keeps provider failures isolated when another hotlist provider succeeds", async () => {
    const source = {
      id: "source-1",
      sourceType: "HOTLIST_DISCOVERY",
      configJson: {
        providers: ["baidu", "zhihu"],
        providerQuota: 2,
        totalQuota: 4,
      },
    } as Partial<SourceRecord> as SourceRecord;
    const fetchSourceFeedImpl = vi.fn(async (url: string) => {
      if (url.includes("zhihu")) {
        throw new Error("blocked");
      }

      return `<html><body><li><a href="/a">AI 热点</a><span>42</span></li></body></html>`;
    });

    const result = await discoverHotlistCandidates(task, source, {
      fetchSourceFeedImpl: fetchSourceFeedImpl as never,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.failures).toEqual([{ provider: "zhihu", error: "blocked" }]);
  });
});
