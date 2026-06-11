// src/app/api/sites/route.ts — Siti collegati (tenant-scoped)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { scrapeSite } from '@/lib/content-scraper';
import { getTenantFilter, hasPermission, PERMISSIONS, buildTenantWhere } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });

    // Costruisce il filtro where — supporta multi-tenant e singolo tenant
    const where = buildTenantWhere(scope);

    const sites = await prisma.connectedSite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { tenant: { select: { name: true, slug: true } } },
    });
    return NextResponse.json({ success: true, data: sites });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const scope = await getTenantFilter(req);
    if (!scope) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    if (!hasPermission(scope.user, PERMISSIONS.CONFIG_WRITE) && !hasPermission(scope.user, PERMISSIONS.POSTS_WRITE)) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    const body = await req.json();

    // Il tenantId viene dal body (master può sceglierlo) o dalla sessione
    const tenantId = (body.tenantId && body.tenantId.trim() !== '') ? body.tenantId : scope.tenantId;
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Seleziona un cliente prima di aggiungere un sito' }, { status: 400 });
    }

    let description = body.description;
    let name = body.name;
    let logoUrl = body.logoUrl as string | undefined;

    if (body.url && (!name || !description || !logoUrl)) {
      const scraped = await scrapeSite(body.url);
      if (scraped.scraped) {
        if (!name) name = scraped.title ?? body.url;
        if (!description) description = scraped.description ?? '';
        if (!logoUrl) logoUrl = scraped.faviconUrl;
      }
    }

    const site = await prisma.connectedSite.create({
      data: {
        tenantId,
        name: name ?? body.url,
        url: body.url,
        description,
        logoUrl: logoUrl ?? null,
        niche: body.niche,
        language: body.language ?? 'it',
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: site });
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

    // Verifica che il sito appartenga al tenant corretto (se non master)
    if (scope.user.role !== 'master' && scope.tenantId) {
      const site = await prisma.connectedSite.findUnique({ where: { id } });
      if (!site || site.tenantId !== scope.tenantId) {
        return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
      }
    }

    await prisma.connectedSite.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Errore' }, { status: 500 });
  }
}
