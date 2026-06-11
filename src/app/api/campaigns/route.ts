// src/app/api/campaigns/route.ts — Campagne (tenant-scoped)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTenantFilter, buildTenantWhere } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('siteId');
    const where: Record<string, unknown> = { ...buildTenantWhere(scope) };
    if (siteId) where.siteId = siteId;

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { posts: true } },
        site: { select: { name: true } },
        tenant: { select: { name: true, slug: true } },
      },
    });
    return NextResponse.json({ success: true, data: campaigns });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const body = await req.json();
    const tenantId = (body.tenantId && body.tenantId.trim() !== '') ? body.tenantId : scope.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant non specificato' }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name: body.name,
        description: body.description,
        goal: body.goal,
        status: 'DRAFT',
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        siteId: body.siteId || null,
      },
    });
    return NextResponse.json({ success: true, data: campaign });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID mancante' }, { status: 400 });

    // Verifica ownership
    if (scope.user.role !== 'master' && scope.tenantId) {
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign || campaign.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }
    }

    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}
