export const LOCALE_COOKIE_NAME = "inflowee_locale";
export const SUPPORTED_LOCALES = ["zh", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const localeLabels: Record<Locale, string> = {
  zh: "中文",
  en: "English",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : "zh";
}

export const dictionary = {
  zh: {
    meta: {
      description: "面向个人用户的 AI 信息监控工作台",
    },
    shell: {
      navLabel: "主导航",
      home: "工作台",
      sources: "来源",
      inbox: "简报",
      settings: "设置",
      signedInAs: "当前账号",
      signedOut:
        "登录后可以创建监控目标、管理来源、阅读简报并配置投递。",
      signIn: "登录",
      signOut: "退出",
      language: "语言",
      theme: "主题",
      appearance: "明暗",
      light: "浅色",
      dark: "深色",
      productTagline: "个人信息雷达",
      workspace: "监控工作台",
    },
    home: {
      badge: "个人监控",
      title: "先定义目标，再让系统找信号。",
      description:
        "创建监控目标，选择推荐订阅包，预览首批内容，然后在简报收件箱里持续阅读更新。",
      snapshot: "概览",
      goals: "监控目标",
      unreadBriefs: "未读简报",
      sources: "来源",
      failing: "异常",
      dueNow: "待同步",
      createTitle: "创建监控目标",
      createDescription:
        "用一句话描述要监控的事情。系统会在下一步推荐订阅包和发现来源。",
      titleLabel: "标题",
      titlePlaceholder: "AI 编程工具动向",
      promptLabel: "监控目标",
      promptPlaceholder: "监控 AI 编程工具的新产品、融资和重要更新。",
      createButton: "创建目标",
      assistantTitle: "全局监控助手",
      assistantSubtitle: "基于你的个人简报和原始内容回答问题。",
      goalListTitle: "监控目标",
      goalListDescription: "每个目标都有独立的推荐订阅、来源和简报。",
      goalCount: "个目标",
      emptyGoals: "还没有监控目标。先创建一个目标，然后选择推荐订阅生成首批简报。",
      delete: "删除",
      recentBriefs: "最近简报",
      openInbox: "打开简报箱",
      emptyBriefs: "还没有简报。为监控目标添加订阅并执行首次同步。",
      recentSyncRuns: "最近同步",
      emptySyncRuns: "还没有同步记录。",
      items: "条内容",
      briefs: "份简报",
      taskTypeTopic: "主题监控",
      taskTypeQuestion: "问题监控",
    },
    inbox: {
      badge: "简报收件箱",
      title: "所有简报集中处理。",
      description: "从来源内容和雷达发现中生成的可读简报会汇总到这里。",
      filter: "筛选",
      all: "全部",
      unreadOnly: "仅未读",
      briefCount: "份简报",
      emptyFiltered: "当前筛选条件下没有简报。",
      empty: "还没有简报。请先在来源页同步一个来源。",
      markRead: "标为已读",
      markUnread: "标为未读",
      html: "HTML",
      delete: "删除",
      important: "重要",
      signal: "信号",
      relevance: "相关度",
      whyItMatters: "为什么重要",
    },
    login: {
      badge: "登录",
      title: "进入工作台",
      description: "登录后会写入签名会话，用于访问你的个人监控工作台。",
      signedOut: "会话已清除。",
      accountTitle: "使用账号登录",
      accountDescription: "Google 和 GitHub 使用 OAuth，并复用同一套签名会话。",
      configureOAuth: "配置 OAuth 凭据后即可启用社交登录。",
      operatorEmail: "Operator 邮箱",
      accessCode: "访问码",
      signIn: "登录",
      codeLoginMissing:
        "Operator 登录未配置。可配置 INFLOWEE_SESSION_SECRET、INFLOWEE_OPERATOR_EMAIL、INFLOWEE_OPERATOR_LOGIN_CODE，或配置 OAuth 凭据。",
    },
  },
  en: {
    meta: {
      description: "AI-powered personal monitoring workspace",
    },
    shell: {
      navLabel: "Primary navigation",
      home: "Workspace",
      sources: "Sources",
      inbox: "Briefs",
      settings: "Settings",
      signedInAs: "Signed in",
      signedOut:
        "Sign in to create monitoring goals, manage sources, read briefs, and configure delivery.",
      signIn: "Sign in",
      signOut: "Sign out",
      language: "Language",
      theme: "Theme",
      appearance: "Mode",
      light: "Light",
      dark: "Dark",
      productTagline: "Personal signal radar",
      workspace: "Monitoring workspace",
    },
    home: {
      badge: "Personal monitoring",
      title: "Define the goal first. Let the system find signals.",
      description:
        "Create a monitoring goal, choose recommended subscription packages, preview the first items, then read ongoing updates in your brief inbox.",
      snapshot: "Snapshot",
      goals: "Monitoring goals",
      unreadBriefs: "Unread briefs",
      sources: "Sources",
      failing: "Failing",
      dueNow: "Due now",
      createTitle: "Create a monitoring goal",
      createDescription:
        "Describe what you want to monitor in one sentence. Inflowee will recommend subscription packages and discovery sources next.",
      titleLabel: "Title",
      titlePlaceholder: "AI coding tool moves",
      promptLabel: "Monitoring goal",
      promptPlaceholder:
        "Monitor AI coding tools for new products, funding, and important updates.",
      createButton: "Create goal",
      assistantTitle: "All monitoring assistant",
      assistantSubtitle: "Answers grounded across your personal briefs and source items.",
      goalListTitle: "Monitoring goals",
      goalListDescription:
        "Each goal has its own recommended subscriptions, sources, and briefs.",
      goalCount: "goals",
      emptyGoals:
        "No monitoring goals yet. Create one and choose recommended subscriptions to generate the first briefs.",
      delete: "Delete",
      recentBriefs: "Recent briefs",
      openInbox: "Open inbox",
      emptyBriefs:
        "No briefs yet. Add subscriptions to a monitoring goal and run the first sync.",
      recentSyncRuns: "Recent sync runs",
      emptySyncRuns: "No sync runs yet.",
      items: "items",
      briefs: "briefs",
      taskTypeTopic: "Topic tracking",
      taskTypeQuestion: "Question tracking",
    },
    inbox: {
      badge: "Brief inbox",
      title: "Process every brief in one place.",
      description:
        "Readable briefs generated from source content and radar discovery are collected here.",
      filter: "Filter",
      all: "All",
      unreadOnly: "Unread only",
      briefCount: "briefs",
      emptyFiltered: "No briefs match the current filters.",
      empty: "No briefs yet. Sync a source from the Sources page.",
      markRead: "Mark read",
      markUnread: "Mark unread",
      html: "HTML",
      delete: "Delete",
      important: "Important",
      signal: "Signal",
      relevance: "Relevance",
      whyItMatters: "Why it matters",
    },
    login: {
      badge: "Sign in",
      title: "Open the workspace",
      description:
        "Signing in creates a signed session for your personal monitoring workspace.",
      signedOut: "Session cleared.",
      accountTitle: "Sign in with an account",
      accountDescription: "Google and GitHub use OAuth and share the same signed session.",
      configureOAuth: "Configure OAuth credentials to enable social sign-in buttons.",
      operatorEmail: "Operator email",
      accessCode: "Access code",
      signIn: "Sign in",
      codeLoginMissing:
        "Operator login is not configured yet. Configure INFLOWEE_SESSION_SECRET, INFLOWEE_OPERATOR_EMAIL, INFLOWEE_OPERATOR_LOGIN_CODE, or OAuth provider credentials.",
    },
  },
} as const;

export type Dictionary = (typeof dictionary)[Locale];

export function getDictionary(locale: Locale): Dictionary {
  return dictionary[locale];
}
