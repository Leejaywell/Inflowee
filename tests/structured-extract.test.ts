/// <reference types="vitest/globals" />

import {
  extractStructuredList,
  extractStructuredListDiagnostics,
} from "@/lib/structured-extract";

describe("Structured List Ingestion Extractor", () => {
  it("extracts items from HTML with lists using heuristics", async () => {
    const html = `
      <html>
        <body>
          <div class="content">
            <h1>Active YC Startups</h1>
            <ul>
              <li class="item">
                <a href="/launches/devin">Devin AI Code Agent</a>
                <p class="description">Autonomous software developer sandbox environment for coding.</p>
              </li>
              <li class="item">
                <a href="/launches/cursor">Cursor IDE Editor</a>
                <p class="description">An AI-first code editor fork of VS Code with codebase context index.</p>
              </li>
              <li class="item">
                <a href="/launches/inflowee">Inflowee Automations</a>
                <p class="description">Local-first grounded feed curation and intelligence dashboard engine.</p>
              </li>
            </ul>
          </div>
        </body>
      </html>
    `;

    const items = await extractStructuredList(html, "https://www.ycombinator.com");

    expect(items).toHaveLength(3);
    
    expect(items[0]).toEqual({
      title: "Devin AI Code Agent",
      canonicalUrl: "https://www.ycombinator.com/launches/devin",
      summary: "Autonomous software developer sandbox environment for coding.",
      publishedAt: expect.any(String),
    });

    expect(items[1]).toEqual({
      title: "Cursor IDE Editor",
      canonicalUrl: "https://www.ycombinator.com/launches/cursor",
      summary: "An AI-first code editor fork of VS Code with codebase context index.",
      publishedAt: expect.any(String),
    });

    expect(items[2]).toEqual({
      title: "Inflowee Automations",
      canonicalUrl: "https://www.ycombinator.com/launches/inflowee",
      summary: "Local-first grounded feed curation and intelligence dashboard engine.",
      publishedAt: expect.any(String),
    });
  });

  it("extracts from table rows correctly as repeating blocks", async () => {
    const html = `
      <table>
        <tbody>
          <tr class="post">
            <td>
              <a href="https://news.ycombinator.com/item?id=123">Show HN: Antigravity Compiler</a>
            </td>
            <td>An agentic compiler built for superfast code generations.</td>
          </tr>
          <tr class="post">
            <td>
              <a href="https://news.ycombinator.com/item?id=456">Show HN: Inflowee SQLite Store</a>
            </td>
            <td>Simple and fast database abstraction for server side JS.</td>
          </tr>
        </tbody>
      </table>
    `;

    const items = await extractStructuredList(html, "https://news.ycombinator.com");

    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Show HN: Antigravity Compiler");
    expect(items[0].canonicalUrl).toBe("https://news.ycombinator.com/item?id=123");
    expect(items[1].title).toBe("Show HN: Inflowee SQLite Store");
    expect(items[1].canonicalUrl).toBe("https://news.ycombinator.com/item?id=456");
  });

  it("extracts domestic job board cards with job class names", async () => {
    const html = `
      <html>
        <body>
          <div class="job-list">
            <div class="job-card">
              <a href="/job_detail/1.html">
                <span class="job-name">AI 产品经理</span>
              </a>
              <p class="description">负责 AI 编程工具产品规划和增长。</p>
            </div>
            <div class="job-card">
              <a href="/job_detail/2.html">
                <span class="job-name">LLM 应用工程师</span>
              </a>
              <p class="description">建设企业级智能体应用。</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const items = await extractStructuredList(html, "https://www.zhipin.com/web/geek/job");

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "AI 产品经理",
      canonicalUrl: "https://www.zhipin.com/job_detail/1.html",
      summary: "负责 AI 编程工具产品规划和增长。",
    });
    expect(items[1]).toMatchObject({
      title: "LLM 应用工程师",
      canonicalUrl: "https://www.zhipin.com/job_detail/2.html",
      summary: "建设企业级智能体应用。",
    });
  });

  it("returns extraction warnings alongside structured fields", async () => {
    const html = `
      <html>
        <body>
          <ul>
            <li class="item">
              <a href="/jobs/1">Founding engineer</a>
            </li>
          </ul>
        </body>
      </html>
    `;

    const result = await extractStructuredListDiagnostics(
      html,
      "https://example.com/jobs",
    );

    expect(result.items).toHaveLength(1);
    expect(result.warnings).toContain("missing summary on one or more items");
    expect(result.warnings).toContain("missing published date");
  });
});
