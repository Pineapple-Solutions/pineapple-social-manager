// src/app/api/dashboard/stats/route.ts — Statistiche dashboard (tenant-scoped)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTenantFilter, buildTenantWhere } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Build tenant-scoped where clauses
    const siteId = req.nextUrl.searchParams.get('siteId');
    const tWhere = buildTenantWhere(scope);
    const postBase: Record<string, unknown> = { ...tWhere };
    if (siteId) postBase.siteId = siteId;

    const [
      totalScheduled, publishedToday, pendingApproval, failedPosts,
      postsThisWeek, storiesThisWeek, latestIGMetrics,
      igAccount, fbAccounts, ttAccounts, recentPosts,
    ] = await Promise.all([
      prisma.scheduledPost.count({ where: { ...postBase, status: 'SCHEDULED' } }),
      prisma.scheduledPost.count({ where: { ...postBase, status: 'PUBLISHED', publishedAt: { gte: startOfDay } } }),
      prisma.scheduledPost.count({ where: { ...postBase, status: 'DRAFT' } }),
      prisma.scheduledPost.count({ where: { ...postBase, status: 'FAILED' } }),
      prisma.scheduledPost.count({ where: { ...postBase, type: 'POST', status: { in: ['SCHEDULED', 'PUBLISHED'] }, createdAt: { gte: startOfWeek } } }),
      prisma.scheduledPost.count({ where: { ...postBase, type: 'STORY', status: { in: ['SCHEDULED', 'PUBLISHED'] }, createdAt: { gte: startOfWeek } } }),
      prisma.instagramMetrics.findFirst({ orderBy: { date: 'desc' } }),
      prisma.instagramAccount.findFirst({ where: { isActive: true, ...tWhere } }),
      prisma.facebookAccount.findMany({ where: { isActive: true, ...tWhere }, select: { followersCount: true } }),
      prisma.tikTokAccount.findMany({ where: { isActive: true, ...tWhere }, select: { followersCount: true } }),
      prisma.scheduledPost.findMany({
        where: { ...postBase, status: { in: ['SCHEDULED', 'PUBLISHED'] } },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: { account: { select: { username: true } } },
      }),
    ]);

    // Somma follower da tutte le piattaforme
    const igFollowers = igAccount?.followersCount ?? 0;
    const fbFollowers = fbAccounts.reduce((sum, a) => sum + (a.followersCount ?? 0), 0);
    const ttFollowers = ttAccounts.reduce((sum, a) => sum + (a.followersCount ?? 0), 0);
    const totalFollowers = igFollowers + fbFollowers + ttFollowers;

    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
    const oldMetrics = await prisma.instagramMetrics.findFirst({
      where: { date: { lte: sevenDaysAgo } },
      orderBy: { date: 'desc' },
    });

    const oldFollowers = oldMetrics?.followersCount ?? igFollowers;
    const followersGrowth = oldFollowers > 0 ? ((igFollowers - oldFollowers) / oldFollowers) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalScheduled, publishedToday, pendingApproval, failedPosts,
        totalFollowers,
        followersGrowth: Math.round(followersGrowth * 10) / 10,
        avgEngagementRate: latestIGMetrics?.engagementRate ?? 0,
        postsThisWeek, storiesThisWeek,
        account: igAccount, recentPosts, latestMetrics: latestIGMetrics,
        platformsConnected: {
          instagram: !!igAccount,
          facebook: fbAccounts.length > 0,
          tiktok: ttAccounts.length > 0,
        },
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}
