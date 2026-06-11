// src/app/api/tiktok/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createTikTokClient } from '@/lib/tiktok';
import { prisma } from '@/lib/db';
import { getTenantFilter } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const fromDb = searchParams.get('source') === 'db';
    const tenantId = scope.tenantId ?? undefined;

    if (fromDb) {
      const where = tenantId ? { account: { tenantId } } : {};
      const metrics = await prisma.tikTokMetrics.findMany({
        where,
        orderBy: { date: 'desc' },
        take: 30,
      });
      return NextResponse.json({ success: true, data: metrics });
    }

    const client = await createTikTokClient(tenantId);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Account TikTok non configurato' }, { status: 400 });
    }

    const profile = await client.getProfile();

    // Salva snapshot
    const accountWhere = tenantId ? { tenantId, isActive: true } : { isActive: true };
    const account = await prisma.tikTokAccount.findFirst({ where: accountWhere });
    if (account) {
      await prisma.tikTokMetrics.create({
        data: {
          followersCount: profile.followersCount,
          accountId: account.id,
        },
      });
      await prisma.tikTokAccount.update({
        where: { id: account.id },
        data: {
          followersCount: profile.followersCount,
          displayName: profile.displayName,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
        },
      });
    }

    return NextResponse.json({ success: true, data: { profile } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore analytics' }, { status: 500 });
  }
}

