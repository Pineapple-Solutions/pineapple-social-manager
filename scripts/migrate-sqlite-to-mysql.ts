/**
 * migrate-sqlite-to-mysql.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Script di migrazione dati: SQLite → MySQL
 *
 * Uso:
 *   npx dotenv -e .env.local -- tsx scripts/migrate-sqlite-to-mysql.ts
 *
 * Il DATABASE_URL in .env.local deve puntare al MySQL di destinazione.
 * Il percorso del file SQLite è hardcoded sotto (SQLITE_PATH).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'path';

const SQLITE_PATH = path.resolve(__dirname, '../prisma/prisma/social-manager.db');

const mysql = new PrismaClient();

// ─── Utility ─────────────────────────────────────────────────────────────────

function parseDate(val: string | number | null | undefined): Date | null {
  if (!val) return null;
  // SQLite può salvare le date come stringa ISO o come timestamp unix (ms o s)
  if (typeof val === 'number') {
    // Se il numero è piccolo (< 10^12) è in secondi, altrimenti millisecondi
    return new Date(val < 1e12 ? val * 1000 : val);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function pd(val: unknown): Date | null {
  return parseDate(val as string | number | null | undefined);
}

function pdRequired(val: unknown): Date {
  return pd(val) ?? new Date();
}

function bool(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  return val === 1 || val === '1' || val === 'true';
}

// ─── Contatore ───────────────────────────────────────────────────────────────

let totalInserted = 0;

async function migrateTable<T>(
  tableName: string,
  rows: T[],
  inserter: (row: T) => Promise<unknown>,
) {
  if (rows.length === 0) {
    console.log(`  ⏭  ${tableName}: vuoto, saltato`);
    return;
  }
  let ok = 0;
  let skip = 0;
  for (const row of rows) {
    try {
      await inserter(row);
      ok++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Ignora duplicati (unique constraint) — già migrati
      if (msg.includes('Unique constraint') || msg.includes('unique constraint')) {
        skip++;
      } else {
        console.warn(`  ⚠  ${tableName} row skip:\n     ${msg.slice(0, 1500)}\n`);
        skip++;
      }
    }
  }
  totalInserted += ok;
  console.log(`  ✔  ${tableName}: ${ok} inseriti, ${skip} saltati`);
}

// ─── FK helpers ──────────────────────────────────────────────────────────────
// Se il record referenziato non esiste su MySQL, ritorna null anziché violare la FK

async function existsSite(id: string | null | undefined) {
  if (!id) return null;
  const r = await mysql.connectedSite.findUnique({ where: { id }, select: { id: true } });
  return r ? id : null;
}
async function existsAccount(id: string | null | undefined) {
  if (!id) return null;
  const r = await mysql.instagramAccount.findUnique({ where: { id }, select: { id: true } });
  return r ? id : null;
}
async function existsFBAccount(id: string | null | undefined) {
  if (!id) return null;
  const r = await mysql.facebookAccount.findUnique({ where: { id }, select: { id: true } });
  return r ? id : null;
}
async function existsTTAccount(id: string | null | undefined) {
  if (!id) return null;
  const r = await mysql.tikTokAccount.findUnique({ where: { id }, select: { id: true } });
  return r ? id : null;
}
async function existsCampaign(id: string | null | undefined) {
  if (!id) return null;
  const r = await mysql.campaign.findUnique({ where: { id }, select: { id: true } });
  return r ? id : null;
}
async function existsPost(id: string | null | undefined) {
  if (!id) return null;
  const r = await mysql.scheduledPost.findUnique({ where: { id }, select: { id: true } });
  return r ? id : null;
}
async function existsTenant(id: string | null | undefined) {
  if (!id) return null;
  const r = await mysql.tenant.findUnique({ where: { id }, select: { id: true } });
  return r ? id : null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Pineapple Social Manager — Migrazione SQLite → MySQL');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SQLite : ${SQLITE_PATH}`);
  console.log(`  MySQL  : ${process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':***@')}`);
  console.log('');

  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  const tenants = sqlite.prepare('SELECT * FROM Tenant').all() as Record<string, unknown>[];
  await migrateTable('Tenant', tenants, (r) =>
    mysql.tenant.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        name: r.name as string,
        slug: r.slug as string,
        logoUrl: (r.logoUrl as string | null) ?? null,
        plan: (r.plan as string) ?? 'free',
        isActive: bool(r.isActive),
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 2. Config ──────────────────────────────────────────────────────────────
  const configs = sqlite.prepare('SELECT * FROM Config').all() as Record<string, unknown>[];
  await migrateTable('Config', configs, (r) =>
    mysql.config.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        key: r.key as string,
        value: r.value as string,
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 3. User ────────────────────────────────────────────────────────────────
  const users = sqlite.prepare('SELECT * FROM User').all() as Record<string, unknown>[];
  await migrateTable('User', users, (r) =>
    mysql.user.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        email: r.email as string,
        password: r.password as string,
        name: r.name as string,
        role: (r.role as string) ?? 'editor',
        permissions: (r.permissions as string) ?? '[]',
        isActive: bool(r.isActive),
        otpEnabled: bool(r.otpEnabled),
        otpSecret: (r.otpSecret as string | null) ?? null,
        tenantId: (r.tenantId as string | null) ?? null,
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 4. UserTenant ──────────────────────────────────────────────────────────
  const userTenants = sqlite.prepare('SELECT * FROM UserTenant').all() as Record<string, unknown>[];
  await migrateTable('UserTenant', userTenants, (r) =>
    mysql.userTenant.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        userId: r.userId as string,
        tenantId: r.tenantId as string,
        createdAt: pdRequired(r.createdAt),
      },
      update: {},
    }),
  );

  // ── 5. Session ─────────────────────────────────────────────────────────────
  const sessions = sqlite.prepare('SELECT * FROM Session').all() as Record<string, unknown>[];
  await migrateTable('Session', sessions, (r) =>
    mysql.session.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        token: r.token as string,
        userId: r.userId as string,
        tenantId: (r.tenantId as string | null) ?? null,
        expiresAt: pdRequired(r.expiresAt),
        createdAt: pdRequired(r.createdAt),
      },
      update: {},
    }),
  );

  // ── 6. TenantConfig ────────────────────────────────────────────────────────
  const tenantConfigs = sqlite.prepare('SELECT * FROM TenantConfig').all() as Record<string, unknown>[];
  await migrateTable('TenantConfig', tenantConfigs, (r) =>
    mysql.tenantConfig.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: r.tenantId as string,
        key: r.key as string,
        value: r.value as string,
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 7. AIProviderConfig ────────────────────────────────────────────────────
  const aiProviders = sqlite.prepare('SELECT * FROM AIProviderConfig').all() as Record<string, unknown>[];
  await migrateTable('AIProviderConfig', aiProviders, (r) =>
    mysql.aIProviderConfig.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: r.tenantId as string,
        provider: r.provider as string,
        apiKey: r.apiKey as string,
        model: r.model as string,
        isActive: bool(r.isActive),
        isDefault: bool(r.isDefault),
        maxTokensPerDay: (r.maxTokensPerDay as number) ?? 100000,
        tokensUsedToday: (r.tokensUsedToday as number) ?? 0,
        tokenResetAt: pd(r.tokenResetAt),
        videoModel: (r.videoModel as string | null) ?? null,
        videoEnabled: bool(r.videoEnabled),
        imageModel: (r.imageModel as string | null) ?? null,
        imageEnabled: bool(r.imageEnabled),
        fallbackEnabled: bool(r.fallbackEnabled),
        usedFor: (r.usedFor as string) ?? '[]',
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 8. GlobalPromptRule ────────────────────────────────────────────────────
  const promptRules = sqlite.prepare('SELECT * FROM GlobalPromptRule').all() as Record<string, unknown>[];
  await migrateTable('GlobalPromptRule', promptRules, (r) =>
    mysql.globalPromptRule.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: (r.tenantId as string | null) ?? null,
        name: r.name as string,
        description: (r.description as string | null) ?? null,
        contentType: (r.contentType as string) ?? 'ALL',
        rule: r.rule as string,
        isActive: bool(r.isActive),
        priority: (r.priority as number) ?? 0,
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 9. FacebookAccount ─────────────────────────────────────────────────────
  const fbAccounts = sqlite.prepare('SELECT * FROM FacebookAccount').all() as Record<string, unknown>[];
  await migrateTable('FacebookAccount', fbAccounts, (r) =>
    mysql.facebookAccount.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: (r.tenantId as string | null) ?? null,
        pageId: r.pageId as string,
        pageName: r.pageName as string,
        accessToken: r.accessToken as string,
        profilePicture: (r.profilePicture as string | null) ?? null,
        followersCount: (r.followersCount as number) ?? 0,
        isActive: bool(r.isActive),
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 10. TikTokAccount ──────────────────────────────────────────────────────
  const ttAccounts = sqlite.prepare('SELECT * FROM TikTokAccount').all() as Record<string, unknown>[];
  await migrateTable('TikTokAccount', ttAccounts, (r) =>
    mysql.tikTokAccount.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: (r.tenantId as string | null) ?? null,
        openId: r.openId as string,
        username: r.username as string,
        displayName: r.displayName as string,
        accessToken: r.accessToken as string,
        refreshToken: (r.refreshToken as string | null) ?? null,
        tokenExpiresAt: pd(r.tokenExpiresAt),
        avatarUrl: (r.avatarUrl as string | null) ?? null,
        followersCount: (r.followersCount as number) ?? 0,
        isActive: bool(r.isActive),
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 11. InstagramAccount ───────────────────────────────────────────────────
  const igAccounts = sqlite.prepare('SELECT * FROM InstagramAccount').all() as Record<string, unknown>[];
  await migrateTable('InstagramAccount', igAccounts, (r) =>
    mysql.instagramAccount.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: (r.tenantId as string | null) ?? null,
        username: r.username as string,
        businessAccountId: r.businessAccountId as string,
        accessToken: r.accessToken as string,
        tokenExpiresAt: pd(r.tokenExpiresAt),
        profilePicture: (r.profilePicture as string | null) ?? null,
        followersCount: (r.followersCount as number) ?? 0,
        postsCount: (r.postsCount as number) ?? 0,
        isActive: bool(r.isActive),
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 12. ConnectedSite ──────────────────────────────────────────────────────
  const sites = sqlite.prepare('SELECT * FROM ConnectedSite').all() as Record<string, unknown>[];
  await migrateTable('ConnectedSite', sites, async (r) => {
    const tenantId = await existsTenant(r.tenantId as string | null);
    return mysql.connectedSite.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId,
        name: r.name as string,
        url: r.url as string,
        description: (r.description as string | null) ?? null,
        logoUrl: (r.logoUrl as string | null) ?? null,
        niche: (r.niche as string | null) ?? null,
        language: (r.language as string) ?? 'it',
        isActive: bool(r.isActive),
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    });
  });

  // ── 13. Campaign ───────────────────────────────────────────────────────────
  const campaigns = sqlite.prepare('SELECT * FROM Campaign').all() as Record<string, unknown>[];
  await migrateTable('Campaign', campaigns, (r) =>
    mysql.campaign.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: (r.tenantId as string | null) ?? null,
        name: r.name as string,
        description: (r.description as string | null) ?? null,
        goal: (r.goal as string | null) ?? null,
        status: (r.status as string) ?? 'ACTIVE',
        startDate: pd(r.startDate),
        endDate: pd(r.endDate),
        siteId: (r.siteId as string | null) ?? null,
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 14. SchedulerRule ──────────────────────────────────────────────────────
  const schedulerRules = sqlite.prepare('SELECT * FROM SchedulerRule').all() as Record<string, unknown>[];
  await migrateTable('SchedulerRule', schedulerRules, (r) =>
    mysql.schedulerRule.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: (r.tenantId as string | null) ?? null,
        name: r.name as string,
        description: (r.description as string | null) ?? null,
        isActive: bool(r.isActive),
        contentType: (r.contentType as string) ?? 'MIXED',
        frequency: (r.frequency as string) ?? 'DAILY',
        postsPerDay: (r.postsPerDay as number) ?? 1,
        storiesPerDay: (r.storiesPerDay as number) ?? 0,
        reelsPerWeek: (r.reelsPerWeek as number) ?? 0,
        preferredTimes: (r.preferredTimes as string) ?? '[]',
        timezone: (r.timezone as string) ?? 'Europe/Rome',
        activeDays: (r.activeDays as string) ?? '[1,2,3,4,5,6,7]',
        contentSource: (r.contentSource as string) ?? 'AI',
        siteUrl: (r.siteUrl as string | null) ?? null,
        aiTone: (r.aiTone as string) ?? 'professional',
        aiLanguage: (r.aiLanguage as string) ?? 'it',
        aiTopics: (r.aiTopics as string) ?? '[]',
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 15. ScheduledPost ──────────────────────────────────────────────────────
  const posts = sqlite.prepare('SELECT * FROM ScheduledPost').all() as Record<string, unknown>[];
  await migrateTable('ScheduledPost', posts, async (r) => {
    const [siteId, accountId, facebookAccountId, tiktokAccountId, campaignId] = await Promise.all([
      existsSite(r.siteId as string | null),
      existsAccount(r.accountId as string | null),
      existsFBAccount(r.facebookAccountId as string | null),
      existsTTAccount(r.tiktokAccountId as string | null),
      existsCampaign(r.campaignId as string | null),
    ]);
    return mysql.scheduledPost.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: (r.tenantId as string | null) ?? null,
        platform: (r.platform as string) ?? 'INSTAGRAM',
        type: r.type as string,
        status: (r.status as string) ?? 'DRAFT',
        caption: (r.caption as string | null) ?? null,
        hashtags: (r.hashtags as string | null) ?? null,
        mediaUrls: (r.mediaUrls as string) ?? '[]',
        mediaType: (r.mediaType as string) ?? 'IMAGE',
        coverUrl: (r.coverUrl as string | null) ?? null,
        aiGenerated: bool(r.aiGenerated),
        aiPrompt: (r.aiPrompt as string | null) ?? null,
        aiModel: (r.aiModel as string | null) ?? null,
        mediaReady: (r.mediaReady as string) ?? 'PENDING',
        scheduledAt: pd(r.scheduledAt),
        publishedAt: pd(r.publishedAt),
        instagramPostId: (r.instagramPostId as string | null) ?? null,
        facebookPostId: (r.facebookPostId as string | null) ?? null,
        tiktokPostId: (r.tiktokPostId as string | null) ?? null,
        likesCount: (r.likesCount as number | null) ?? null,
        commentsCount: (r.commentsCount as number | null) ?? null,
        reachCount: (r.reachCount as number | null) ?? null,
        impressions: (r.impressions as number | null) ?? null,
        siteId,
        accountId,
        facebookAccountId,
        tiktokAccountId,
        campaignId,
        error: (r.error as string | null) ?? null,
        retryCount: (r.retryCount as number) ?? 0,
        notes: (r.notes as string | null) ?? null,
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    });
  });

  // ── 16. VideoGenerationJob ─────────────────────────────────────────────────
  const videoJobs = sqlite.prepare('SELECT * FROM VideoGenerationJob').all() as Record<string, unknown>[];
  await migrateTable('VideoGenerationJob', videoJobs, (r) =>
    mysql.videoGenerationJob.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: r.tenantId as string,
        prompt: r.prompt as string,
        aspectRatio: (r.aspectRatio as string) ?? '9:16',
        duration: (r.duration as number) ?? 5,
        provider: (r.provider as string) ?? 'google',
        style: (r.style as string | null) ?? null,
        status: (r.status as string) ?? 'PENDING',
        videoUrl: (r.videoUrl as string | null) ?? null,
        thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
        errorMessage: (r.errorMessage as string | null) ?? null,
        estimatedTokens: (r.estimatedTokens as number) ?? 0,
        tokensConsumed: (r.tokensConsumed as number) ?? 0,
        scheduledRetryAt: pd(r.scheduledRetryAt),
        attempts: (r.attempts as number) ?? 0,
        maxAttempts: (r.maxAttempts as number) ?? 3,
        relatedPostId: (r.relatedPostId as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        operationName: (r.operationName as string | null) ?? null,
        siteId: (r.siteId as string | null) ?? null,
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 17. ContentIdea ────────────────────────────────────────────────────────
  const ideas = sqlite.prepare('SELECT * FROM ContentIdea').all() as Record<string, unknown>[];
  await migrateTable('ContentIdea', ideas, (r) =>
    mysql.contentIdea.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: (r.tenantId as string | null) ?? null,
        title: r.title as string,
        description: (r.description as string | null) ?? null,
        type: r.type as string,
        status: (r.status as string) ?? 'PENDING',
        aiGenerated: bool(r.aiGenerated),
        caption: (r.caption as string | null) ?? null,
        hashtags: (r.hashtags as string | null) ?? null,
        imagePrompt: (r.imagePrompt as string | null) ?? null,
        videoPrompt: (r.videoPrompt as string | null) ?? null,
        category: (r.category as string | null) ?? null,
        priority: (r.priority as number) ?? 0,
        scheduledFor: pd(r.scheduledFor),
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 18. MediaAsset ─────────────────────────────────────────────────────────
  const mediaAssets = sqlite.prepare('SELECT * FROM MediaAsset').all() as Record<string, unknown>[];
  await migrateTable('MediaAsset', mediaAssets, (r) =>
    mysql.mediaAsset.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: r.tenantId as string,
        name: r.name as string,
        url: r.url as string,
        type: (r.type as string) ?? 'IMAGE',
        mimeType: (r.mimeType as string | null) ?? null,
        size: (r.size as number | null) ?? null,
        width: (r.width as number | null) ?? null,
        height: (r.height as number | null) ?? null,
        alt: (r.alt as string | null) ?? null,
        description: (r.description as string | null) ?? null,
        tags: (r.tags as string) ?? '[]',
        source: (r.source as string) ?? 'MANUAL',
        siteId: (r.siteId as string | null) ?? null,
        originalUrl: (r.originalUrl as string | null) ?? null,
        usedInAI: bool(r.usedInAI),
        isActive: bool(r.isActive),
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    }),
  );

  // ── 19. GenerationJob ──────────────────────────────────────────────────────
  const genJobs = sqlite.prepare('SELECT * FROM GenerationJob').all() as Record<string, unknown>[];
  await migrateTable('GenerationJob', genJobs, async (r) => {
    const relatedPostId = await existsPost(r.relatedPostId as string | null);
    return mysql.generationJob.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: r.tenantId as string,
        type: (r.type as string) ?? 'IMAGE',
        status: (r.status as string) ?? 'PENDING',
        relatedPostId,
        payload: (r.payload as string) ?? '{}',
        result: (r.result as string | null) ?? null,
        priority: (r.priority as number) ?? 50,
        scheduledFor: pd(r.scheduledFor),
        errorMessage: (r.errorMessage as string | null) ?? null,
        attempts: (r.attempts as number) ?? 0,
        maxAttempts: (r.maxAttempts as number) ?? 3,
        nextRetryAt: pd(r.nextRetryAt),
        createdAt: pdRequired(r.createdAt),
        updatedAt: pdRequired(r.updatedAt),
      },
      update: {},
    });
  });

  // ── 20. InstagramMetrics ───────────────────────────────────────────────────
  const igMetrics = sqlite.prepare('SELECT * FROM InstagramMetrics').all() as Record<string, unknown>[];
  await migrateTable('InstagramMetrics', igMetrics, (r) =>
    mysql.instagramMetrics.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        date: pdRequired(r.date),
        followersCount: (r.followersCount as number) ?? 0,
        followingCount: (r.followingCount as number) ?? 0,
        mediaCount: (r.mediaCount as number) ?? 0,
        impressions: (r.impressions as number) ?? 0,
        reach: (r.reach as number) ?? 0,
        profileViews: (r.profileViews as number) ?? 0,
        websiteClicks: (r.websiteClicks as number) ?? 0,
        engagementRate: (r.engagementRate as number) ?? 0,
        avgLikes: (r.avgLikes as number) ?? 0,
        avgComments: (r.avgComments as number) ?? 0,
        accountId: r.accountId as string,
        createdAt: pdRequired(r.createdAt),
      },
      update: {},
    }),
  );

  // ── 21. FacebookMetrics ────────────────────────────────────────────────────
  const fbMetrics = sqlite.prepare('SELECT * FROM FacebookMetrics').all() as Record<string, unknown>[];
  await migrateTable('FacebookMetrics', fbMetrics, (r) =>
    mysql.facebookMetrics.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        date: pdRequired(r.date),
        followersCount: (r.followersCount as number) ?? 0,
        impressions: (r.impressions as number) ?? 0,
        reach: (r.reach as number) ?? 0,
        pageViews: (r.pageViews as number) ?? 0,
        engagementRate: (r.engagementRate as number) ?? 0,
        reactions: (r.reactions as number) ?? 0,
        shares: (r.shares as number) ?? 0,
        accountId: r.accountId as string,
        createdAt: pdRequired(r.createdAt),
      },
      update: {},
    }),
  );

  // ── 22. TikTokMetrics ──────────────────────────────────────────────────────
  const ttMetrics = sqlite.prepare('SELECT * FROM TikTokMetrics').all() as Record<string, unknown>[];
  await migrateTable('TikTokMetrics', ttMetrics, (r) =>
    mysql.tikTokMetrics.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        date: pdRequired(r.date),
        followersCount: (r.followersCount as number) ?? 0,
        videoViews: (r.videoViews as number) ?? 0,
        likes: (r.likes as number) ?? 0,
        comments: (r.comments as number) ?? 0,
        shares: (r.shares as number) ?? 0,
        profileViews: (r.profileViews as number) ?? 0,
        engagementRate: (r.engagementRate as number) ?? 0,
        accountId: r.accountId as string,
        createdAt: pdRequired(r.createdAt),
      },
      update: {},
    }),
  );

  // ── 23. AIGenerationLog ────────────────────────────────────────────────────
  const aiLogs = sqlite.prepare('SELECT * FROM AIGenerationLog').all() as Record<string, unknown>[];
  await migrateTable('AIGenerationLog', aiLogs, (r) =>
    mysql.aIGenerationLog.upsert({
      where: { id: r.id as string },
      create: {
        id: r.id as string,
        tenantId: (r.tenantId as string | null) ?? null,
        type: r.type as string,
        provider: (r.provider as string) ?? 'openai',
        model: r.model as string,
        prompt: r.prompt as string,
        response: r.response as string,
        tokens: (r.tokens as number) ?? 0,
        durationMs: (r.durationMs as number) ?? 0,
        success: bool(r.success),
        error: (r.error as string | null) ?? null,
        createdAt: pdRequired(r.createdAt),
      },
      update: {},
    }),
  );

  // ─── Fine ──────────────────────────────────────────────────────────────────
  sqlite.close();
  await mysql.$disconnect();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ✅  Migrazione completata! Totale record inseriti: ${totalInserted}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

main().catch((e) => {
  console.error('\n❌ Errore durante la migrazione:\n', e);
  process.exit(1);
});

