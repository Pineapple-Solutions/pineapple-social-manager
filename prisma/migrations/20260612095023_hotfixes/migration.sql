-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `logoUrl` TEXT NULL,
    `plan` VARCHAR(50) NOT NULL DEFAULT 'free',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tenant_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'editor',
    `permissions` VARCHAR(5000) NOT NULL DEFAULT '[]',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `otpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `otpSecret` VARCHAR(255) NULL,
    `tenantId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserTenant` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserTenant_userId_tenantId_key`(`userId`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(512) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Config` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Config_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantConfig` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TenantConfig_tenantId_key_key`(`tenantId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIProviderConfig` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `apiKey` TEXT NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `maxTokensPerDay` INTEGER NOT NULL DEFAULT 100000,
    `tokensUsedToday` INTEGER NOT NULL DEFAULT 0,
    `tokenResetAt` DATETIME(3) NULL,
    `maxConcurrentJobs` INTEGER NOT NULL DEFAULT 3,
    `videoModel` VARCHAR(100) NULL,
    `videoEnabled` BOOLEAN NOT NULL DEFAULT false,
    `imageModel` VARCHAR(100) NULL,
    `imageEnabled` BOOLEAN NOT NULL DEFAULT false,
    `fallbackEnabled` BOOLEAN NOT NULL DEFAULT false,
    `usedFor` VARCHAR(5000) NOT NULL DEFAULT '[]',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AIProviderConfig_tenantId_provider_key`(`tenantId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GlobalPromptRule` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `name` VARCHAR(500) NOT NULL,
    `description` TEXT NULL,
    `contentType` VARCHAR(50) NOT NULL DEFAULT 'ALL',
    `rule` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `isNegativePrompt` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoGenerationJob` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `aspectRatio` VARCHAR(20) NOT NULL DEFAULT '9:16',
    `duration` INTEGER NOT NULL DEFAULT 5,
    `provider` VARCHAR(50) NOT NULL DEFAULT 'google',
    `style` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    `videoUrl` TEXT NULL,
    `thumbnailUrl` TEXT NULL,
    `errorMessage` TEXT NULL,
    `estimatedTokens` INTEGER NOT NULL DEFAULT 0,
    `tokensConsumed` INTEGER NOT NULL DEFAULT 0,
    `scheduledRetryAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 3,
    `relatedPostId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `operationName` TEXT NULL,
    `stitchingMeta` TEXT NULL,
    `siteId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FacebookAccount` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `pageId` VARCHAR(191) NOT NULL,
    `pageName` VARCHAR(500) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `profilePicture` TEXT NULL,
    `followersCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FacebookAccount_pageId_key`(`pageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TikTokAccount` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `openId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `displayName` VARCHAR(500) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `refreshToken` TEXT NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `avatarUrl` TEXT NULL,
    `followersCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TikTokAccount_openId_key`(`openId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FacebookMetrics` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `followersCount` INTEGER NOT NULL DEFAULT 0,
    `impressions` INTEGER NOT NULL DEFAULT 0,
    `reach` INTEGER NOT NULL DEFAULT 0,
    `pageViews` INTEGER NOT NULL DEFAULT 0,
    `engagementRate` DOUBLE NOT NULL DEFAULT 0,
    `reactions` INTEGER NOT NULL DEFAULT 0,
    `shares` INTEGER NOT NULL DEFAULT 0,
    `accountId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TikTokMetrics` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `followersCount` INTEGER NOT NULL DEFAULT 0,
    `videoViews` INTEGER NOT NULL DEFAULT 0,
    `likes` INTEGER NOT NULL DEFAULT 0,
    `comments` INTEGER NOT NULL DEFAULT 0,
    `shares` INTEGER NOT NULL DEFAULT 0,
    `profileViews` INTEGER NOT NULL DEFAULT 0,
    `engagementRate` DOUBLE NOT NULL DEFAULT 0,
    `accountId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConnectedSite` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `name` VARCHAR(500) NOT NULL,
    `url` TEXT NOT NULL,
    `description` TEXT NULL,
    `logoUrl` TEXT NULL,
    `niche` VARCHAR(255) NULL,
    `language` VARCHAR(20) NOT NULL DEFAULT 'it',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InstagramAccount` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `username` VARCHAR(255) NOT NULL,
    `businessAccountId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `profilePicture` TEXT NULL,
    `followersCount` INTEGER NOT NULL DEFAULT 0,
    `postsCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InstagramAccount_businessAccountId_key`(`businessAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduledPost` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `platform` VARCHAR(50) NOT NULL DEFAULT 'INSTAGRAM',
    `type` VARCHAR(50) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    `caption` TEXT NULL,
    `hashtags` TEXT NULL,
    `mediaUrls` TEXT NOT NULL,
    `mediaType` VARCHAR(50) NOT NULL DEFAULT 'IMAGE',
    `coverUrl` TEXT NULL,
    `aiGenerated` BOOLEAN NOT NULL DEFAULT false,
    `aiPrompt` TEXT NULL,
    `aiModel` VARCHAR(100) NULL,
    `mediaReady` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    `scheduledAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `instagramPostId` VARCHAR(255) NULL,
    `facebookPostId` VARCHAR(255) NULL,
    `tiktokPostId` VARCHAR(255) NULL,
    `likesCount` INTEGER NULL,
    `commentsCount` INTEGER NULL,
    `reachCount` INTEGER NULL,
    `impressions` INTEGER NULL,
    `siteId` VARCHAR(191) NULL,
    `accountId` VARCHAR(191) NULL,
    `facebookAccountId` VARCHAR(191) NULL,
    `tiktokAccountId` VARCHAR(191) NULL,
    `campaignId` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Campaign` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `name` VARCHAR(500) NOT NULL,
    `description` TEXT NULL,
    `goal` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `siteId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchedulerRule` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `name` VARCHAR(500) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `contentType` VARCHAR(50) NOT NULL DEFAULT 'MIXED',
    `frequency` VARCHAR(50) NOT NULL DEFAULT 'DAILY',
    `postsPerDay` INTEGER NOT NULL DEFAULT 1,
    `storiesPerDay` INTEGER NOT NULL DEFAULT 0,
    `reelsPerWeek` INTEGER NOT NULL DEFAULT 0,
    `preferredTimes` VARCHAR(5000) NOT NULL DEFAULT '[]',
    `timezone` VARCHAR(100) NOT NULL DEFAULT 'Europe/Rome',
    `activeDays` VARCHAR(100) NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
    `contentSource` VARCHAR(50) NOT NULL DEFAULT 'AI',
    `siteUrl` TEXT NULL,
    `aiTone` VARCHAR(100) NOT NULL DEFAULT 'professional',
    `aiLanguage` VARCHAR(20) NOT NULL DEFAULT 'it',
    `aiTopics` VARCHAR(10000) NOT NULL DEFAULT '[]',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InstagramMetrics` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `followersCount` INTEGER NOT NULL DEFAULT 0,
    `followingCount` INTEGER NOT NULL DEFAULT 0,
    `mediaCount` INTEGER NOT NULL DEFAULT 0,
    `impressions` INTEGER NOT NULL DEFAULT 0,
    `reach` INTEGER NOT NULL DEFAULT 0,
    `profileViews` INTEGER NOT NULL DEFAULT 0,
    `websiteClicks` INTEGER NOT NULL DEFAULT 0,
    `engagementRate` DOUBLE NOT NULL DEFAULT 0,
    `avgLikes` DOUBLE NOT NULL DEFAULT 0,
    `avgComments` DOUBLE NOT NULL DEFAULT 0,
    `accountId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentIdea` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `title` VARCHAR(500) NOT NULL,
    `description` TEXT NULL,
    `type` VARCHAR(50) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    `aiGenerated` BOOLEAN NOT NULL DEFAULT true,
    `caption` TEXT NULL,
    `hashtags` TEXT NULL,
    `imagePrompt` TEXT NULL,
    `videoPrompt` TEXT NULL,
    `category` VARCHAR(100) NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `scheduledFor` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAsset` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `url` TEXT NOT NULL,
    `type` VARCHAR(50) NOT NULL DEFAULT 'IMAGE',
    `mimeType` VARCHAR(100) NULL,
    `size` INTEGER NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `alt` VARCHAR(500) NULL,
    `description` TEXT NULL,
    `tags` VARCHAR(5000) NOT NULL DEFAULT '[]',
    `source` VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    `siteId` VARCHAR(191) NULL,
    `originalUrl` TEXT NULL,
    `usedInAI` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GenerationJob` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(50) NOT NULL DEFAULT 'IMAGE',
    `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    `relatedPostId` VARCHAR(191) NULL,
    `payload` TEXT NOT NULL,
    `result` TEXT NULL,
    `priority` INTEGER NOT NULL DEFAULT 50,
    `scheduledFor` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 3,
    `nextRetryAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIGenerationLog` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `type` VARCHAR(100) NOT NULL,
    `provider` VARCHAR(50) NOT NULL DEFAULT 'openai',
    `model` VARCHAR(100) NOT NULL,
    `prompt` TEXT NOT NULL,
    `response` TEXT NOT NULL,
    `tokens` INTEGER NOT NULL DEFAULT 0,
    `durationMs` INTEGER NOT NULL DEFAULT 0,
    `success` BOOLEAN NOT NULL DEFAULT true,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserTenant` ADD CONSTRAINT `UserTenant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserTenant` ADD CONSTRAINT `UserTenant_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantConfig` ADD CONSTRAINT `TenantConfig_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIProviderConfig` ADD CONSTRAINT `AIProviderConfig_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GlobalPromptRule` ADD CONSTRAINT `GlobalPromptRule_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoGenerationJob` ADD CONSTRAINT `VideoGenerationJob_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FacebookAccount` ADD CONSTRAINT `FacebookAccount_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TikTokAccount` ADD CONSTRAINT `TikTokAccount_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FacebookMetrics` ADD CONSTRAINT `FacebookMetrics_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `FacebookAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TikTokMetrics` ADD CONSTRAINT `TikTokMetrics_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `TikTokAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConnectedSite` ADD CONSTRAINT `ConnectedSite_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstagramAccount` ADD CONSTRAINT `InstagramAccount_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledPost` ADD CONSTRAINT `ScheduledPost_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledPost` ADD CONSTRAINT `ScheduledPost_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `ConnectedSite`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledPost` ADD CONSTRAINT `ScheduledPost_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `InstagramAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledPost` ADD CONSTRAINT `ScheduledPost_facebookAccountId_fkey` FOREIGN KEY (`facebookAccountId`) REFERENCES `FacebookAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledPost` ADD CONSTRAINT `ScheduledPost_tiktokAccountId_fkey` FOREIGN KEY (`tiktokAccountId`) REFERENCES `TikTokAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledPost` ADD CONSTRAINT `ScheduledPost_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `ConnectedSite`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchedulerRule` ADD CONSTRAINT `SchedulerRule_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstagramMetrics` ADD CONSTRAINT `InstagramMetrics_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `InstagramAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentIdea` ADD CONSTRAINT `ContentIdea_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GenerationJob` ADD CONSTRAINT `GenerationJob_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GenerationJob` ADD CONSTRAINT `GenerationJob_relatedPostId_fkey` FOREIGN KEY (`relatedPostId`) REFERENCES `ScheduledPost`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
