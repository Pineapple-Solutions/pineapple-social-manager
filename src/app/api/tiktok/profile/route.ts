// src/app/api/tiktok/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createTikTokClient } from '@/lib/tiktok';
import { prisma } from '@/lib/db';
import { getTenantFilter } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const tenantId = scope.tenantId ?? undefined;
    const client = await createTikTokClient(tenantId);

    if (!client) {
      return NextResponse.json({ success: false, error: 'Account TikTok non configurato' }, { status: 404 });
    }

    const profile = await client.getProfile();

    // Aggiorna followers nel DB
    const where = tenantId ? { tenantId, isActive: true } : { isActive: true };
    const account = await prisma.tikTokAccount.findFirst({ where });
    if (account) {
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

    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

