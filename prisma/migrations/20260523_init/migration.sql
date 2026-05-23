-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'local-user',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceMember" (
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceMember_pkey" PRIMARY KEY ("spaceId","userId")
);

-- CreateTable
CREATE TABLE "SpaceInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "acceptedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "relevanceLevel" INTEGER NOT NULL DEFAULT 3,
    "summaryPreference" TEXT NOT NULL DEFAULT 'balanced',
    "taskProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 360,
    "nextSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "summary" TEXT,
    "rawContent" TEXT,
    "origin" TEXT,
    "language" TEXT,
    "contentHash" TEXT NOT NULL,
    "structuredFields" JSONB,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brief" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "sourceCitations" JSONB NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "importanceScore" DOUBLE PRECISION NOT NULL,
    "tagsJson" JSONB NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefRead" (
    "briefId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefRead_pkey" PRIMARY KEY ("briefId","actorId")
);

-- CreateTable
CREATE TABLE "BriefItem" (
    "briefId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "BriefItem_pkey" PRIMARY KEY ("briefId","itemId")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "insertedItemCount" INTEGER NOT NULL DEFAULT 0,
    "createdBriefCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "payloadType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attemptCount" INTEGER,
    "responseStatus" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationBundle" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "bundleJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "provenance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Space_ownerId_createdAt_idx" ON "Space"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "SpaceMember_userId_createdAt_idx" ON "SpaceMember"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceInvite_token_key" ON "SpaceInvite"("token");

-- CreateIndex
CREATE INDEX "SpaceInvite_spaceId_createdAt_idx" ON "SpaceInvite"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SpaceInvite_token_idx" ON "SpaceInvite"("token");

-- CreateIndex
CREATE INDEX "Task_spaceId_createdAt_idx" ON "Task"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Source_taskId_createdAt_idx" ON "Source"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Source_nextSyncAt_status_idx" ON "Source"("nextSyncAt", "status");

-- CreateIndex
CREATE INDEX "Item_sourceId_publishedAt_idx" ON "Item"("sourceId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Item_sourceId_contentHash_key" ON "Item"("sourceId", "contentHash");

-- CreateIndex
CREATE INDEX "Brief_taskId_createdAt_idx" ON "Brief"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "BriefRead_actorId_readAt_idx" ON "BriefRead"("actorId", "readAt");

-- CreateIndex
CREATE INDEX "SyncRun_sourceId_startedAt_idx" ON "SyncRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "DeliveryLog_briefId_startedAt_idx" ON "DeliveryLog"("briefId", "startedAt");

-- CreateIndex
CREATE INDEX "RecommendationBundle_taskId_position_idx" ON "RecommendationBundle"("taskId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_scopeType_scopeId_key" ON "ChatThread"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceInvite" ADD CONSTRAINT "SpaceInvite_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefRead" ADD CONSTRAINT "BriefRead_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationBundle" ADD CONSTRAINT "RecommendationBundle_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

