-- AlterTable
ALTER TABLE "DeliveryLog" ADD COLUMN "htmlPublicationId" TEXT;
ALTER TABLE "DeliveryLog" ADD COLUMN "htmlUrl" TEXT;
ALTER TABLE "DeliveryLog" ADD COLUMN "htmlStatus" TEXT;

-- CreateTable
CREATE TABLE "HtmlPushConfig" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "entitlementStatus" TEXT NOT NULL DEFAULT 'available',
    "stylePreset" TEXT NOT NULL DEFAULT 'minimal_news',
    "modulePreset" TEXT NOT NULL DEFAULT 'standard_summary',
    "enabledModulesJson" JSONB NOT NULL,
    "customPrompt" TEXT,
    "publishTarget" TEXT NOT NULL DEFAULT 'github',
    "githubTokenEncrypted" TEXT,
    "githubRepo" TEXT,
    "githubBranch" TEXT NOT NULL DEFAULT 'main',
    "githubBasePath" TEXT NOT NULL DEFAULT 'inflowee/html',
    "publicBaseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HtmlPushConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicHtmlPushConfig" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "useGlobal" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "stylePreset" TEXT NOT NULL DEFAULT 'minimal_news',
    "modulePreset" TEXT NOT NULL DEFAULT 'standard_summary',
    "enabledModulesJson" JSONB NOT NULL,
    "customPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicHtmlPushConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HtmlPublication" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "briefId" TEXT,
    "reportId" TEXT,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "deliveryLogId" TEXT,
    "status" TEXT NOT NULL,
    "title" TEXT,
    "html" TEXT,
    "htmlUrl" TEXT,
    "publishTarget" TEXT NOT NULL DEFAULT 'github',
    "publishPath" TEXT,
    "commitSha" TEXT,
    "error" TEXT,
    "styleConfigJson" JSONB NOT NULL,
    "moduleConfigJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "HtmlPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HtmlPushConfig_ownerId_key" ON "HtmlPushConfig"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicHtmlPushConfig_topicId_key" ON "TopicHtmlPushConfig"("topicId");

-- CreateIndex
CREATE INDEX "HtmlPublication_ownerId_createdAt_idx" ON "HtmlPublication"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "HtmlPublication_topicId_createdAt_idx" ON "HtmlPublication"("topicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HtmlPublication_contentType_contentId_key" ON "HtmlPublication"("contentType", "contentId");

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_htmlPublicationId_fkey" FOREIGN KEY ("htmlPublicationId") REFERENCES "HtmlPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicHtmlPushConfig" ADD CONSTRAINT "TopicHtmlPushConfig_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HtmlPublication" ADD CONSTRAINT "HtmlPublication_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HtmlPublication" ADD CONSTRAINT "HtmlPublication_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HtmlPublication" ADD CONSTRAINT "HtmlPublication_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
