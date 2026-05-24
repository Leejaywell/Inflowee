import {
  deliverTextToChannel,
  listConfiguredDeliveryChannels,
  type DeliveryChannel,
} from "@/lib/delivery";
import { generateTaskReport } from "@/lib/reports";
import {
  getBriefById,
  getReportById,
  hasBriefOwner,
  hasTaskOwner,
  listBriefsFiltered,
  listItemsBySource,
  listReportsByTask,
  listSources,
  listTasks,
  type BriefRecord,
  type ItemRecord,
  type ReportMode,
  type Store,
} from "@/lib/store";

export type McpToolName =
  | "list_tasks"
  | "search_items"
  | "list_briefs"
  | "read_brief"
  | "read_item"
  | "generate_report"
  | "send_report";

export type McpToolContext = {
  store: Store;
  actorId: string;
  allowActions?: boolean;
};

export type McpToolResponse<T = unknown> = {
  success: boolean;
  summary: string;
  data?: T;
  error?: string;
};

export const INFLOWEE_MCP_TOOLS: Array<{
  name: McpToolName;
  readOnly: boolean;
  description: string;
}> = [
  {
    name: "list_tasks",
    readOnly: true,
    description: "List monitoring tasks for the current actor.",
  },
  {
    name: "search_items",
    readOnly: true,
    description: "Search actor-scoped stored items and return citations.",
  },
  {
    name: "list_briefs",
    readOnly: true,
    description: "List actor-scoped briefs, optionally filtered by task.",
  },
  {
    name: "read_brief",
    readOnly: true,
    description: "Read one actor-scoped brief.",
  },
  {
    name: "read_item",
    readOnly: true,
    description: "Read one actor-scoped stored item.",
  },
  {
    name: "generate_report",
    readOnly: false,
    description: "Generate a task report when action tools are enabled.",
  },
  {
    name: "send_report",
    readOnly: false,
    description: "Send a report to an already configured delivery channel.",
  },
];

function getString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value : "";
}

function getLimit(input: Record<string, unknown>, fallback: number) {
  const value = input.limit;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(50, Math.trunc(value)))
    : fallback;
}

function ensureActionsAllowed(context: McpToolContext): McpToolResponse {
  if (context.allowActions) {
    return {
      success: true,
      summary: "Action tools are enabled.",
    };
  }

  return {
    success: false,
    summary: "Action tools are disabled.",
    error: "MCP write/action tools require explicit server configuration.",
  };
}

function itemMatches(item: ItemRecord, query: string) {
  const normalized = query.toLowerCase();
  const haystack = [
    item.title,
    item.summary,
    item.rawContent,
    item.origin,
    item.authorName,
    item.authorUsername,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return haystack.includes(normalized);
}

async function listActorItems(context: McpToolContext) {
  const sources = await listSources(context.store, { actorId: context.actorId });
  const groups = await Promise.all(
    sources.map(async (source) => ({
      source,
      items: await listItemsBySource(context.store, source.id),
    })),
  );

  return groups.flatMap(({ source, items }) =>
    items.map((item) => ({
      ...item,
      sourceTitle: source.title,
      sourceUrl: source.url,
    })),
  );
}

function summarizeBrief(brief: BriefRecord) {
  return {
    id: brief.id,
    taskId: brief.taskId,
    taskTitle: brief.taskTitle,
    title: brief.title,
    summary: brief.summary,
    whyItMatters: brief.whyItMatters,
    sourceCitations: brief.sourceCitations,
    relevanceScore: brief.relevanceScore,
    importanceScore: brief.importanceScore,
    tags: brief.tags,
    createdAt: brief.createdAt,
  };
}

export async function listMcpResources(context: McpToolContext) {
  const tasks = await listTasks(context.store, { actorId: context.actorId });
  const [sources, deliveryChannels] = await Promise.all([
    listSources(context.store, { actorId: context.actorId }),
    listConfiguredDeliveryChannels(context.store),
  ]);
  const reportGroups = await Promise.all(
    tasks.map((task) => listReportsByTask(context.store, task.id)),
  );

  return {
    tasks,
    sources,
    briefs: await listBriefsFiltered(context.store, { actorId: context.actorId }),
    reports: reportGroups.flat(),
    deliveryChannels,
  };
}

export async function runInfloweeMcpTool(
  context: McpToolContext,
  toolName: McpToolName,
  input: Record<string, unknown> = {},
): Promise<McpToolResponse> {
  if (toolName === "list_tasks") {
    const tasks = await listTasks(context.store, { actorId: context.actorId });
    return {
      success: true,
      summary: `Found ${tasks.length} task(s).`,
      data: tasks,
    };
  }

  if (toolName === "list_briefs") {
    const taskId = getString(input, "taskId");

    if (taskId && !(await hasTaskOwner(context.store, context.actorId, taskId))) {
      return {
        success: false,
        summary: "Task is not accessible.",
        error: "Task not found for the current actor.",
      };
    }

    const briefs = await listBriefsFiltered(context.store, {
      actorId: context.actorId,
      ...(taskId ? { taskId } : {}),
    });

    return {
      success: true,
      summary: `Found ${briefs.length} brief(s).`,
      data: briefs.map(summarizeBrief),
    };
  }

  if (toolName === "read_brief") {
    const briefId = getString(input, "briefId");

    if (!(await hasBriefOwner(context.store, context.actorId, briefId))) {
      return {
        success: false,
        summary: "Brief is not accessible.",
        error: "Brief not found for the current actor.",
      };
    }

    const brief = await getBriefById(context.store, briefId, {
      actorId: context.actorId,
    });

    return {
      success: true,
      summary: brief ? `Read brief ${brief.title}.` : "Brief not found.",
      data: brief ? summarizeBrief(brief) : null,
    };
  }

  if (toolName === "search_items") {
    const query = getString(input, "query");
    const limit = getLimit(input, 10);
    const items = (await listActorItems(context))
      .filter((item) => (query ? itemMatches(item, query) : true))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        sourceId: item.sourceId,
        sourceTitle: item.sourceTitle,
        title: item.title,
        summary: item.summary,
        citation: item.canonicalUrl,
        publishedAt: item.publishedAt,
        relevanceScore: item.relevanceScore,
      }));

    return {
      success: true,
      summary: `Found ${items.length} matching item(s).`,
      data: items,
    };
  }

  if (toolName === "read_item") {
    const itemId = getString(input, "itemId");
    const item = (await listActorItems(context)).find(
      (candidate) => candidate.id === itemId,
    );

    return item
      ? {
          success: true,
          summary: `Read item ${item.title}.`,
          data: {
            ...item,
            citation: item.canonicalUrl,
          },
        }
      : {
          success: false,
          summary: "Item is not accessible.",
          error: "Item not found for the current actor.",
        };
  }

  if (toolName === "generate_report") {
    const allowed = ensureActionsAllowed(context);

    if (!allowed.success) {
      return allowed;
    }

    const taskId = getString(input, "taskId");
    const mode = getString(input, "mode") as ReportMode;

    if (!(await hasTaskOwner(context.store, context.actorId, taskId))) {
      return {
        success: false,
        summary: "Task is not accessible.",
        error: "Task not found for the current actor.",
      };
    }

    if (!["current", "daily", "incremental"].includes(mode)) {
      return {
        success: false,
        summary: "Report mode is invalid.",
        error: "Use current, daily, or incremental.",
      };
    }

    const reportId = await generateTaskReport(context.store, taskId, { mode });
    const report = await getReportById(context.store, reportId);

    return {
      success: true,
      summary: report
        ? `Generated report ${report.title}.`
        : `Generated report ${reportId}.`,
      data: report ?? { id: reportId },
    };
  }

  if (toolName === "send_report") {
    const allowed = ensureActionsAllowed(context);

    if (!allowed.success) {
      return allowed;
    }

    const reportId = getString(input, "reportId");
    const channel = getString(input, "channel") as DeliveryChannel;
    const report = await getReportById(context.store, reportId);

    if (
      !report ||
      !(await hasTaskOwner(context.store, context.actorId, report.taskId))
    ) {
      return {
        success: false,
        summary: "Report is not accessible.",
        error: "Report not found for the current actor.",
      };
    }

    const deliveryChannel = (await listConfiguredDeliveryChannels(context.store)).find(
      (candidate) => candidate.type === channel,
    );

    if (!deliveryChannel?.enabled) {
      return {
        success: false,
        summary: "Delivery channel is not configured.",
        error: "send_report can only use already configured delivery channels.",
      };
    }

    const result = await deliverTextToChannel(
      context.store,
      channel,
      {
        id: report.id,
        title: report.title,
        body: report.markdown,
        contentType: "report",
      },
      { maxAttempts: 1 },
    );

    return {
      success: result.status === "success",
      summary:
        result.status === "success"
          ? `Sent report ${report.title} to ${channel}.`
          : `Failed to send report ${report.title} to ${channel}.`,
      data: result,
      error: result.status === "error" ? result.error : undefined,
    };
  }

  return {
    success: false,
    summary: "Unknown MCP tool.",
    error: `Unsupported tool: ${toolName}`,
  };
}
