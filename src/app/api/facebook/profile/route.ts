// src/app/api/facebook/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createFacebookClient } from '@/lib/facebook';
import { prisma } from '@/lib/db';
import { getTenantFilter } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const tenantId = scope.tenantId ?? undefined;
    const client = await createFacebookClient(tenantId);

    if (!client) {
      return NextResponse.json({ success: false, error: 'Account Facebook non configurato' }, { status: 404 });
    }

    const profile = await client.getProfile();

    // Aggiorna followers nel DB
    const where = tenantId ? { tenantId, isActive: true } : { isActive: true };
    const account = await prisma.facebookAccount.findFirst({ where });
    if (account) {
      await prisma.facebookAccount.update({
        where: { id: account.id },
        data: { followersCount: profile.followersCount, pageName: profile.name },
      });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

