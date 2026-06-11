// src/app/api/instagram/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createInstagramClient, createInstagramClientFromEnv } from '@/lib/instagram';
import { prisma } from '@/lib/db';
import { getTenantFilter } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') as 'day' | 'week' | 'days_28') ?? 'day';
    const fromDb = searchParams.get('source') === 'db';

    if (fromDb) {
      // Filtra metriche per tenant tramite l'account associato
      const where = scope.tenantId !== undefined && scope.tenantId !== null
        ? { account: { tenantId: scope.tenantId } }
        : {};
      const metrics = await prisma.instagramMetrics.findMany({
        where,
        orderBy: { date: 'desc' },
        take: 30,
      });
      return NextResponse.json({ success: true, data: metrics });
    }

    // Live da Instagram API — usa account del tenant corretto
    const tenantId = scope.tenantId ?? undefined;
    const tenantWhere = tenantId
      ? { isActive: true, tenantId }
      : { isActive: true };

    const client = (await createInstagramClient(tenantId)) ?? createInstagramClientFromEnv();
    if (!client) {
      return NextResponse.json({ success: false, error: 'Account non configurato' }, { status: 400 });
    }

    const [profile, insights] = await Promise.all([
      client.getProfile(),
      client.getAccountInsights(period),
    ]);

    // Salva snapshot in DB
    const account = await prisma.instagramAccount.findFirst({ where: tenantWhere });
    if (account) {
      const metricsMap: Record<string, number> = {};
      insights.forEach(metric => {
        metricsMap[metric.name] = metric.values?.[metric.values.length - 1]?.value ?? 0;
      });

      await prisma.instagramMetrics.create({
        data: {
          followersCount: profile.followersCount,
          mediaCount: profile.mediaCount,
          // 'views' è il nome usato dalla nuova IG API (IGAA), 'impressions' dalla vecchia (EAA)
          impressions: metricsMap['impressions'] ?? metricsMap['views'] ?? 0,
          reach: metricsMap['reach'] ?? 0,
          profileViews: metricsMap['profile_views'] ?? 0,
          websiteClicks: metricsMap['website_clicks'] ?? 0,
          accountId: account.id,
        },
      });

      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          followersCount: profile.followersCount,
          postsCount: profile.mediaCount,
          username: profile.username,
          profilePicture: profile.profilePictureUrl,
        },
      });
    }

    return NextResponse.json({ success: true, data: { profile, insights } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Errore analytics' },
      { status: 500 }
    );
  }
}
