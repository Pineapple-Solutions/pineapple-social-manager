// src/app/api/facebook/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createFacebookClient } from '@/lib/facebook';
import { prisma } from '@/lib/db';
import { getTenantFilter } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const fromDb = searchParams.get('source') === 'db';
    const period = (searchParams.get('period') as 'day' | 'week' | 'days_28') ?? 'day';

    const tenantId = scope.tenantId ?? undefined;

    if (fromDb) {
      const where = tenantId ? { account: { tenantId } } : {};
      const metrics = await prisma.facebookMetrics.findMany({
        where,
        orderBy: { date: 'desc' },
        take: 30,
      });
      return NextResponse.json({ success: true, data: metrics });
    }

    const client = await createFacebookClient(tenantId);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Account Facebook non configurato' }, { status: 400 });
    }

    const [profile, insights] = await Promise.all([
      client.getProfile(),
      client.getPageInsights(period).catch(() => [] as Awaited<ReturnType<typeof client.getPageInsights>>),
    ]);

    // Salva snapshot
    const accountWhere = tenantId ? { tenantId, isActive: true } : { isActive: true };
    const account = await prisma.facebookAccount.findFirst({ where: accountWhere });
    if (account) {
      const metricsMap: Record<string, number> = {};
      insights.forEach((m) => {
        const val = m.values?.[m.values.length - 1]?.value;
        // Alcuni endpoint restituiscono oggetti (breakdown per tipo) — in quel caso usa 0
        metricsMap[m.name] = typeof val === 'number' ? val : 0;
      });

      await prisma.facebookMetrics.create({
        data: {
          followersCount: profile.followersCount,
          impressions: metricsMap['page_impressions'] ?? 0,
          reach: metricsMap['page_reach'] ?? 0,
          pageViews: metricsMap['page_views_total'] ?? 0,
          // page_post_engagements sostituisce page_positive_feedback_by_type (deprecata)
          reactions: metricsMap['page_post_engagements'] ?? metricsMap['page_positive_feedback_by_type'] ?? 0,
          accountId: account.id,
        },
      });

      await prisma.facebookAccount.update({
        where: { id: account.id },
        data: { followersCount: profile.followersCount, pageName: profile.name },
      });
    }

    return NextResponse.json({ success: true, data: { profile, insights } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore analytics' }, { status: 500 });
  }
}

